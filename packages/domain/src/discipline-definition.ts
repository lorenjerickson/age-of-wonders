import { RuleDefinitionEntity } from "./rule-definition-entity";
import { WORLD_CODEX_RESOURCES } from "@aow/common";
import {
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

export interface DisciplineDefinitionState extends Record<string, unknown> {
  readonly kind: "discipline";
}
export type DisciplineDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type DisciplineDefinitionCommands = CodexDefinitionCommands;
export type DisciplineDefinitionEvents = CodexDefinitionEvents;

/** Authored Discipline structure and compatibility; execution remains a runtime concern. */
export class DisciplineDefinition extends RuleDefinitionEntity<
  DisciplineDefinitionState,
  DisciplineDefinitionValidationContext
> {
  private constructor(
    data: DisciplineDefinitionState,
    context: DisciplineDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("discipline-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: DisciplineDefinitionValidationContext = {},
    options?: EntityOptions,
  ): DisciplineDefinition {
    return this.deserializePayload(
      this.decode(value, "discipline-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: DisciplineDefinitionValidationContext = {},
    options?: EntityOptions,
  ): DisciplineDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "discipline")
      throw new TypeError(
        "A Discipline Definition requires a JSON object with Discipline kind.",
      );
    return new DisciplineDefinition(
      data as DisciplineDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): DisciplineDefinitionState {
    return this.serialize().data as DisciplineDefinitionState;
  }

  protected override handleCommand<
    K extends keyof DisciplineDefinitionCommands,
  >(
    name: K,
    invocation: CommandInvocation<DisciplineDefinitionCommands[K]>,
  ): EntityTransition<DisciplineDefinitionState, DisciplineDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Discipline Definition command.");
    if (!DisciplineDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Discipline name.");
    const data = this.serializePayload();
    const identity = DisciplineDefinition.isObject(data.identity)
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
    data: DeepReadonly<DisciplineDefinitionState>,
    context: DisciplineDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = DisciplineDefinition.isObject(data.components)
      ? data.components
      : {};
    const required = [
      "band",
      "functionTags",
      "operatingBasis",
      "understanding",
      "observedPhenomenon",
      "activationTime",
      "range",
      "inputs",
      "duration",
      "outcomes",
    ];
    if (required.some((field) => components[field] === undefined))
      issues.push({
        code: "discipline-components-unresolved",
        message: "Required Discipline information has not been supplied.",
        unresolved: true,
      });
    if (
      data.components !== undefined &&
      !DisciplineDefinition.isObject(data.components)
    )
      issues.push({
        code: "discipline-components-invalid",
        message: "Provide a valid Discipline components object.",
      });
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "discipline-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !DisciplineDefinition.isObject(link) ||
            !DisciplineDefinition.text(link.conditionId) ||
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
            code: "discipline-references-unresolved",
            message:
              "Discipline Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    issues.push(...this.characterOptionIssues(data.components, "discipline"));
    return issues;
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError(
          "Unsupported Discipline Definition schema version.",
        );
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Discipline Definition requires a bounded JSON object.",
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
