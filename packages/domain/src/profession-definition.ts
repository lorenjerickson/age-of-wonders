import { RuleDefinitionEntity } from "./rule-definition-entity";
import { WORLD_CODEX_RESOURCES, type JsonValue } from "@aow/common";
import {
  copyEntityData,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationIssue,
} from "./entity";
import {
  type CodexDefinitionCommands,
  type CodexDefinitionEvents,
  type CodexDefinitionValidationContext,
} from "./codex-definition";
import { Modifier } from "./modifier";

export interface ProfessionDefinitionState extends Record<string, unknown> {
  readonly kind: "profession";
}
export interface ProfessionDefinitionValidationContext extends CodexDefinitionValidationContext {
  readonly model?: {
    readonly releaseIds: readonly string[];
    readonly elements: readonly {
      readonly key: string;
      readonly id: string;
      readonly kind: string;
      readonly semanticRole?: string;
    }[];
  };
}
export type ProfessionDefinitionCommands = CodexDefinitionCommands;
export type ProfessionDefinitionEvents = CodexDefinitionEvents;

/** Authored Profession policy; acquisition, advancement and modifier execution remain runtime concerns. */
export class ProfessionDefinition extends RuleDefinitionEntity<
  ProfessionDefinitionState,
  ProfessionDefinitionValidationContext
