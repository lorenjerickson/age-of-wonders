import {
  WorldDefinition,
  type WorldDefinitionRecord,
} from "./world-definition";
import {
  Entity,
  type DeepReadonly,
  type EntityOptions,
  type ValidationContext,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";

/** The persisted World or Campaign payload, including legacy/private extension fields. */
export type PlacementDefinitionState = Record<string, unknown>;
export interface PlacementDefinitionValidationContext extends ValidationContext {
  readonly scope: "world" | "campaign";
  readonly sourceId?: string;
  /** Authorized World capture; membership policy delegates to its World owner. */
  readonly records?: readonly WorldDefinitionRecord[];
  /** Shape-only inspection supports captured records before aggregate resolution. */
  readonly validationMode?: "shape" | "complete";
  readonly capturedLocationIds?: readonly string[];
  readonly capturedCreatureIds?: readonly string[];
  readonly capturedItemDefinitionIds?: readonly string[];
  readonly capturedDefinitionIds?: readonly string[];
  readonly capturedWorldPlacements?: readonly {
    readonly id: string;
    readonly locationId: string;
  }[];
  readonly plotIds?: readonly string[];
}
export type PlacementDefinitionCommands = {
  replacePayload: {
    params: { payload: PlacementDefinitionState };
    context: Record<string, never>;
  };
};
export type PlacementDefinitionEvents = { payloadReplaced: { id: string } };

/** Authored placement intent; aggregate membership and runtime realization remain with their owners. */
export class PlacementDefinition extends Entity<
  PlacementDefinitionState,
  PlacementDefinitionCommands,
  PlacementDefinitionEvents,
  PlacementDefinitionValidationContext
> {
  private readonly scope: "world" | "campaign";
  private constructor(
    data: PlacementDefinitionState,
    context: PlacementDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super(
      `placement-definition:${context.scope}`,
      data,
      ["payloadReplaced"],
      context,
      options,
    );
    this.scope = context.scope;
    this.validate(context);
  }
  override validate(context: PlacementDefinitionValidationContext): void {
    if (context.scope !== this.scope)
      throw new TypeError(
        "A Placement Definition cannot change ownership scope.",
      );
    super.validate(context);
  }
  static deserialize(
    value: unknown,
    context: PlacementDefinitionValidationContext,
    options?: EntityOptions,
  ): PlacementDefinition {
    if (
      this.object(value) &&
      typeof value.type === "string" &&
      value.type.startsWith("placement-definition:")
    ) {
      if (
        value.type !== `placement-definition:${context.scope}` ||
        value.schemaVersion !== 1
      )
        throw new TypeError(
          "Unsupported Placement Definition scope or schema version.",
        );
      value = value.data;
    }
    return this.deserializePayload(value, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: PlacementDefinitionValidationContext,
    options?: EntityOptions,
  ): PlacementDefinition {
    if (!context || !["world", "campaign"].includes(context.scope))
      throw new TypeError(
        "A Placement Definition requires an explicit ownership scope.",
      );
    return new PlacementDefinition(this.decode(value), context, options);
  }
  serializePayload(): PlacementDefinitionState {
    return this.serialize().data;
  }
  protected handleCommand<K extends keyof PlacementDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<PlacementDefinitionCommands[K]>,
  ): EntityTransition<PlacementDefinitionState, PlacementDefinitionEvents> {
    if (name !== "replacePayload")
      throw new TypeError("Unknown Placement Definition command.");
    const data = PlacementDefinition.decode(invocation.params.payload);
    if (data.id !== this.state.data.id)
      throw new TypeError(
        "A Placement replacement must preserve its identity.",
      );
    if (PlacementDefinition.same(data, this.state.data)) return { data };
    return {
      data,
      events: [{ name: "payloadReplaced", context: { id: String(data.id) } }],
    };
  }
  protected validateState(
    data: DeepReadonly<PlacementDefinitionState>,
    context: PlacementDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const world = context.scope === "world";
    if (
      !(world
        ? PlacementDefinition.worldShape(data, context.sourceId)
        : PlacementDefinition.campaignShape(data, context.sourceId))
    )
      return [
        {
          code: world
            ? "world-placement-invalid"
            : "campaign-placement-invalid",
          message: world
            ? "The World placement shape, presentation, or coordinates are invalid."
            : "A Campaign placement record is malformed.",
        },
      ];
    if (context.validationMode === "shape") return [];
    if (world) {
      if (
        !context.records ||
        !context.capturedLocationIds ||
        !context.capturedDefinitionIds
      )
        return [
          {
            code: "placement-references-unresolved",
            message:
              "Placement references have not been checked against their World.",
            unresolved: true,
            blocking: false,
          },
        ];
      return WorldDefinition.placementReferenceIssues(
        {
          resourceType: "world-placements",
          sourceId: context.sourceId ?? String(data.id),
          payload: data,
        },
        {
          locationIds: context.capturedLocationIds,
          definitionIds: context.capturedDefinitionIds,
        },
        context.records,
      );
    }
    const issues: ValidationIssue[] = [];
    const add = (code: string, message: string) =>
      issues.push({ code, message });
    const plots = data.plotDefinitionIds as readonly string[];
    if (new Set(plots).size !== plots.length)
      add(
        "placement-plot-id-duplicate",
        "A Plot may be associated with a placement only once.",
      );
    const {
      capturedLocationIds: locations,
      capturedCreatureIds: creatures,
      capturedItemDefinitionIds: items,
      capturedDefinitionIds: definitions,
      capturedWorldPlacements: placements,
      plotIds,
    } = context;
    if (
      !locations ||
      !creatures ||
      !items ||
      !definitions ||
      !placements ||
      !plotIds
    ) {
      issues.push({
        code: "placement-references-unresolved",
        message:
          "Placement references have not been checked against the Campaign and captured World.",
        unresolved: true,
        blocking: false,
      });
      return issues;
    }
    if (!locations.includes(data.locationId as string))
      add(
        "location-not-captured",
        "The placement Location is not present in the captured World.",
      );
    for (const id of plots)
      if (!plotIds.includes(id))
        add(
          "placement-plot-not-found",
          "A related Plot is not present in this Campaign Definition.",
        );
    if (data.kind === "world-decoration") {
      const captured = placements.find(
        (p) => p.id === data.capturedWorldPlacementId,
      );
      if (!captured)
        add(
          "world-placement-not-captured",
          "The decorated World placement is not present in the captured World.",
        );
      else if (captured.locationId !== data.locationId)
        add(
          "world-placement-location-mismatch",
          "The decoration must use the captured World placement's Location.",
        );
    } else {
      const source = data.source as Record<string, unknown>;
      const present =
        source.kind === "world-creature"
          ? creatures.includes(source.creatureId as string)
          : source.kind === "world-item"
            ? items.includes(source.itemDefinitionId as string)
            : source.kind === "registered-content"
              ? definitions.includes(source.definitionId as string)
              : source.suggestedCreatureDefinitionId === undefined ||
                definitions.includes(
                  source.suggestedCreatureDefinitionId as string,
                );
      if (!present)
        add(
          "placement-source-not-captured",
          "The placement source is not present in the captured World content.",
        );
      if (
        source.kind === "actor-role" &&
        source.suggestedCreatureDefinitionId !== undefined &&
        !creatures.includes(source.suggestedCreatureDefinitionId as string)
      )
        add(
          "placement-source-not-creature",
          "The suggested source must be a captured Creature definition.",
        );
    }
    return issues;
  }
  private static worldShape(p: Record<string, unknown>, id?: string): boolean {
    return (
      this.text(p.id) &&
      (id === undefined || p.id === id) &&
      this.text(p.locationId, 240) &&
      this.keys(p, [
        "id",
        "locationId",
        "source",
        "name",
        "mapPosition",
        "scale",
        "notes",
        "conformance",
        "modelValues",
        "extensions",
      ]) &&
      this.presentation(p, true) &&
      this.source(p.source, true) &&
      (p.extensions === undefined || this.object(p.extensions))
    );
  }
  private static campaignShape(
    p: Record<string, unknown>,
    id?: string,
  ): boolean {
    return (
      typeof p.id === "string" &&
      (id === undefined || p.id === id) &&
      typeof p.locationId === "string" &&
      this.strings(p.plotDefinitionIds) &&
      this.presentation(p, false) &&
      (p.kind === "world-decoration"
        ? typeof p.capturedWorldPlacementId === "string" && !("source" in p)
        : p.kind === "independent" &&
          !("capturedWorldPlacementId" in p) &&
          this.source(p.source, false))
    );
  }
  private static presentation(
    p: Record<string, unknown>,
    world: boolean,
  ): boolean {
    const coordinate = p.mapPosition;
    const conformance = p.conformance;
    return (
      (p.name === undefined ||
        (typeof p.name === "string" && (!world || p.name.length <= 120))) &&
      (p.notes === undefined ||
        (typeof p.notes === "string" && (!world || p.notes.length <= 4000))) &&
      (p.scale === undefined ||
        (this.finite(p.scale) && p.scale > 0 && (!world || p.scale <= 100))) &&
      (coordinate === undefined ||
        (this.object(coordinate) &&
          (!world ||
            (this.keys(coordinate, ["kind", "x", "y"]) &&
              coordinate.kind === "normalized-map")) &&
          this.finite(coordinate.x) &&
          coordinate.x >= 0 &&
          coordinate.x <= 1 &&
          this.finite(coordinate.y) &&
          coordinate.y >= 0 &&
          coordinate.y <= 1)) &&
      (conformance === undefined ||
        (this.object(conformance) &&
          this.text(conformance.conceptId, world ? 240 : Infinity) &&
          this.strings(conformance.modelSchemaReleaseIds) &&
          (!world ||
            conformance.modelSchemaReleaseIds.every((id) =>
              this.text(id, 240),
            )))) &&
      (p.modelValues === undefined || this.object(p.modelValues))
    );
  }
  private static source(value: unknown, world: boolean): boolean {
    if (!this.object(value)) return false;
    const field =
      world && value.kind === "world-character"
        ? "characterTemplateId"
        : value.kind === "world-creature"
          ? "creatureId"
          : value.kind === "world-item"
            ? "itemDefinitionId"
            : value.kind === "registered-content"
              ? "definitionId"
              : undefined;
    if (field)
      return (
        this.text(value[field], world ? 240 : Infinity) &&
        (!world || this.keys(value, ["kind", field]))
      );
    return (
      !world &&
      value.kind === "actor-role" &&
      this.text(value.role) &&
      (value.suggestedCreatureDefinitionId === undefined ||
        this.text(value.suggestedCreatureDefinitionId))
    );
  }
  private static same(left: unknown, right: unknown): boolean {
    const canonical = (value: unknown): string =>
      Array.isArray(value)
        ? `[${value.map(canonical).join(",")}]`
        : PlacementDefinition.object(value)
          ? `{${Object.keys(value)
              .sort()
              .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
              .join(",")}}`
          : (JSON.stringify(value) ?? "null");
    return canonical(left) === canonical(right);
  }
  private static decode(value: unknown): PlacementDefinitionState {
    if (!this.object(value) || !this.json(value))
      throw new TypeError(
        "A Placement Definition requires a bounded JSON object.",
      );
    return value;
  }
  private static object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static text(value: unknown, max = Infinity): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
  private static finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
  private static strings(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((v) => typeof v === "string");
  }
  private static keys(
    value: Record<string, unknown>,
    keys: readonly string[],
  ): boolean {
    return Object.keys(value).every((k) => keys.includes(k));
  }
  private static json(
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
    if (typeof value !== "object" || ancestors.has(value)) return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const result = Object.values(value).every((v) =>
      this.json(v, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return result;
  }
}
