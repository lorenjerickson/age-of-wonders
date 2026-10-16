import { assertWorldGovernedConformance } from "./definition-conformance";
import {
  Entity,
  type DeepReadonly,
  type ValidationIssue,
  type ValidationContext,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
  copyEntityData,
} from "./entity";

/** Existing persisted authored content, including incomplete drafts and extensions. */
export type WorldDefinitionState = Record<string, unknown>;
export interface WorldDefinitionRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly payload: unknown;
}
export interface WorldDefinitionValidationContext extends ValidationContext {
  /** An already authorized capture; World never loads or authorizes external records. */
  readonly records?: readonly WorldDefinitionRecord[];
  /** Adapter-owned child diagnostics bound to the exact content and capture checked. */
  readonly relatedValidation?: {
    readonly content: unknown;
    readonly records: readonly WorldDefinitionRecord[];
    readonly issues: readonly WorldDefinitionValidationIssue[];
  };
}
export interface WorldDefinitionValidationIssue extends ValidationIssue {
  readonly subject: string;
}
export type WorldDefinitionCommands = {
  replaceContent: {
    params: { content: WorldDefinitionState };
    context: Record<string, never>;
  };
};
export type WorldDefinitionEvents = {
  contentReplaced: { rootLocationId?: string };
};
export interface WorldDefinitionCollections {
  readonly locationIds: readonly string[];
  readonly definitionIds: readonly string[];
  readonly schemaDefinitionIds: readonly string[];
  readonly worldPlacementDefinitionIds: readonly string[];
  readonly modelSchemaReleaseIds: readonly string[];
}

/** World owns authored membership and hierarchy; child entities own their own policies. */
export class WorldDefinition extends Entity<
  WorldDefinitionState,
  WorldDefinitionCommands,
  WorldDefinitionEvents,
  WorldDefinitionValidationContext
