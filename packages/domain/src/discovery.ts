import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationContext,
  type ValidationIssue,
} from "./entity";

export type DiscoveryState = Record<string, unknown>;
export interface DiscoveryClaimState extends Record<string, unknown> {
  readonly id: string;
  readonly kind: "truth" | "belief" | "rumor";
  readonly statement: string;
  readonly conflictsWithClaimIds?: readonly string[];
  readonly relatedTruthClaimId?: string;
}
export interface DiscoveryValidationContext extends ValidationContext {
  /** Legacy snapshots remain readable. New authored facets must use canonical mode. */
  readonly format?: "legacy" | "canonical";
  /** Explicit shape-only evidence for an aggregate gathering its child references. */
  readonly validationMode?: "shape";
  /** Claims from the other Discoveries in the containing Plot. */
  readonly otherClaims?: readonly DiscoveryClaimState[];
  /** Earlier claims in stable Plot order, to report each identity collision once. */
  readonly precedingClaims?: readonly DiscoveryClaimState[];
}
export type DiscoveryCommands = {
  rename: { params: { name: string }; context: Record<string, never> };
  replaceFacets: {
    params: {
      truth: Record<string, unknown>;
      beliefs: readonly Record<string, unknown>[];
      rumors: readonly Record<string, unknown>[];
    };
    context: Record<string, never>;
  };
};
export type DiscoveryEvents = {
  renamed: { name: string };
  facetsReplaced: { discoveryId: string };
};

/** Authored Discovery claims. Knowledge and reveal progress belong to runtime owners. */
export class Discovery extends Entity<
  DiscoveryState,
  DiscoveryCommands,
  DiscoveryEvents,
  DiscoveryValidationContext
