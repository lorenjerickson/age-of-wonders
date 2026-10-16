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

export interface BackgroundDefinitionState extends Record<string, unknown> {
  readonly kind: "background";
}
export interface BackgroundDefinitionValidationContext extends CodexDefinitionValidationContext {
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
export type BackgroundDefinitionCommands = CodexDefinitionCommands;
export type BackgroundDefinitionEvents = CodexDefinitionEvents;

/** Authored Background policy; acquisition and modifier execution remain runtime concerns. */
export class BackgroundDefinition extends RuleDefinitionEntity<
  BackgroundDefinitionState,
  BackgroundDefinitionValidationContext
> {
  private constructor(
    data: BackgroundDefinitionState,
    context: BackgroundDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("background-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: BackgroundDefinitionValidationContext = {},
    options?: EntityOptions,
  ): BackgroundDefinition {
    return this.deserializePayload(
      this.decode(value, "background-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: BackgroundDefinitionValidationContext = {},
    options?: EntityOptions,
  ): BackgroundDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "background")
      throw new TypeError(
        "A Background Definition requires a JSON object with Background kind.",
      );
    return new BackgroundDefinition(
      data as BackgroundDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): BackgroundDefinitionState {
    return this.serialize().data as BackgroundDefinitionState;
  }

  protected override handleCommand<
    K extends keyof BackgroundDefinitionCommands,
  >(
    name: K,
    invocation: CommandInvocation<BackgroundDefinitionCommands[K]>,
  ): EntityTransition<BackgroundDefinitionState, BackgroundDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Background Definition command.");
    if (!BackgroundDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Background name.");
    const data = this.serializePayload();
    const identity = BackgroundDefinition.isObject(data.identity)
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
    data: DeepReadonly<BackgroundDefinitionState>,
    context: BackgroundDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = BackgroundDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    if (canonicalIssue)
      issues.push({
        code: "background-canonical-components",
        message: canonicalIssue,
      });
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "background-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !BackgroundDefinition.isObject(link) ||
            !BackgroundDefinition.text(link.conditionId) ||
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
            code: "background-references-unresolved",
            message:
              "Background Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    const effectGrants = components.grantedEffects;
    if (effectGrants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "background-codex-granted-effects", message });
      if (!Array.isArray(effectGrants) || effectGrants.length > 200)
        invalid("Choose a valid granted Effect list.");
      else {
        const ids = new Set<string>();
        for (const link of effectGrants) {
          if (
            !BackgroundDefinition.isObject(link) ||
            !BackgroundDefinition.text(link.effectId) ||
            ids.has(link.effectId) ||
            (context.records &&
              !context.records.find(
                (record) =>
                  record.resourceType === WORLD_CODEX_RESOURCES.effects &&
                  record.sourceId === link.effectId,
              )?.payload)
          ) {
            invalid(
              "A granted Effect is duplicated or unavailable in this World.",
            );
            break;
          }
          ids.add(link.effectId);
        }
        if (effectGrants.length && !context.records)
          issues.push({
            code: "background-references-unresolved",
            message:
              "Background Effects have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    if (context.model) issues.push(...this.modelIssues(data, context.model));
    else
      issues.push({
        code: "background-model-unresolved",
        message:
          "Background Model conformance has not been checked against the effective Model Schema.",
        unresolved: true,
      });
    issues.push(...this.characterOptionIssues(data.components, "background"));
    return issues;
  }

  private modelIssues(
    data: DeepReadonly<BackgroundDefinitionState>,
    model: NonNullable<BackgroundDefinitionValidationContext["model"]>,
  ): ValidationIssue[] {
    const issue = (message: string): ValidationIssue[] => [
      { code: "background-model-invalid", message },
    ];
    const conformance = data.conformance;
    if (!BackgroundDefinition.isObject(conformance))
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
          element.semanticRole === "aow:background",
      )
    )
      return issue(
        "A governed authored resource uses the wrong Model concept.",
      );
    return [];
  }
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    if (components.modifierGrants === undefined) return undefined;
    return Modifier.grantListIssue(components.modifierGrants, "Background");
  }

  /** Preserve authored benefits and extensions in a detached draft. */
  static authorComponents(
    existing: Readonly<Record<string, JsonValue>>,
  ): Record<string, JsonValue> {
    return copyEntityData(existing) as Record<string, JsonValue>;
  }

  static withModifierGrants(
    existing: Readonly<Record<string, JsonValue>>,
    grants: readonly Readonly<Record<string, JsonValue>>[],
  ): Record<string, JsonValue> {
    return copyEntityData({
      ...existing,
      modifierGrants: [...grants],
    }) as Record<string, JsonValue>;
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError(
          "Unsupported Background Definition schema version.",
        );
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Background Definition requires a bounded JSON object.",
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