> {
  static assertGovernedConformance = assertWorldGovernedConformance;
  private constructor(
    data: WorldDefinitionState,
    context: WorldDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super(
      "world-definition",
      data,
      ["contentReplaced"],
      WorldDefinition.normalizeContext(context),
      options,
    );
    this.validate(context);
  }
  override validate(context: WorldDefinitionValidationContext): void {
    super.validate(WorldDefinition.normalizeContext(context));
  }
  /** World revision content is persisted separately from authorized resource captures. */
  static createContent(
    rootLocationId: string,
    modelSchemaReleaseIds: readonly string[],
  ): WorldDefinitionState {
    return {
      rootLocationId,
      locationIds: [rootLocationId],
      definitionIds: [],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: [],
      modelSchemaReleaseIds: [...modelSchemaReleaseIds],
    };
  }
  static withMember(
    content: WorldDefinitionState,
    collection: keyof WorldDefinitionCollections,
    id: string,
  ): WorldDefinitionState {
    const ids = this.mutableMembers(content, collection);
    return copyEntityData({
      ...content,
      [collection]: [...new Set([...ids, id])],
    });
  }
  static withoutMember(
    content: WorldDefinitionState,
    collection: keyof WorldDefinitionCollections,
    id: string,
  ): WorldDefinitionState {
    return copyEntityData({
      ...content,
      [collection]: this.mutableMembers(content, collection).filter(
        (value) => value !== id,
      ),
    });
  }
  /**
   * Transitional adapter entry point: Placement validates shape first; World owns
   * the resulting membership policy. Callers feed these diagnostics into bound
   * relatedValidation evidence so consumers read aggregate validity from state.
   */
  static placementReferenceIssues(
    record: WorldDefinitionRecord,
    collections: Pick<
      WorldDefinitionCollections,
      "locationIds" | "definitionIds"
    >,
    records: readonly WorldDefinitionRecord[],
  ): readonly WorldDefinitionValidationIssue[] {
    const payload = record.payload;
    if (!this.isObject(payload) || !this.isObject(payload.source)) return [];
    const subject = this.recordName(record);
    const issues: WorldDefinitionValidationIssue[] = [];
    if (!collections.locationIds.includes(payload.locationId as string)) {
      issues.push({
        code: "world-placement-location-not-found",
        subject,
        message:
          "The placement Location is not present in this World revision.",
      });
    }
    const captured = new Map(
      records.map((candidate) => [
        `${candidate.resourceType.trim()}\0${candidate.sourceId.trim()}`,
        candidate.payload,
      ]),
    );
    const definitions = new Map(
      collections.definitionIds.map((id) => [
        id,
        captured.get(`definitions\0${id}`),
      ]),
    );
    const source = payload.source;
    let exists = false;
    if (source.kind === "world-character") {
      exists = captured.has(
        `world-character-templates\0${source.characterTemplateId}`,
      );
    } else if (source.kind === "world-creature") {
      const id = source.creatureId as string;
      const definition = definitions.get(id);
      exists =
        definition === undefined
          ? !definitions.has(id) && captured.has(`creatures\0${id}`)
          : this.isObject(definition) && definition.kind === "creature";
    } else if (source.kind === "world-item") {
      const definition = definitions.get(source.itemDefinitionId as string);
      exists = this.isObject(definition) && definition.kind === "item";
    } else {
      exists = definitions.has(source.definitionId as string);
    }
    if (!exists)
      issues.push({
        code: "world-placement-source-not-found",
        subject,
        message:
          "The placed Creature, Item, or registered content is not present in this World revision.",
      });
    return issues;
  }
  static hierarchyPlacementIssue(
    _content: unknown,
    records: readonly WorldDefinitionRecord[],
    id: string,
    parentId?: string,
  ): string | undefined {
    const parents = new Map<string, string>();
    for (const record of records) {
      if (
        record.resourceType.trim() !== "locations" ||
        !this.isObject(record.payload)
      )
        continue;
      const placement = record.payload.placement;
      if (
        this.isObject(placement) &&
        placement.kind === "within-parent" &&
        typeof placement.parentLocationId === "string"
      )
        parents.set(record.sourceId.trim(), placement.parentLocationId);
    }
    const seen = new Set<string>();
    let cursor = parentId;
    while (cursor && !seen.has(cursor)) {
      if (cursor === id)
        return "The Location hierarchy cannot contain a cycle.";
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
    return undefined;
  }
  static deserialize(
    value: unknown,
    context: WorldDefinitionValidationContext = {},
    options?: EntityOptions,
  ): WorldDefinition {
    let payload = value;
    if (this.isObject(value) && value.type === "world-definition") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported World Definition schema version.");
      payload = value.data;
    }
    return this.deserializePayload(payload, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: WorldDefinitionValidationContext = {},
    options?: EntityOptions,
  ): WorldDefinition {
    if (!this.isObject(value) || !this.isJson(value))
      throw new TypeError("The complete World content must be bounded JSON.");
    return new WorldDefinition(value, context, options);
  }
  serializePayload(): WorldDefinitionState {
    return this.serialize().data;
  }
  /** Invalid collections are unavailable, matching authoring publication diagnostics. */
  publicationCollections(): WorldDefinitionCollections {
    const data = this.state.data;
    const read = (field: string) =>
      WorldDefinition.stringArray(data, field, () => {});
    return {
      locationIds: read("locationIds"),
      definitionIds: read("definitionIds"),
      schemaDefinitionIds: read("schemaDefinitionIds"),
      worldPlacementDefinitionIds: read("worldPlacementDefinitionIds"),
      modelSchemaReleaseIds: read("modelSchemaReleaseIds"),
    };
  }
  protected handleCommand<K extends keyof WorldDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<WorldDefinitionCommands[K]>,
  ): EntityTransition<WorldDefinitionState, WorldDefinitionEvents> {
    if (name !== "replaceContent")
      throw new TypeError("Unknown World Definition command.");
    const data = invocation.params.content;
    if (!WorldDefinition.isObject(data) || !WorldDefinition.isJson(data))
      throw new TypeError("The complete World content must be bounded JSON.");
    return WorldDefinition.same(data, this.state.data)
      ? { data }
      : {
          data,
          events: [
            {
              name: "contentReplaced",
              context:
                typeof data.rootLocationId === "string"
                  ? { rootLocationId: data.rootLocationId }
                  : {},
            },
          ],
        };
  }
  protected validateState(
    content: DeepReadonly<WorldDefinitionState>,
    context: WorldDefinitionValidationContext,
  ): readonly WorldDefinitionValidationIssue[] {
    const issues: WorldDefinitionValidationIssue[] = [];
    const add = (code: string, subject: string, message: string) => {
      issues.push({ code, subject, message });
    };
    const {
      isObject,
      recordName,
      stringField,
      stringArray,
      requireRecord,
      validateLocationGraph,
    } = WorldDefinition;
    const records = context.records ?? [];
    const ids = new Set<string>();
    const recordIdentities = new Set<string>();
    const byId = new Map<string, WorldDefinitionRecord>();
    for (const record of records) {
      const subject = recordName(record);
      if (record.resourceType.trim() === "world-definition-revision") {
        add(
          "reserved-record",
          subject,
          "The authoritative revision record is server-owned.",
        );
      }
      if (
        !WorldDefinition.isJson(record.payload) ||
        (context as NormalizedContext).invalidRecordIds?.includes(
          keyFor(record),
        )
      ) {
        add(
          "record-invalid",
          subject,
          "The captured resource must be bounded JSON.",
        );
      }
      const key = `${record.resourceType.trim()}\0${record.sourceId.trim()}\0${record.sourceRevision ?? ""}`;
      const identityKey = `${record.resourceType.trim()}\0${record.sourceId.trim()}`;
      if (ids.has(key) || recordIdentities.has(identityKey))
        add(
          "duplicate-record",
          subject,
          "The same captured resource appears more than once.",
        );
      ids.add(key);
      recordIdentities.add(identityKey);
      byId.set(
        `${record.resourceType.trim()}\0${record.sourceId.trim()}`,
        record,
      );
    }
    const root = stringField(content, "rootLocationId");
    const locations = stringArray(content, "locationIds", add);
    const definitions = stringArray(content, "definitionIds", add);
    const schemas = stringArray(content, "schemaDefinitionIds", add);
    const worldPlacements = stringArray(
      content,
      "worldPlacementDefinitionIds",
      add,
    );
    const modelReleases = stringArray(content, "modelSchemaReleaseIds", add);
    if (modelReleases.length === 0)
      add(
        "model-release-missing",
        "World draft",
        "At least one exact Model Schema release is required.",
      );
    if (!root)
      add("root-missing", "World draft", "A root Location is required.");
    if (root && !locations.includes(root))
      add(
        "root-not-declared",
        "World draft",
        "The root Location must be in the Location collection.",
      );
    for (const id of locations)
      requireRecord(byId, "locations", id, "Location", add);
    for (const id of definitions)
      requireRecord(byId, "definitions", id, "Definition", add);
    for (const id of schemas) {
      if (
        !byId.has(`extension-schemas\0${id}`) &&
        !byId.has(`definitions\0${id}`)
      ) {
        add(
          "schema-record-missing",
          "World draft",
          "A declared schema is missing from the capture.",
        );
      }
    }
    const rootRecord = root ? byId.get(`locations\0${root}`) : undefined;
    if (rootRecord && isObject(rootRecord.payload)) {
      if (rootRecord.payload.kind !== "world")
        add(
          "root-kind-invalid",
          recordName(rootRecord),
          "The root Location must be a World.",
        );
      const placement = rootRecord.payload.placement;
      if (isObject(placement) && placement.kind !== "root")
        add(
          "root-placement-invalid",
          recordName(rootRecord),
          "The World Location must use root placement.",
        );
    }
    validateLocationGraph(locations, byId, add);
    for (const id of worldPlacements) {
      if (!byId.has(`world-placements\0${id}`))
        add(
          "world-placement-record-missing",
          "World placements",
          "A declared World placement is missing from the capture.",
        );
    }
    const declared = new Set(worldPlacements);
    for (const record of records) {
      if (
        record.resourceType.trim() === "world-placements" &&
        !declared.has(record.sourceId.trim())
      )
        add(
          "world-placement-membership-mismatch",
          recordName(record),
          "Every captured World placement must be declared by this World revision.",
        );
    }
    if (!context.records) {
      // Membership shape remains meaningful, but missing external captures are unresolved.
      const scopeCodes = new Set([
        "declared-record-missing",
        "schema-record-missing",
        "world-placement-record-missing",
      ]);
      for (let i = issues.length - 1; i >= 0; i--)
        if (scopeCodes.has(issues[i].code)) issues.splice(i, 1);
      issues.push({
        code: "world-reference-scope-unavailable",
        subject: "World draft",
        message: "World references require an authorized capture.",
        unresolved: true,
      });
    }
    const related = context.relatedValidation;
    if (
      related &&
      WorldDefinition.same(content, related.content) &&
      WorldDefinition.same(context.records, related.records)
    ) {
      issues.push(...related.issues);
    } else {
      issues.push({
        code: "world-related-unresolved",
        subject: "World draft",
        message:
          "Related resource validation must be supplied for this exact World content and capture.",
        unresolved: true,
        blocking: false,
      });
    }
    return issues.sort(
      (a, b) =>
        a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject),
    );
  }
  private static validateLocationGraph(
    ids: readonly string[],
    byId: ReadonlyMap<string, WorldDefinitionRecord>,
    add: (c: string, s: string, d: string) => void,
  ) {
    const parents = new Map<string, string>();
    const known = new Set(ids);
    for (const id of ids) {
      const record = byId.get(`locations\0${id}`);
      if (!record || !WorldDefinition.isObject(record.payload)) continue;
      const placement = record.payload.placement;
      if (
        WorldDefinition.isObject(placement) &&
        placement.kind === "within-parent" &&
        typeof placement.parentLocationId === "string"
      ) {
        if (!known.has(placement.parentLocationId))
          add(
            "location-parent-missing",
            WorldDefinition.recordName(record),
            "The parent Location is not in this World capture.",
          );
        parents.set(id, placement.parentLocationId);
      }
    }
    for (const id of ids) {
      const seen = new Set<string>();
      let cursor: string | undefined = id;
      while (cursor) {
        if (seen.has(cursor)) {
          add(
            "location-cycle",
            WorldDefinition.recordName(byId.get(`locations\0${id}`)),
            "The Location hierarchy contains a cycle.",
          );
          break;
        }
        seen.add(cursor);
        cursor = parents.get(cursor);
      }
    }
  }

  /** Editing incomplete drafts preserves every existing string reference. */
  private static mutableMembers(
    content: WorldDefinitionState,
    collection: keyof WorldDefinitionCollections,
  ): string[] {
    const raw = content[collection];
    return Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === "string")
      : [];
  }
  private static stringArray(
    value: Record<string, unknown>,
    field: string,
    add: (c: string, s: string, d: string) => void,
    optional = false,
  ): string[] {
    const raw = value[field];
    if (optional && raw === undefined) return [];
    if (
      !Array.isArray(raw) ||
      raw.some((item) => typeof item !== "string" || !item.trim())
    ) {
      add(
        "collection-invalid",
        "World draft",
        `${field} must be a collection of stable references.`,
      );
      return [];
    }
    if (new Set(raw).size !== raw.length)
      add(
        "collection-duplicate",
        "World draft",
        `${field} contains a duplicate reference.`,
      );
    return raw as string[];
  }

  private static requireRecord(
    byId: ReadonlyMap<string, WorldDefinitionRecord>,
    resource: string,
    id: string,
    label: string,
    add: (c: string, s: string, d: string) => void,
  ) {
    if (!byId.has(`${resource}\0${id}`))
      add(
        "declared-record-missing",
        "World draft",
        `A declared ${label} is missing from the capture.`,
      );
  }
  private static stringField(
    value: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const raw = value[field];
    return typeof raw === "string" && raw.trim() ? raw : undefined;
  }
  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static recordName(record?: WorldDefinitionRecord): string {
    if (record && WorldDefinition.isObject(record.payload)) {
      const name = record.payload.name;
      if (typeof name === "string" && name.trim()) return name.trim();
      const identity = record.payload.identity;
      if (
        WorldDefinition.isObject(identity) &&
        typeof identity.name === "string" &&
        identity.name.trim()
      )
        return identity.name.trim();
    }
    return "World resource";
  }

  private static same(left: unknown, right: unknown): boolean {
    const ordered = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(ordered)
        : WorldDefinition.isObject(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, ordered(value[key])]),
            )
          : value;
    return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
  }
  /** Invalid capture JSON becomes a diagnostic instead of poisoning immutable context cloning. */
  private static normalizeContext(
    context: WorldDefinitionValidationContext,
  ): WorldDefinitionValidationContext {
    const invalidRecordIds: string[] = [
      ...((context as NormalizedContext).invalidRecordIds ?? []),
    ];
    const normalize = (records: readonly WorldDefinitionRecord[]) =>
      records.map((record) => {
        if (WorldDefinition.isJson(record.payload)) return record;
        invalidRecordIds.push(keyFor(record));
        return {
          ...record,
          payload: { name: WorldDefinition.recordName(record) },
        };
      });
    const records = context.records ? normalize(context.records) : undefined;
    const related = context.relatedValidation;
    const relatedValidation =
      related && WorldDefinition.isJson(related.content)
        ? { ...related, records: normalize(related.records) }
        : undefined;
    return {
      ...(context.mode ? { mode: context.mode } : {}),
      ...(records ? { records } : {}),
      ...(relatedValidation ? { relatedValidation } : {}),
      invalidRecordIds,
    } as NormalizedContext;
  }
  private static isJson(
    value: unknown,
    depth = 0,
    ancestors = new Set<object>(),
  ): boolean {
    if (depth > 64) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      WorldDefinition.isJson(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}

interface NormalizedContext extends WorldDefinitionValidationContext {
  readonly invalidRecordIds?: readonly string[];
}
function keyFor(record: WorldDefinitionRecord): string {
  return `${record.resourceType.trim()}\0${record.sourceId.trim()}`;
}