> {
  private constructor(
    data: DiscoveryState,
    context: DiscoveryValidationContext,
    options?: EntityOptions,
  ) {
    super("discovery", data, ["renamed", "facetsReplaced"], context, options);
    this.validate(context);
  }
  static deserialize(
    value: unknown,
    context: DiscoveryValidationContext = {},
    options?: EntityOptions,
  ): Discovery {
    if (this.object(value) && value.type === "discovery") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Discovery schema version.");
      return this.deserializePayload(value.data, context, options);
    }
    return this.deserializePayload(value, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: DiscoveryValidationContext = {},
    options?: EntityOptions,
  ): Discovery {
    const data = copyEntityData(value);
    if (!this.object(data))
      throw new TypeError("A Discovery requires a JSON object.");
    return new Discovery(data, context, options);
  }
  serializePayload(): DiscoveryState {
    return this.serialize().data;
  }
  claims(): DiscoveryClaimState[] {
    return Discovery.claimsFrom(this.state.data);
  }

  /** Canonical editor projection, distinct from legacy runtime claim precedence. */
  static authoringClaims(discovery: DiscoveryState): DiscoveryState[] {
    const object = (value: unknown): DiscoveryState =>
      this.object(value) ? value : {};
    const rows = (value: unknown): DiscoveryState[] =>
      Array.isArray(value) ? value.map(object) : [];
    const truth = object(discovery.truth);
    if (discovery.truth || discovery.beliefs || discovery.rumors)
      return [
        ...(typeof truth.statement === "string" && truth.statement.trim()
          ? [{ ...truth, kind: "truth" }]
          : []),
        ...rows(discovery.beliefs).map((claim) => ({
          ...claim,
          kind: "belief",
        })),
        ...rows(discovery.rumors).map((claim) => ({ ...claim, kind: "rumor" })),
      ];
    return rows(discovery.claims);
  }

  /** An explicit authored facet mutation retains all unrelated Discovery data. */
  static withAuthoredClaims(
    discovery: DiscoveryState,
    claims: readonly DiscoveryState[],
  ): DiscoveryState {
    const truth = claims.find((claim) => claim.kind === "truth");
    const result = { ...discovery };
    delete result.claims;
    const facet = (claim: DiscoveryState) => {
      const value = { ...claim };
      delete value.kind;
      return value;
    };
    const priorTruth = this.object(discovery.truth) ? discovery.truth : {};
    return {
      ...result,
      truth: truth
        ? facet(truth)
        : {
            id: typeof priorTruth.id === "string" ? priorTruth.id : "",
            statement: "",
          },
      beliefs: claims.filter((claim) => claim.kind === "belief").map(facet),
      rumors: claims.filter((claim) => claim.kind === "rumor").map(facet),
    };
  }

  /** Returns surviving claim references inside an explicitly supplied Plot scope. */
  static authoringClaimReferences(
    discoveries: readonly DiscoveryState[],
    removedIds: ReadonlySet<string>,
  ) {
    return discoveries.flatMap((discovery) =>
      this.authoringClaims(discovery)
        .filter(
          (claim) =>
            !removedIds.has(String(claim.id ?? "")) &&
            (removedIds.has(String(claim.relatedTruthClaimId ?? "")) ||
              (Array.isArray(claim.conflictsWithClaimIds) &&
                claim.conflictsWithClaimIds.some(
                  (id) => typeof id === "string" && removedIds.has(id),
                ))),
        )
        .map((claim) => ({ discovery, claim })),
    );
  }

  /** Structural compatibility gate. Diagnostics remain exposed through Entity state. */
  private static isPayload(
    value: unknown,
    mode: "legacy" | "canonical" = "legacy",
  ): boolean {
    if (
      !this.object(value) ||
      !this.text(value.id) ||
      !this.text(value.name) ||
      (value.description !== undefined && typeof value.description !== "string")
    )
      return false;
    const canonical =
      this.object(value.truth) &&
      this.text(value.truth.id) &&
      this.text(value.truth.statement) &&
      (value.truth.provenance === undefined ||
        typeof value.truth.provenance === "string") &&
      Array.isArray(value.beliefs) &&
      Array.isArray(value.rumors) &&
      value.beliefs.length + value.rumors.length > 0 &&
      value.beliefs.every((entry) => this.facet(entry, "belief")) &&
      value.rumors.every((entry) => this.facet(entry, "rumor"));
    if (mode === "canonical") return canonical && value.claims === undefined;
    // When present, legacy claims remain the runtime source of truth; never hide malformed claims behind facets.
    if (value.claims !== undefined)
      return (
        Array.isArray(value.claims) &&
        value.claims.length > 0 &&
        value.claims.every((entry) => this.claim(entry))
      );
    return canonical;
  }

  /** Plot owns the scope; Discovery owns the semantics of claim identity and references. */
  private static validateClaimSet(
    claims: readonly DiscoveryClaimState[],
    otherClaims: readonly DiscoveryClaimState[] = [],
    precedingClaims: readonly DiscoveryClaimState[] = otherClaims,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const add = (code: string, message: string) =>
      issues.push({ code, message });
    const ids = new Set<string>(precedingClaims.map((claim) => claim.id));
    for (const claim of claims) {
      if (ids.has(claim.id))
        add(
          "plot-claim-id-duplicate",
          "Claim identities must be unique within a Plot.",
        );
      ids.add(claim.id);
    }
    for (const claim of otherClaims) ids.add(claim.id);
    const truths = new Set(
      [...otherClaims, ...claims]
        .filter((claim) => claim.kind === "truth")
        .map((claim) => claim.id),
    );
    for (const claim of claims) {
      const conflicts =
        claim.kind === "truth" ? [] : (claim.conflictsWithClaimIds ?? []);
      if (new Set(conflicts).size !== conflicts.length)
        add(
          "claim-conflict-id-duplicate",
          "A Claim conflict may be referenced only once.",
        );
      if (conflicts.some((id) => !ids.has(id)))
        add(
          "claim-conflict-not-found",
          "A Claim conflict is not present in this Plot.",
        );
      if (conflicts.includes(claim.id))
        add("claim-self-conflict", "A Claim cannot conflict with itself.");
      if (
        claim.kind === "rumor" &&
        claim.relatedTruthClaimId !== undefined &&
        !truths.has(claim.relatedTruthClaimId)
      )
        add(
          "claim-related-truth-not-found",
          "A Rumor's related Truth is not present in this Plot.",
        );
    }
    return issues;
  }
  protected validateState(
    data: DeepReadonly<DiscoveryState>,
    context: DiscoveryValidationContext,
  ): readonly ValidationIssue[] {
    if (!Discovery.isPayload(data, context.format))
      return [
        {
          code: "discovery-invalid",
          message:
            "A Discovery requires a name, a Truth, and supporting or contradicting Beliefs or Rumors.",
        },
      ];
    const claims = Discovery.claimsFrom(data);
    if (context.validationMode === "shape") return [];
    if (context.otherClaims)
      return Discovery.validateClaimSet(
        claims,
        context.otherClaims,
        context.precedingClaims,
      );
    const localIssues = Discovery.validateClaimSet(claims).filter(
      (issue) =>
        issue.code !== "claim-conflict-not-found" &&
        issue.code !== "claim-related-truth-not-found",
    );
    if (
      claims.some(
        (claim) =>
          claim.relatedTruthClaimId !== undefined ||
          (claim.conflictsWithClaimIds?.length ?? 0) > 0,
      )
    )
      localIssues.push({
        code: "discovery-references-unresolved",
        message:
          "Discovery claim references have not been checked against their Plot.",
        unresolved: true,
        blocking: false,
      });
    return localIssues;
  }
  protected handleCommand<K extends keyof DiscoveryCommands>(
    name: K,
    invocation: CommandInvocation<DiscoveryCommands[K]>,
  ): EntityTransition<DiscoveryState, DiscoveryEvents> {
    const data = this.serializePayload();
    if (name === "rename") {
      const params = invocation.params as DiscoveryCommands["rename"]["params"];
      if (!Discovery.text(params.name))
        throw new TypeError("Provide a Discovery name.");
      if (data.name === params.name.trim()) return { data };
      return {
        data: { ...data, name: params.name.trim() },
        events: [{ name: "renamed", context: { name: params.name.trim() } }],
      };
    }
    if (name !== "replaceFacets")
      throw new TypeError("Unknown Discovery command.");
    const params =
      invocation.params as DiscoveryCommands["replaceFacets"]["params"];
    const next: DiscoveryState = {
      ...data,
      truth: params.truth,
      beliefs: params.beliefs,
      rumors: params.rumors,
    };
    delete next.claims;
    if (!Discovery.isPayload(next, "canonical"))
      throw new TypeError("Provide canonical Discovery facets.");
    if (Discovery.same(data, next)) return { data };
    return {
      data: next,
      events: [
        { name: "facetsReplaced", context: { discoveryId: String(data.id) } },
      ],
    };
  }
  private static claimsFrom(
    data: DeepReadonly<DiscoveryState>,
  ): DiscoveryClaimState[] {
    if (Array.isArray(data.claims))
      return copyEntityData(data.claims) as DiscoveryClaimState[];
    return copyEntityData([
      ...(this.object(data.truth) ? [{ ...data.truth, kind: "truth" }] : []),
      ...(Array.isArray(data.beliefs)
        ? data.beliefs
            .filter(this.object)
            .map((claim) => ({ ...claim, kind: "belief" }))
        : []),
      ...(Array.isArray(data.rumors)
        ? data.rumors
            .filter(this.object)
            .map((claim) => ({ ...claim, kind: "rumor" }))
        : []),
    ]) as DiscoveryClaimState[];
  }
  private static same(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (
      !left ||
      !right ||
      typeof left !== "object" ||
      typeof right !== "object" ||
      Array.isArray(left) !== Array.isArray(right)
    )
      return false;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) =>
          Object.hasOwn(right, key) &&
          this.same(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key],
          ),
      )
    );
  }
  private static object(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  private static text(value: unknown): value is string {
    return typeof value === "string" && !!value.trim();
  }
  private static facet(value: unknown, kind: "belief" | "rumor"): boolean {
    return (
      this.object(value) &&
      this.claim({ ...value, kind }) &&
      this.text(value.id) &&
      this.text(value.statement) &&
      (value.relation === "supports" || value.relation === "contradicts") &&
      (value.provenance === undefined || typeof value.provenance === "string")
    );
  }
  private static claim(value: unknown): boolean {
    if (
      !this.object(value) ||
      !this.text(value.id) ||
      !this.text(value.statement) ||
      (value.provenance !== undefined && typeof value.provenance !== "string")
    )
      return false;
    if (value.kind === "truth")
      return (
        value.conflictsWithClaimIds === undefined &&
        value.relatedTruthClaimId === undefined
      );
    const conflicts =
      value.conflictsWithClaimIds === undefined ||
      (Array.isArray(value.conflictsWithClaimIds) &&
        value.conflictsWithClaimIds.every((id) => this.text(id)));
    if (value.kind === "belief")
      return conflicts && value.relatedTruthClaimId === undefined;
    return (
      value.kind === "rumor" &&
      conflicts &&
      (value.relatedTruthClaimId === undefined ||
        this.text(value.relatedTruthClaimId))
    );
  }
}
