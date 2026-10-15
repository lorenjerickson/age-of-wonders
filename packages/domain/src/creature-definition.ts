import {
  WORLD_CODEX_RESOURCES,
  type JsonValue,
  type ModelConformance,
  type WorldCreatureDefinition,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
} from "./entity";

type JsonObject = Record<string, unknown>;
/** Structurally decoded authoring state; incomplete legacy fields stay unknown until validated. */
export interface CreatureDefinitionState extends JsonObject {
  readonly kind: "creature";
}
export interface CreatureDefinitionValidationContext {
  readonly mode?: "draft" | "publication" | "runtime";
  readonly sourceId?: string;
  readonly baseline?: unknown;
  /** Immutable capture supplied by the authorized application workflow. */
  readonly records?: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[];
  readonly definitionIds?: readonly string[];
  /** Effective Model projection loaded and authorized by the application. */
  readonly model?: {
    readonly releaseIds: readonly string[];
    readonly elements: readonly {
      readonly key: string;
      readonly id: string;
      readonly kind: string;
      readonly semanticRole?: string;
      readonly valueMetadata?: unknown;
    }[];
  };
}

export type CreatureDefinitionCommands = {
  rename: { params: { name: string }; context: Record<string, never> };
};
export type CreatureDefinitionEvents = { renamed: { name: string } };

export class CreatureDefinition extends Entity<
  CreatureDefinitionState,
  CreatureDefinitionCommands,
  CreatureDefinitionEvents,
  CreatureDefinitionValidationContext
