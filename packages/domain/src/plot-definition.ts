import type {
  PlotDefinition as PlotPayload,
  CampaignPlacementDefinition,
  PlotDefinitionId,
  PlotHierarchyValidationIssueCode,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type DeepReadonly,
  type ValidationContext,
  type ValidationIssue,
  type EntityOptions,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
import { Discovery } from "./discovery";

export type PlotDefinitionState = Record<string, unknown>;
export interface PlotAuthoringRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly payload: unknown;
}

export interface PlotDefinitionValidationContext extends ValidationContext {
  readonly sourceId?: string;
  readonly validationMode?: "shape";
  readonly campaignDefinitionId?: string;
  readonly plots?: readonly PlotPayload[];
  readonly placements?: readonly CampaignPlacementDefinition[];
  readonly capturedLocationIds?: readonly string[];
}
export interface PlotDefinitionValidationIssue extends ValidationIssue {
  readonly subject: string;
}
export type PlotDefinitionCommands = {
  replaceContent: {
    params: { content: PlotDefinitionState };
    context: Record<string, never>;
  };
  rename: { params: { name: string }; context: Record<string, never> };
};
export type PlotDefinitionEvents = {
  contentReplaced: { id: string };
  renamed: { name: string };
};

/** Authored Plot, including owned narrative members and scoped Campaign references. */
export class PlotDefinition extends Entity<
  PlotDefinitionState,
  PlotDefinitionCommands,
  PlotDefinitionEvents,
  PlotDefinitionValidationContext