> {
  private constructor(
    data: ProfessionDefinitionState,
    context: ProfessionDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("profession-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: ProfessionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ProfessionDefinition {
    return this.deserializePayload(
      this.decode(value, "profession-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: ProfessionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ProfessionDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "profession")
      throw new TypeError(
        "A Profession Definition requires a JSON object with Profession kind.",
      );
    return new ProfessionDefinition(
      data as ProfessionDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): ProfessionDefinitionState {
    return this.serialize().data as ProfessionDefinitionState;
  }

  protected override handleCommand<
    K extends keyof ProfessionDefinitionCommands,
  >(
    name: K,
    invocation: CommandInvocation<ProfessionDefinitionCommands[K]>,
  ): EntityTransition<ProfessionDefinitionState, ProfessionDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Profession Definition command.");
    if (!ProfessionDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Profession name.");
    const data = this.serializePayload();
    const identity = ProfessionDefinition.isObject(data.identity)
      ? data.identity
      : {};
    const nextName = invocation.params.name.trim();
    if (identity.name === nextName) return { data };
    return {
      data: { ...data, identity: { ...identity, name: nextName } },
      events: [{ name: "renamed", context: { name: nextName } }],
    };
  }

  protected validateState(
    data: DeepReadonly<ProfessionDefinitionState>,
    context: ProfessionDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = ProfessionDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    if (canonicalIssue)
      issues.push({
        code: "profession-canonical-components",
        message: canonicalIssue,
      });
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "profession-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !ProfessionDefinition.isObject(link) ||
            !ProfessionDefinition.text(link.conditionId) ||
            ids.has(link.conditionId) ||
            (context.records &&
              !context.records.find(
                (record) =>
                  record.resourceType === WORLD_CODEX_RESOURCES.conditions &&
                  record.sourceId === link.conditionId,
              )?.payload)
          ) {
            invalid(
              "A granted Condition is duplicated or unavailable in this World.",
            );
            break;
          }
          ids.add(link.conditionId);
        }
        if (grants.length && !context.records)
          issues.push({
            code: "profession-references-unresolved",
            message:
              "Profession Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    if (context.model)
      issues.push(...this.modelIssues(data, context.model, context.mode));
    else
      issues.push({
        code: "profession-model-unresolved",
        message:
          "Profession Model conformance has not been checked against the effective Model Schema.",
        unresolved: true,
      });
    issues.push(...this.characterOptionIssues(data.components, "profession"));
    return issues;
  }

  private modelIssues(
    data: DeepReadonly<ProfessionDefinitionState>,
    model: NonNullable<ProfessionDefinitionValidationContext["model"]>,
    mode?: ProfessionDefinitionValidationContext["mode"],
  ): ValidationIssue[] {
    const issue = (message: string): ValidationIssue[] => [
      { code: "profession-model-invalid", message },
    ];
    const conformance = data.conformance;
    if (!ProfessionDefinition.isObject(conformance))
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
          element.semanticRole === "aow:profession",
      )
    )
      return issue(
        "A governed authored resource uses the wrong Model concept.",
      );
    const components = ProfessionDefinition.isObject(data.components)
      ? data.components
      : {};
    const array = (value: unknown): readonly unknown[] =>
      Array.isArray(value) ? value : [];
    const ranks = array(components.expertiseOrder);
    const references = [...ranks];
    for (const level of array(components.expertiseLevels))
      if (ProfessionDefinition.isObject(level)) references.push(level.tier);
    for (const rule of array(components.acquisition))
      if (ProfessionDefinition.isObject(rule))
        references.push(rule.startingExpertise);
    for (const action of array(components.actions)) {
      if (!ProfessionDefinition.isObject(action)) continue;
      references.push(action.unlocksAt);
      for (const improvement of array(action.improvements))
        if (ProfessionDefinition.isObject(improvement))
          references.push(improvement.atExpertise);
    }
    const byKey = new Map(
      model.elements.map((element) => [element.key, element]),
    );
    if (
      (mode !== "draft" && !ranks.length) ||
      references.some(
        (rank) =>
          !(mode === "draft" && rank === undefined) &&
          (typeof rank !== "string" ||
            byKey.get(rank)?.semanticRole !== "aow:profession-rank"),
      )
    )
      return issue(
        "A Profession Definition must select available Profession Ranks.",
      );
    return [];
  }
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    if (components.expertiseLevels === undefined) return undefined;
    if (!Array.isArray(components.expertiseLevels))
      return "Profession expertise levels must be a list.";
    const ids = new Set<string>();
    for (const level of components.expertiseLevels) {
      if (
        !ProfessionDefinition.isObject(level) ||
        (level.benefits !== undefined &&
          !ProfessionDefinition.isObject(level.benefits))
      )
        return "Each Profession expertise level requires a benefits object.";
      if (!ProfessionDefinition.isObject(level.benefits)) continue;
      const grants = level.benefits.modifierGrants;
      if (grants === undefined) continue;
      if (!Array.isArray(grants) || grants.length > 128)
        return "Profession modifier grants must be a bounded list.";
      for (const grant of grants) {
        const issue = Modifier.grantListIssue([grant], "Profession");
        if (issue) return issue;
        const id = (grant as Record<string, unknown>).id as string;
        if (ids.has(id))
          return "Profession modifier grant names must be unique across expertise tiers.";
        ids.add(id);
      }
    }
    return undefined;
  }

  /** Preserve authored tiers and extensions while selecting the initial creation rank. */
  static authorComponents(
    existing: Readonly<Record<string, JsonValue>>,
    startingProfessionRank?: string,
  ): Record<string, JsonValue> {
    const rank = startingProfessionRank ?? "aow:profession-rank-novice";
    const expertiseOrder = Array.isArray(existing.expertiseOrder)
      ? [...existing.expertiseOrder]
      : [];
    expertiseOrder[0] = rank;
    const expertiseLevels = Array.isArray(existing.expertiseLevels)
      ? existing.expertiseLevels.map((level, index) =>
          index === 0 && this.isObject(level)
            ? { ...level, tier: rank }
            : level,
        )
      : [];
    if (!expertiseLevels.length)
      expertiseLevels.push({ tier: rank, rank: 0, benefits: {} });
    const acquisition = Array.isArray(existing.acquisition)
      ? existing.acquisition.map((rule) =>
          this.isObject(rule) && rule.kind === "character-creation"
            ? { ...rule, startingExpertise: rank }
            : rule,
        )
      : [];
    if (
      !acquisition.some(
        (rule) => this.isObject(rule) && rule.kind === "character-creation",
      )
    )
      acquisition.unshift({
        kind: "character-creation",
        startingExpertise: rank,
      });
    return copyEntityData({
      ...existing,
      expertiseOrder,
      expertiseLevels,
      acquisition,
      actions: Array.isArray(existing.actions) ? existing.actions : [],
    }) as Record<string, JsonValue>;
  }

  static withLevelModifierGrants(
    levels: readonly Readonly<Record<string, JsonValue>>[],
    index: number,
    grants: readonly Readonly<Record<string, JsonValue>>[],
  ): Record<string, JsonValue>[] {
    return copyEntityData(
      levels.map((level, i) =>
        i === index
          ? {
              ...level,
              benefits: {
                ...(this.isObject(level.benefits) ? level.benefits : {}),
                modifierGrants: grants,
              },
            }
          : level,
      ),
    ) as Record<string, JsonValue>[];
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError(
          "Unsupported Profession Definition schema version.",
        );
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Profession Definition requires a bounded JSON object.",
      );
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
}