> {
  private constructor(
    data: CreatureDefinitionState,
    context: CreatureDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("creature-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static embodimentPolicyForSave(
    existing: unknown,
    strategy:
      "" | "one-per-instance" | "one-per-realization" | "preserve-extension",
    maximum: string,
  ) {
    const prior =
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
        ? copyEntityData(existing as Record<string, JsonValue>)
        : {};
    if (strategy === "preserve-extension") return prior;
    if (!strategy) return undefined;
    if (strategy === "one-per-instance") {
      return { ...prior, strategy, maximumPerCampaignInstance: 1 };
    }
    const parsed = Number(maximum);
    const maximumPerCampaignInstance =
      maximum.trim() && Number.isInteger(parsed) && parsed > 0
        ? parsed
        : undefined;
    if (maximumPerCampaignInstance !== undefined) {
      return { ...prior, strategy, maximumPerCampaignInstance };
    }
    const withoutMaximum = { ...prior };
    delete withoutMaximum.maximumPerCampaignInstance;
    return { ...withoutMaximum, strategy };
  }

  static deserialize(
    value: unknown,
    context: CreatureDefinitionValidationContext = {},
    options?: EntityOptions,
  ): CreatureDefinition {
    let payload = value;
    if (
      CreatureDefinition.isObject(value) &&
      value.type === "creature-definition"
    ) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Creature Definition schema version.");
      payload = value.data;
    }
    return this.deserializePayload(payload, context, options);
  }

  /** Hydrate raw resource JSON without interpreting its fields as an entity envelope. */
  static deserializePayload(
    payload: unknown,
    context: CreatureDefinitionValidationContext = {},
    options?: EntityOptions,
  ): CreatureDefinition {
    if (
      !CreatureDefinition.isObject(payload) ||
      payload.kind !== "creature" ||
      !CreatureDefinition.isJson(payload)
    )
      throw new TypeError(
        "A Creature Definition requires a JSON object with Creature kind.",
      );
    return new CreatureDefinition(
      payload as CreatureDefinitionState,
      context,
      options,
    );
  }

  /** Compatibility adapter: the existing captured resource payload is unchanged. */
  serializePayload(): CreatureDefinitionState {
    return this.serialize().data;
  }

  protected handleCommand<K extends keyof CreatureDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<CreatureDefinitionCommands[K]>,
  ): EntityTransition<CreatureDefinitionState, CreatureDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Creature Definition command.");
    if (!CreatureDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Creature name.");
    const nextName = invocation.params.name.trim();
    const identity = CreatureDefinition.object(this.state.data.identity);
    if (identity.name === nextName) return { data: this.serializePayload() };
    return {
      data: {
        ...this.serializePayload(),
        identity: { ...identity, name: nextName },
      },
      events: [{ name: "renamed", context: { name: nextName } }],
    };
  }

  protected validateState(
    data: DeepReadonly<CreatureDefinitionState>,
    context: CreatureDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const p = data as JsonObject;
    const c = CreatureDefinition.object(p.components);
    const issues: ValidationIssue[] = [];
    const add = (
      code: string,
      message: string,
      path?: string,
      blocking = true,
    ) => issues.push({ code, message, ...(path ? { path } : {}), blocking });
    if (
      !CreatureDefinition.validDefinitionIdentity(
        p.identity,
        context.sourceId ??
          String(CreatureDefinition.object(p.identity).id ?? ""),
      ) ||
      !CreatureDefinition.validConformance(p.conformance)
    )
      add(
        "creature-canonical-identity",
        "The Creature Definition identity or Model conformance is invalid.",
      );
    if (
      !CreatureDefinition.numericRecord(c.attributes) ||
      !CreatureDefinition.stringArray(c.equipmentSlots) ||
      !CreatureDefinition.validCreatureArt(c.art) ||
      !CreatureDefinition.validMovement(c.movement) ||
      !CreatureDefinition.nonEmptyStringArray(c.skillDefinitionIds) ||
      !CreatureDefinition.nonEmptyStringArray(c.professionDefinitionIds) ||
      !CreatureDefinition.isObject(c.progressiveMechanics) ||
      !CreatureDefinition.validEmbodimentPolicy(p.instanceEmbodimentPolicy)
    )
      add(
        "creature-canonical-components",
        "The Creature Definition components or embodiment policy are invalid.",
      );
    if (context.model)
      issues.push(...CreatureDefinition.modelIssues(p, context.model));
    else
      issues.push({
        code: "creature-model-unresolved",
        message:
          "Creature Model conformance has not been checked against the effective Model Schema.",
        unresolved: true,
      });
    const prior = CreatureDefinition.object(context.baseline);
    const baseline =
      context.mode === "draft" &&
      prior.kind === "creature" &&
      CreatureDefinition.isObject(prior.components)
        ? prior.components
        : undefined;
    const blocking = (field: string) =>
      !baseline ||
      !Object.hasOwn(baseline, field) ||
      CreatureDefinition.canonical(c[field] ?? null) !==
        CreatureDefinition.canonical(baseline[field] ?? null);
    if (c.skills !== undefined && !CreatureDefinition.numbers(c.skills))
      add(
        "creature-codex-skills",
        "Creature Skills must have finite numeric values.",
        "components.skills",
        blocking("skills"),
      );
    const h = c.health;
    if (
      h !== undefined &&
      (!CreatureDefinition.isObject(h) ||
        !CreatureDefinition.nonnegative(h.current) ||
        !CreatureDefinition.nonnegative(h.maximum) ||
        !CreatureDefinition.nonnegative(h.temporary) ||
        Number(h.current) > Number(h.maximum))
    )
      add(
        "creature-codex-health",
        "Choose valid Creature health values.",
        "components.health",
        blocking("health"),
      );
    const v = c.vision;
    if (
      v !== undefined &&
      (!CreatureDefinition.isObject(v) ||
        !CreatureDefinition.nonnegative(v.day) ||
        !CreatureDefinition.nonnegative(v.night))
    )
      add(
        "creature-codex-vision",
        "Choose nonnegative Creature vision distances.",
        "components.vision",
        blocking("vision"),
      );
    if (!CreatureDefinition.validEmbodimentPolicy(p.instanceEmbodimentPolicy))
      add(
        "creature-embodiment-policy-invalid",
        "A Creature Definition requires an explicit valid Instance embodiment policy.",
      );
    if (!context.records) {
      issues.push({
        code: "creature-references-unresolved",
        message:
          "Creature references have not been checked against a World capture.",
        unresolved: true,
      });
      return issues;
    }
    const find = (resource: string, id: unknown) =>
      context.records!.find(
        (r) => r.resourceType === resource && r.sourceId === id,
      )?.payload;
    if (
      c.equipmentPool !== undefined &&
      (!CreatureDefinition.array(c.equipmentPool) ||
        new Set(c.equipmentPool).size !== c.equipmentPool.length ||
        c.equipmentPool.some(
          (id) =>
            CreatureDefinition.object(find("definitions", id)).kind !== "item",
        ))
    )
      add(
        "creature-codex-equipment",
        "Choose distinct Items in this World for the equipment pool.",
        "components.equipmentPool",
      );
    const grants = c.grantedConditions;
    if (grants !== undefined) {
      if (!CreatureDefinition.array(grants))
        add(
          "creature-codex-conditions",
          "Choose a valid granted Condition list.",
        );
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !CreatureDefinition.isObject(link) ||
            !CreatureDefinition.text(link.conditionId) ||
            ids.has(link.conditionId) ||
            !find(WORLD_CODEX_RESOURCES.conditions, link.conditionId)
          ) {
            add(
              "creature-codex-conditions",
              "A granted Condition is duplicated or unavailable in this World.",
            );
            break;
          }
          ids.add(link.conditionId);
        }
      }
    }
    for (const [field, kind, label] of [
      ["skillDefinitionIds", "skill", "Skill"],
      ["professionDefinitionIds", "profession", "Profession"],
    ] as const) {
      for (const reference of Array.isArray(c[field]) ? c[field] : []) {
        if (
          CreatureDefinition.object(find("definitions", reference)).kind !==
            kind ||
          (context.definitionIds && !context.definitionIds.includes(reference))
        )
          add(
            "creature-definition-reference-invalid",
            `Every referenced ${label} must be declared in this World draft.`,
            `components.${field}`,
          );
      }
    }
    return issues;
  }

  /** Decode external artwork view names before application-owned media authorization. */
  static decodeArtworkViews(
    value: unknown,
  ): Record<string, Record<string, unknown>> {
    if (!CreatureDefinition.isObject(value))
      throw new TypeError("Choose a valid Creature artwork view.");
    const images: Record<string, Record<string, unknown>> = {};
    for (const [role, image] of Object.entries(value)) {
      if (
        !["portrait", "overheadToken", "paperDollToken"].includes(role) ||
        !CreatureDefinition.isObject(image)
      )
        throw new TypeError("Choose a valid Creature artwork view.");
      images[role] = image;
    }
    return images;
  }

  private static modelIssues(
    p: JsonObject,
    model: NonNullable<CreatureDefinitionValidationContext["model"]>,
  ): ValidationIssue[] {
    const issue = (message: string): ValidationIssue[] => [
      { code: "creature-model-invalid", message },
    ];
    const conformance = p.conformance;
    if (!CreatureDefinition.isObject(conformance))
      return issue(
        "A governed authored resource is missing Model Schema conformance.",
      );
    const selected = conformance.modelSchemaReleaseIds;
    if (
      !Array.isArray(selected) ||
      selected.length !== model.releaseIds.length ||
      selected.some((id, index) => id !== model.releaseIds[index])
    )
      return issue(
        "A governed authored resource does not conform to the draft's exact Model Schema releases.",
      );
    const concepts = model.elements.filter(
      (element) => element.kind === "concept",
    );
    if (
      typeof conformance.conceptId !== "string" ||
      !concepts.some((element) => element.id === conformance.conceptId)
    )
      return issue(
        "A governed authored resource references an unavailable Model concept.",
      );
    if (
      !concepts.some(
        (element) =>
          element.id === conformance.conceptId &&
          element.semanticRole === "aow:creature",
      )
    )
      return issue(
        "A governed authored resource uses the wrong Model concept.",
      );
    // Legacy authored records kept attributes at the root; the adapter never rewrites storage.
    const components = CreatureDefinition.isObject(p.components)
      ? p.components
      : p;
    if (!CreatureDefinition.isObject(components.attributes))
      return issue("Creature Attributes must use the effective Model Schema.");
    const byKey = new Map(
      model.elements.map((element) => [element.key, element]),
    );
    for (const [key, score] of Object.entries(components.attributes)) {
      const element = byKey.get(key);
      const metadata = CreatureDefinition.object(element?.valueMetadata);
      const minimum =
        typeof metadata["aow:minimum"] === "number"
          ? metadata["aow:minimum"]
          : 0;
      const maximum =
        typeof metadata["aow:maximum"] === "number"
          ? metadata["aow:maximum"]
          : 100;
      if (
        element?.semanticRole !== "aow:attribute" ||
        typeof score !== "number" ||
        !Number.isInteger(score) ||
        score < minimum ||
        score > maximum
      )
        return issue(
          "A Creature Attribute is unavailable or outside its allowed range.",
        );
    }
    const slots = components.equipmentSlots;
    if (
      !Array.isArray(slots) ||
      new Set(slots).size !== slots.length ||
      slots.some(
        (key) =>
          typeof key !== "string" ||
          byKey.get(key)?.semanticRole !== "aow:equipment-slot",
      )
    )
      return issue(
        "A governed Definition references an unavailable Model option.",
      );
    return [];
  }

  private static canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((v) => CreatureDefinition.canonical(v)).join(",")}]`;
    if (CreatureDefinition.isObject(value))
      return `{${Object.keys(value)
        .sort()
        .map(
          (k) =>
            `${JSON.stringify(k)}:${CreatureDefinition.canonical(value[k])}`,
        )
        .join(",")}}`;
    return JSON.stringify(value) ?? "null";
  }
  private static isJson(
    value: unknown,
    seen = new Set<object>(),
    depth = 0,
  ): boolean {
    if (depth > 100) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || value === null || seen.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    seen.add(value);
    const valid = Object.values(value).every((v) =>
      CreatureDefinition.isJson(v, seen, depth + 1),
    );
    seen.delete(value);
    return valid;
  }
  private static text(v: unknown, max = 240): v is string {
    return typeof v === "string" && !!v.trim() && v.length <= max;
  }
  private static nonnegative(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  }
  private static array(v: unknown): v is unknown[] {
    return Array.isArray(v) && v.length <= 200;
  }
  private static numbers(v: unknown): boolean {
    return (
      CreatureDefinition.isObject(v) &&
      Object.keys(v).length <= 200 &&
      Object.entries(v).every(
        ([k, n]) =>
          CreatureDefinition.text(k) &&
          !["__proto__", "constructor", "prototype"].includes(k) &&
          typeof n === "number" &&
          Number.isFinite(n),
      )
    );
  }
  /** Recover artwork retained by older Creature upgrades without replacing newer views. */
  static preservedImages(previous: unknown): Record<string, unknown> {
    const prior = CreatureDefinition.object(previous);
    const archived = CreatureDefinition.object(
      CreatureDefinition.object(
        CreatureDefinition.object(prior.extensions)["aow:legacy-creature"],
      ).payload,
    );
    return {
      ...CreatureDefinition.object(archived.images),
      ...CreatureDefinition.object(prior.images),
      ...CreatureDefinition.object(
        CreatureDefinition.object(
          CreatureDefinition.object(prior.components).art,
        ).images,
      ),
    };
  }

  static authorPayload(
    id: string,
    input: {
      name: string;
      description?: string;
      attributes: Record<string, number>;
      grantedConditions?: import("@aow/common").WorldGrantedCondition[];
      skills?: Record<string, number>;
      health?: { current: number; maximum: number; temporary: number };
      vision?: { day: number; night: number };
      equipmentPool?: string[];
      equipmentSlots: string[];
      instanceEmbodimentPolicy: Record<string, unknown>;
      artDirection?: string;
      images?: Record<string, unknown>;
      movement?: WorldCreatureDefinition["components"]["movement"];
      skillDefinitionIds?: string[];
      professionDefinitionIds?: string[];
      progressiveMechanicsNotes?: string;
    },
    conformance: ModelConformance,
    previous?: unknown,
  ): WorldCreatureDefinition {
    const prior = CreatureDefinition.object(previous);
    const priorComponents = CreatureDefinition.object(prior.components);
    const preservedArt = CreatureDefinition.withoutKeys(
      CreatureDefinition.object(priorComponents.art),
      "direction",
    );
    const images = {
      ...CreatureDefinition.preservedImages(prior),
      ...input.images,
    };
    const preservedMechanics = CreatureDefinition.withoutKeys(
      CreatureDefinition.object(priorComponents.progressiveMechanics),
      "notes",
    );
    return {
      identity: CreatureDefinition.definitionIdentity(
        id,
        input.name,
        input.description,
        prior,
      ),
      kind: "creature",
      components: {
        ...priorComponents,
        ...Object.fromEntries(
          ["grantedConditions", "skills", "health", "vision", "equipmentPool"]
            .filter((key) => input[key as keyof typeof input] !== undefined)
            .map((key) => [key, input[key as keyof typeof input]]),
        ),
        attributes: input.attributes,
        equipmentSlots: input.equipmentSlots as never,
        art: {
          ...preservedArt,
          ...(Object.keys(images).length ? { images } : {}),
          ...(input.artDirection?.trim()
            ? { direction: input.artDirection.trim() }
            : {}),
        },
        movement: input.movement ?? [],
        skillDefinitionIds: (input.skillDefinitionIds ?? []) as never,
        professionDefinitionIds: (input.professionDefinitionIds ?? []) as never,
        progressiveMechanics: {
          ...preservedMechanics,
          ...(input.progressiveMechanicsNotes?.trim()
            ? { notes: input.progressiveMechanicsNotes.trim() }
            : {}),
        },
      },
      conformance,
      instanceEmbodimentPolicy: input.instanceEmbodimentPolicy as never,
      ...(CreatureDefinition.isObject(prior.modelValues)
        ? { modelValues: prior.modelValues as never }
        : {}),
      ...(CreatureDefinition.isObject(prior.extensions)
        ? { extensions: prior.extensions as never }
        : {}),
    };
  }

  private static definitionIdentity(
    id: string,
    name: string,
    description: string | undefined,
    prior: JsonObject,
  ) {
    const identity = CreatureDefinition.object(prior.identity);
    return {
      id: id as never,
      key: (typeof identity.key === "string"
        ? identity.key
        : typeof prior.key === "string"
          ? prior.key
          : `world:${id}`) as never,
      name: name.trim(),
      ...(description?.trim() ? { description: description.trim() } : {}),
      source: CreatureDefinition.isObject(identity.source)
        ? (identity.source as never)
        : CreatureDefinition.isObject(prior.source)
          ? (prior.source as never)
          : ({ namespace: "world", edition: "1" } as never),
    };
  }
  private static object(value: unknown): JsonObject {
    return CreatureDefinition.isObject(value) ? value : {};
  }
  private static withoutKeys(
    value: JsonObject,
    ...keys: readonly string[]
  ): JsonObject {
    const excluded = new Set(keys);
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !excluded.has(key)),
    );
  }
  private static isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  private static namespaced(value: unknown): value is string {
    return CreatureDefinition.nonEmpty(value) && value.includes(":");
  }
  private static stringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(CreatureDefinition.namespaced);
  }
  private static nonEmptyStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(CreatureDefinition.nonEmpty);
  }
  private static numericRecord(value: unknown): boolean {
    return (
      CreatureDefinition.isObject(value) &&
      Object.entries(value).every(
        ([key, entry]) =>
          CreatureDefinition.namespaced(key) &&
          typeof entry === "number" &&
          Number.isFinite(entry),
      )
    );
  }
  private static validDefinitionIdentity(
    value: unknown,
    sourceId: string,
  ): boolean {
    return (
      CreatureDefinition.isObject(value) &&
      value.id === sourceId &&
      CreatureDefinition.namespaced(value.key) &&
      CreatureDefinition.nonEmpty(value.name) &&
      CreatureDefinition.isObject(value.source)
    );
  }
  private static validConformance(value: unknown): boolean {
    return (
      CreatureDefinition.isObject(value) &&
      CreatureDefinition.nonEmpty(value.conceptId) &&
      Array.isArray(value.modelSchemaReleaseIds) &&
      value.modelSchemaReleaseIds.length > 0 &&
      value.modelSchemaReleaseIds.every(CreatureDefinition.nonEmpty)
    );
  }
  private static validCreatureArt(value: unknown): boolean {
    if (!CreatureDefinition.isObject(value)) return false;
    if (value.direction !== undefined && typeof value.direction !== "string")
      return false;
    if (value.images === undefined) return true;
    if (!CreatureDefinition.isObject(value.images)) return false;
    const images = value.images;
    return ["portrait", "overheadToken", "paperDollToken"].every((key) => {
      const image = images[key];
      return (
        image === undefined || CreatureDefinition.validCreatureImage(image)
      );
    });
  }
  private static validCreatureImage(value: unknown): boolean {
    const image = CreatureDefinition.object(value);
    return (
      CreatureDefinition.nonEmpty(image.assetId) &&
      CreatureDefinition.nonEmpty(image.altText) &&
      typeof image.width === "number" &&
      image.width > 0 &&
      typeof image.height === "number" &&
      image.height > 0 &&
      typeof image.mimeType === "string" &&
      image.mimeType.startsWith("image/")
    );
  }
  private static validMovement(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.every((entry) => {
        if (
          !CreatureDefinition.isObject(entry) ||
          !CreatureDefinition.nonEmpty(entry.mode) ||
          !CreatureDefinition.isObject(entry.distance)
        )
          return false;
        return (
          typeof entry.distance.value === "number" &&
          Number.isFinite(entry.distance.value) &&
          entry.distance.value >= 0 &&
          CreatureDefinition.nonEmpty(entry.distance.unit) &&
          (entry.hover === undefined || typeof entry.hover === "boolean") &&
          (entry.restrictions === undefined ||
            Array.isArray(entry.restrictions))
        );
      })
    );
  }
  private static validEmbodimentPolicy(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const policy = value as Record<string, unknown>;
    if (
      Object.keys(policy).some(
        (key) =>
          !["strategy", "maximumPerCampaignInstance", "extensions"].includes(
            key,
          ),
      )
    ) {
      return false;
    }
    const strategy = policy.strategy;
    if (
      typeof strategy !== "string" ||
      (strategy !== "one-per-instance" &&
        strategy !== "one-per-realization" &&
        !CreatureDefinition.embodimentNamespacedKey(strategy))
    ) {
      return false;
    }
    const maximum = policy.maximumPerCampaignInstance;
    if (
      maximum !== undefined &&
      (!Number.isInteger(maximum) || (maximum as number) <= 0)
    ) {
      return false;
    }
    if (
      strategy === "one-per-instance" &&
      maximum !== undefined &&
      maximum !== 1
    ) {
      return false;
    }
    return (
      policy.extensions === undefined ||
      (typeof policy.extensions === "object" &&
        policy.extensions !== null &&
        !Array.isArray(policy.extensions) &&
        Object.keys(policy.extensions).every(
          CreatureDefinition.embodimentNamespacedKey,
        ))
    );
  }

  private static embodimentNamespacedKey(value: string): boolean {
    const separator = value.indexOf(":");
    return separator > 0 && separator < value.length - 1;
  }
}