> {
  private constructor(
    data: PlotDefinitionState,
    context: PlotDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super(
      "plot-definition",
      data,
      ["contentReplaced", "renamed"],
      context,
      options,
    );
    this.validate(context);
  }
  /** Read-only editor policy over the selected Campaign capture. */
  static authoringDescendantIds(
    records: readonly PlotAuthoringRecord[],
    plotId: string,
  ): Set<string> {
    const children = new Map<string, string[]>();
    for (const record of records) {
      if (record.resourceType !== "plots") continue;
      const parent = this.authoringObject(
        this.authoringObject(record.payload).parent,
      );
      if (
        parent.kind === "subplot" &&
        typeof parent.parentPlotDefinitionId === "string"
      )
        children.set(parent.parentPlotDefinitionId, [
          ...(children.get(parent.parentPlotDefinitionId) ?? []),
          record.sourceId,
        ]);
    }
    const descendants = new Set<string>();
    const pending = [plotId];
    while (pending.length) {
      for (const child of children.get(pending.pop()!) ?? []) {
        if (descendants.has(child)) continue;
        descendants.add(child);
        pending.push(child);
      }
    }
    return descendants;
  }

  static authoringParentCandidates<T extends PlotAuthoringRecord>(
    records: readonly T[],
    plotId: string,
  ): T[] {
    const descendants = this.authoringDescendantIds(records, plotId);
    return records.filter(
      (record) =>
        record.resourceType === "plots" &&
        record.sourceId !== plotId &&
        !descendants.has(record.sourceId),
    );
  }

  static authoringContextPlacements<T extends PlotAuthoringRecord>(
    records: readonly T[],
    plotId: string,
    locationId: unknown,
  ): T[] {
    return records.filter((record) => {
      if (record.resourceType !== "campaign-placements") return false;
      const value = this.authoringObject(record.payload);
      return (
        value.locationId === locationId &&
        Array.isArray(value.plotDefinitionIds) &&
        value.plotDefinitionIds.includes(plotId)
      );
    });
  }

  static authoringContextAssociationsValid(
    ids: readonly string[],
    records: readonly PlotAuthoringRecord[],
    plotId: string,
    locationId: unknown,
  ): boolean {
    const eligible = new Set(
      this.authoringContextPlacements(records, plotId, locationId).map(
        (record) => record.sourceId,
      ),
    );
    return ids.every((id) => eligible.has(id));
  }

  static authoringDeletionIssue(
    records: readonly PlotAuthoringRecord[],
    plotId: string,
  ): string | undefined {
    const plots = records.filter((record) => record.resourceType === "plots");
    if (
      plots.some(
        (record) =>
          this.authoringObject(this.authoringObject(record.payload).parent)
            .parentPlotDefinitionId === plotId,
      )
    )
      return "Move or delete this Plot’s subplots before deleting it.";
    if (
      plots.some((record) => {
        const value = this.authoringObject(record.payload);
        return [
          ...this.authoringArray(value.prerequisites),
          ...this.authoringArray(value.dependencies),
        ].some(
          (link) => this.authoringObject(link).plotDefinitionId === plotId,
        );
      }) ||
      records.some(
        (record) =>
          record.resourceType === "campaign-placements" &&
          this.authoringArray(
            this.authoringObject(record.payload).plotDefinitionIds,
          ).includes(plotId),
      )
    )
      return "Remove this Plot’s prerequisite, dependency, and placement associations before deleting it.";
    return undefined;
  }

  static authoringParentChangeIssue(
    payload: unknown,
    records: readonly PlotAuthoringRecord[],
    parentId: string,
  ): string | undefined {
    const ancestors = new Set<string>();
    let next = parentId;
    while (next && !ancestors.has(next)) {
      ancestors.add(next);
      const record = records.find(
        (record) => record.resourceType === "plots" && record.sourceId === next,
      );
      const parent = this.authoringObject(
        this.authoringObject(record?.payload).parent,
      ).parentPlotDefinitionId;
      next = typeof parent === "string" ? parent : "";
    }
    const value = this.authoringObject(payload);
    if (
      [
        ...this.authoringArray(value.prerequisites),
        ...this.authoringArray(value.dependencies),
      ].some((link) => {
        const relationship = this.authoringObject(link);
        const target =
          typeof relationship.plotDefinitionId === "string"
            ? relationship.plotDefinitionId
            : "";
        return (
          !ancestors.has(target) &&
          !(
            typeof relationship.crossBranchRationale === "string" &&
            relationship.crossBranchRationale.trim()
          )
        );
      })
    )
      return "This parent would make an existing relationship cross-branch. Add its rationale on the Prerequisites or Dependencies page first.";
    return undefined;
  }

  private static authoringObject(value: unknown): Record<string, unknown> {
    return this.isObject(value) ? value : {};
  }
  private static authoringArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  static deserialize(
    value: unknown,
    context: PlotDefinitionValidationContext = {},
    options?: EntityOptions,
  ): PlotDefinition {
    if (this.isObject(value) && value.type === "plot-definition") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Plot Definition schema version.");
      value = value.data;
    }
    return this.deserializePayload(value, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: PlotDefinitionValidationContext = {},
    options?: EntityOptions,
  ): PlotDefinition {
    if (!this.isObject(value))
      throw new TypeError("A Plot Definition requires a bounded JSON object.");
    return new PlotDefinition(copyEntityData(value), context, options);
  }
  serializePayload(): PlotDefinitionState {
    return this.serialize().data as PlotDefinitionState;
  }
  protected handleCommand<K extends keyof PlotDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<PlotDefinitionCommands[K]>,
  ): EntityTransition<PlotDefinitionState, PlotDefinitionEvents> {
    if (name === "replaceContent") {
      const params =
        invocation.params as PlotDefinitionCommands["replaceContent"]["params"];
      if (!PlotDefinition.isObject(params.content))
        throw new TypeError("A Plot Definition requires a JSON object.");
      const data = copyEntityData(params.content);
      if (
        data.id !== this.state.data.id ||
        data.campaignDefinitionId !== this.state.data.campaignDefinitionId
      )
        throw new TypeError(
          "Plot identity and Campaign ownership cannot change.",
        );
      if (PlotDefinition.same(data, this.state.data)) return { data };
      return {
        data,
        events: [
          { name: "contentReplaced", context: { id: data.id as string } },
        ],
      };
    }
    if (name === "rename") {
      const params =
        invocation.params as PlotDefinitionCommands["rename"]["params"];
      if (!PlotDefinition.nonEmpty(params.name))
        throw new TypeError("Provide a Plot name.");
      const nextName = params.name.trim();
      const data = this.serializePayload();
      if (data.name === nextName) return { data };
      return {
        data: { ...data, name: nextName },
        events: [{ name: "renamed", context: { name: nextName } }],
      };
    }
    throw new TypeError("Unknown Plot Definition command.");
  }
  protected validateState(
    data: DeepReadonly<PlotDefinitionState>,
    context: PlotDefinitionValidationContext,
  ): readonly PlotDefinitionValidationIssue[] {
    if (!PlotDefinition.isPlot(data, context.sourceId ?? String(data.id)))
      return [
        {
          code: "plot-invalid",
          subject: "Plot",
          message: "A Plot record is malformed.",
        },
      ];
    if (context.validationMode === "shape") return [];
    const plot = data as unknown as PlotPayload;
    const issues: PlotDefinitionValidationIssue[] = [];
    const add = (code: string, message: string) =>
      issues.push({ code, subject: plot.name, message });
    for (const [key, code, label] of [
      ["objectives", "plot-objective-id-duplicate", "Objective"],
      ["pressures", "plot-pressure-id-duplicate", "Pressure"],
      ["resistances", "plot-resistance-id-duplicate", "Resistance"],
      ["discoveries", "plot-discovery-id-duplicate", "Discovery"],
      [
        "locationContexts",
        "plot-location-context-id-duplicate",
        "Location context",
      ],
    ] as const) {
      const values = plot[key];
      if (new Set(values.map((value) => value.id)).size !== values.length)
        add(code, `${label} identities must be unique within a Plot.`);
    }
    const discoveries = plot.discoveries.map((value) =>
      Discovery.deserializePayload(value, { validationMode: "shape" }),
    );
    try {
      const claimSets = discoveries.map((discovery) => discovery.claims());
      for (let index = 0; index < discoveries.length; index++) {
        discoveries[index].validate({
          otherClaims: claimSets.flatMap((claims, other) =>
            other === index ? [] : claims,
          ),
          precedingClaims: claimSets.slice(0, index).flat(),
        });
        for (const issue of discoveries[index].state.metadata.validity.issues)
          issues.push({ ...issue, subject: plot.name });
      }
    } finally {
      for (const discovery of discoveries) discovery.dispose();
    }
    if (
      context.campaignDefinitionId === undefined ||
      !context.plots ||
      !context.placements ||
      !context.capturedLocationIds
    ) {
      issues.push({
        code: "plot-references-unresolved",
        subject: plot.name,
        message:
          "Plot references have not been checked against a Campaign and captured World.",
        unresolved: true,
        blocking: false,
      });
      return issues;
    }
    if (plot.campaignDefinitionId !== context.campaignDefinitionId)
      add(
        "plot-campaign-mismatch",
        "The Plot belongs to a different Campaign Definition.",
      );
    // Replace the captured self with candidate state so commands cannot validate stale edges.
    const plots = context.plots.map((value) =>
      value.id === plot.id ? plot : value,
    );
    if (!plots.some((value) => value.id === plot.id)) plots.push(plot);
    // Graph consistency is shared scoped evidence: every Plot must expose an invalid
    // capture even when traversal reports the back edge against another Plot.
    for (const issue of PlotDefinition.hierarchyIssues(plots))
      issues.push({
        code: issue.code,
        subject: issue.plotName,
        message: issue.message,
        path: "hierarchy",
      });
    const placements = new Map(
      context.placements.map((value) => [value.id, value]),
    );
    for (const location of plot.locationContexts) {
      if (!context.capturedLocationIds.includes(location.locationId))
        add(
          "location-not-captured",
          "A Plot Location context is not present in the captured World.",
        );
      for (const id of location.placementDefinitionIds ?? []) {
        const placement = placements.get(id);
        if (!placement)
          add(
            "plot-context-placement-not-found",
            "A referenced Campaign placement is not present in this Campaign Definition.",
          );
        else if (
          placement.locationId !== location.locationId ||
          !placement.plotDefinitionIds.includes(plot.id)
        )
          add(
            "plot-context-placement-mismatch",
            "A Plot Location context and its Campaign placement must reference one another at the same captured Location.",
          );
      }
    }
    return issues;
  }
  private static same(left: unknown, right: unknown): boolean {
    const ordered = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(ordered)
        : PlotDefinition.isObject(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, ordered(value[key])]),
            )
          : value;
    return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
  }
  private static isPlot(value: unknown, sourceId: string): boolean {
    if (
      !PlotDefinition.isObject(value) ||
      !PlotDefinition.nonEmpty(value.id) ||
      value.id !== sourceId
    )
      return false;
    if (
      !PlotDefinition.nonEmpty(value.campaignDefinitionId) ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      !PlotDefinition.isObject(value.parent) ||
      !Array.isArray(value.objectives) ||
      !Array.isArray(value.pressures) ||
      !Array.isArray(value.resistances) ||
      !Array.isArray(value.discoveries) ||
      !Array.isArray(value.locationContexts) ||
      !value.objectives.every(PlotDefinition.isNamedComponent) ||
      !value.pressures.every(PlotDefinition.isNamedComponent) ||
      !value.resistances.every(PlotDefinition.isNamedComponent) ||
      !value.discoveries.every(PlotDefinition.isDiscovery) ||
      !value.locationContexts.every(PlotDefinition.isLocationContext) ||
      !PlotDefinition.optionalConformance(value.conformance) ||
      !PlotDefinition.optionalModelValues(value.modelValues) ||
      !PlotDefinition.optionalRelationships(value.prerequisites) ||
      !PlotDefinition.optionalRelationships(value.dependencies) ||
      (value.description !== undefined && typeof value.description !== "string")
    )
      return false;
    return (
      value.parent.kind === "root" ||
      (value.parent.kind === "subplot" &&
        typeof value.parent.parentPlotDefinitionId === "string")
    );
  }
  private static isDiscovery(value: unknown): boolean {
    try {
      const discovery = Discovery.deserializePayload(value, {
        validationMode: "shape",
      });
      try {
        return discovery.state.metadata.validity.status === "valid";
      } finally {
        discovery.dispose();
      }
    } catch {
      return false;
    }
  }
  private static isNamedComponent(value: unknown): boolean {
    return (
      PlotDefinition.isObject(value) &&
      PlotDefinition.nonEmpty(value.id) &&
      PlotDefinition.nonEmpty(value.name) &&
      (value.description === undefined || typeof value.description === "string")
    );
  }
  private static isLocationContext(value: unknown): boolean {
    if (
      !PlotDefinition.isObject(value) ||
      !PlotDefinition.nonEmpty(value.id) ||
      !PlotDefinition.nonEmpty(value.locationId) ||
      !PlotDefinition.optionalStringArray(value.placementDefinitionIds)
    )
      return false;
    return (
      (value.actorPlacements === undefined ||
        (Array.isArray(value.actorPlacements) &&
          value.actorPlacements.length === 0)) &&
      (value.itemPlacements === undefined ||
        (Array.isArray(value.itemPlacements) &&
          value.itemPlacements.length === 0))
    );
  }
  private static optionalRelationships(value: unknown): boolean {
    return (
      value === undefined ||
      (Array.isArray(value) &&
        value.every(
          (entry) =>
            PlotDefinition.isObject(entry) &&
            PlotDefinition.nonEmpty(entry.plotDefinitionId) &&
            (entry.crossBranchRationale === undefined ||
              PlotDefinition.nonEmpty(entry.crossBranchRationale)),
        ))
    );
  }
  private static optionalConformance(value: unknown): boolean {
    return (
      value === undefined ||
      (PlotDefinition.isObject(value) &&
        PlotDefinition.nonEmpty(value.conceptId) &&
        PlotDefinition.stringArray(value.modelSchemaReleaseIds))
    );
  }
  private static optionalModelValues(value: unknown): boolean {
    return (
      value === undefined ||
      (PlotDefinition.isObject(value) &&
        Object.values(value).every(PlotDefinition.isJsonValue))
    );
  }
  private static isJsonValue(value: unknown): boolean {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(PlotDefinition.isJsonValue);
    return (
      PlotDefinition.isObject(value) &&
      Object.values(value).every(PlotDefinition.isJsonValue)
    );
  }
  private static nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  private static optionalStringArray(value: unknown): boolean {
    return value === undefined || PlotDefinition.stringArray(value);
  }
  private static stringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((entry) => typeof entry === "string")
    );
  }
  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static hierarchyIssues(
    plots: readonly PlotPayload[],
  ): readonly HierarchyIssue[] {
    const ordered = [...plots].sort((left, right) =>
      String(left.id).localeCompare(String(right.id), "en"),
    );
    const byId = new Map<PlotDefinitionId, PlotPayload>();
    const issues: HierarchyIssue[] = [];
    const addIssue = (
      code: PlotHierarchyValidationIssueCode,
      plotValue: PlotPayload,
      message: string,
      related?: PlotPayload,
    ) => {
      issues.push({
        code,
        ownerId: plotValue.id,
        plotName: plotValue.name,
        relatedPlotName: related?.name,
        message,
      });
    };

    for (const plotValue of ordered) {
      const duplicate = byId.get(plotValue.id);
      if (duplicate) {
        addIssue(
          "plot-id-duplicate",
          plotValue,
          "Two Plots use the same identity within the validation set.",
          duplicate,
        );
        continue;
      }
      byId.set(plotValue.id, plotValue);
    }

    for (const plotValue of ordered) {
      if (plotValue.parent.kind === "subplot") {
        const parent = byId.get(plotValue.parent.parentPlotDefinitionId);
        if (!parent) {
          addIssue(
            "plot-parent-not-found",
            plotValue,
            "The subplot's parent Plot is not present.",
          );
        } else if (
          parent.campaignDefinitionId !== plotValue.campaignDefinitionId
        ) {
          addIssue(
            "plot-parent-crosses-campaign-definition",
            plotValue,
            "A subplot and its parent must belong to the same Campaign Definition.",
            parent,
          );
        }
      }
    }

    PlotDefinition.addCycleIssues(
      ordered,
      (plotValue) =>
        plotValue.parent.kind === "subplot"
          ? [plotValue.parent.parentPlotDefinitionId]
          : [],
      "plot-parent-cycle",
      "The Plot parent hierarchy contains a cycle.",
      byId,
      addIssue,
    );

    for (const plotValue of ordered) {
      for (const relationship of [
        ...(plotValue.prerequisites ?? []),
        ...(plotValue.dependencies ?? []),
      ]) {
        const target = byId.get(relationship.plotDefinitionId);
        if (!target) {
          addIssue(
            "plot-relationship-not-found",
            plotValue,
            "A Plot prerequisite or dependency is not present.",
          );
          continue;
        }
        if (target.campaignDefinitionId !== plotValue.campaignDefinitionId) {
          addIssue(
            "plot-relationship-crosses-campaign-definition",
            plotValue,
            "Plot prerequisites and dependencies must remain in one Campaign Definition.",
            target,
          );
          continue;
        }
        if (
          !PlotDefinition.isAncestor(plotValue, target.id, byId) &&
          !relationship.crossBranchRationale?.trim()
        ) {
          addIssue(
            "plot-cross-branch-relationship-unexplained",
            plotValue,
            "A cross-branch Plot relationship requires an explicit rationale.",
            target,
          );
        }
      }
    }

    PlotDefinition.addCycleIssues(
      ordered,
      (plotValue) => [
        ...(plotValue.prerequisites ?? []).map(
          (relationship) => relationship.plotDefinitionId,
        ),
        ...(plotValue.dependencies ?? []).map(
          (relationship) => relationship.plotDefinitionId,
        ),
      ],
      "plot-relationship-cycle",
      "The Plot prerequisite and dependency graph contains a cycle.",
      byId,
      addIssue,
    );

    issues.sort((left, right) =>
      [left.code, left.plotName, left.relatedPlotName ?? ""]
        .join("\0")
        .localeCompare(
          [right.code, right.plotName, right.relatedPlotName ?? ""].join("\0"),
          "en",
        ),
    );
    return issues;
  }

  private static isAncestor(
    plotValue: PlotPayload,
    possibleAncestorId: PlotDefinitionId,
    byId: ReadonlyMap<PlotDefinitionId, PlotPayload>,
  ): boolean {
    const visited = new Set<PlotDefinitionId>();
    let current = plotValue;
    while (current.parent.kind === "subplot") {
      const parentId = current.parent.parentPlotDefinitionId;
      if (parentId === possibleAncestorId) return true;
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (
        !parent ||
        parent.campaignDefinitionId !== plotValue.campaignDefinitionId
      ) {
        return false;
      }
      current = parent;
    }
    return false;
  }

  private static addCycleIssues(
    plots: readonly PlotPayload[],
    adjacent: (plotValue: PlotPayload) => readonly PlotDefinitionId[],
    code: "plot-parent-cycle" | "plot-relationship-cycle",
    message: string,
    byId: ReadonlyMap<PlotDefinitionId, PlotPayload>,
    addIssue: (
      code: PlotHierarchyValidationIssueCode,
      plotValue: PlotPayload,
      message: string,
      related?: PlotPayload,
    ) => void,
  ): void {
    const complete = new Set<PlotDefinitionId>();
    const active = new Set<PlotDefinitionId>();
    const reported = new Set<string>();

    const visit = (plotValue: PlotPayload) => {
      if (complete.has(plotValue.id)) return;
      active.add(plotValue.id);
      for (const targetId of adjacent(plotValue)) {
        const target = byId.get(targetId);
        if (
          !target ||
          target.campaignDefinitionId !== plotValue.campaignDefinitionId
        ) {
          continue;
        }
        if (active.has(targetId)) {
          const key = [String(plotValue.id), String(targetId)]
            .sort()
            .join("\0");
          if (!reported.has(key)) {
            reported.add(key);
            addIssue(code, plotValue, message, target);
          }
        } else {
          visit(target);
        }
      }
      active.delete(plotValue.id);
      complete.add(plotValue.id);
    };

    for (const plotValue of plots) visit(plotValue);
  }
}
interface HierarchyIssue {
  readonly ownerId: string;
  readonly code: PlotHierarchyValidationIssueCode;
  readonly plotName: string;
  readonly relatedPlotName?: string;
  readonly message: string;
}
