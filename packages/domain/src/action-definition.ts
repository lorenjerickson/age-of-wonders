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

export interface ActionDefinitionState extends Record<string, unknown> {
  readonly kind: "action";
}
export type ActionDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type ActionDefinitionCommands = CodexDefinitionCommands;
export type ActionDefinitionEvents = CodexDefinitionEvents;

/** Authored Action structure and compatibility; execution remains a runtime concern. */
export class ActionDefinition extends RuleDefinitionEntity<
  ActionDefinitionState,
  ActionDefinitionValidationContext
> {
  private constructor(
    data: ActionDefinitionState,
    context: ActionDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("action-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: ActionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ActionDefinition {
    return this.deserializePayload(
      this.decode(value, "action-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: ActionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ActionDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "action")
      throw new TypeError(
        "An Action Definition requires a JSON object with Action kind.",
      );
    return new ActionDefinition(
      data as ActionDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): ActionDefinitionState {
    return this.serialize().data as ActionDefinitionState;
  }

  protected override handleCommand<K extends keyof ActionDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<ActionDefinitionCommands[K]>,
  ): EntityTransition<ActionDefinitionState, ActionDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Action Definition command.");
    if (!ActionDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Action name.");
    const data = this.serializePayload();
    const identity = ActionDefinition.isObject(data.identity)
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
    data: DeepReadonly<ActionDefinitionState>,
    context: ActionDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = ActionDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    const required = ["activation", "outcomes"];
    if (required.some((field) => components[field] === undefined))
      issues.push({
        code: "action-components-unresolved",
        message: "Required Action information has not been supplied.",
        unresolved: true,
      });
    if (
      data.components !== undefined &&
      !ActionDefinition.isObject(data.components)
    )
      issues.push({
        code: "action-components-invalid",
        message: "Provide a valid Action components object.",
      });
    if (canonicalIssue)
      issues.push({
        code: "action-components-invalid",
        message: canonicalIssue,
      });
    issues.push(...this.outcomeIssues(components.outcomes));
    issues.push(...this.costIssues(components.costs));
    issues.push(
      ...this.usageLimitIssues(
        components.limit,
        "components.limit",
        "action-limit",
      ),
    );
    for (const [key, grammar] of [
      ["test", "test"],
      ["duration", "duration"],
    ])
      if (components[key] !== undefined)
        issues.push(
          ...this.ruleValueIssues(
            components[key],
            `components.${key}`,
            `action-${key}`,
            grammar,
          ),
        );
    if (Array.isArray(components.targets))
      components.targets.forEach((target, index) =>
        issues.push(
          ...this.ruleValueIssues(
            target,
            `components.targets[${index}]`,
            "action-target",
            "target",
          ),
        ),
      );
    issues.push(...this.choiceIssues(components.choices, "Action"));
    issues.push(...this.prerequisiteIssues(components.prerequisites, "Action"));
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "action-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !ActionDefinition.isObject(link) ||
            !ActionDefinition.text(link.conditionId) ||
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
            code: "action-references-unresolved",
            message:
              "Action Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    return issues;
  }

  /** Cost values belong to the Action; expression evaluation and reference binding remain deferred. */
  private static isActivation(value: unknown): boolean {
    return (
      typeof value === "string" &&
      [
        "action",
        "bonus-action",
        "reaction",
        "free-action",
        "movement",
        "legendary-action",
        "lair-action",
        "mythic-action",
        "special",
        "passive",
      ].includes(value)
    );
  }

  private outcomeIssues(outcomes: unknown): ValidationIssue[] {
    if (!Array.isArray(outcomes)) return [];
    return outcomes.flatMap((outcome, index) =>
      ActionDefinition.isObject(outcome)
        ? [
            ...this.effectIssues(
              outcome.effects,
              `components.outcomes[${index}].effects`,
              "Action",
            ),
            ...(outcome.when === undefined
              ? []
              : this.predicateIssues(
                  outcome.when,
                  `components.outcomes[${index}].when`,
                  "action-outcome-predicate",
                )),
          ]
        : [],
    );
  }

  /** Container compatibility checks complement the recursive structural grammar above. */
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    const arrayOf =
      (predicate: (value: unknown) => boolean) => (value: unknown) =>
        Array.isArray(value) && value.every(predicate);
    const object = ActionDefinition.isObject;
    const tagged = (value: unknown) =>
      object(value) && typeof value.kind === "string";
    const checks: Record<string, (value: unknown) => boolean> = {
      activation: ActionDefinition.isActivation,
      costs: arrayOf(tagged),
      prerequisites: arrayOf(tagged),
      targets: arrayOf(tagged),
      choices: arrayOf(object),
      test: object,
      outcomes: arrayOf(
        (value) =>
          object(value) &&
          typeof value.id === "string" &&
          arrayOf(tagged)(value.effects) &&
          (value.when === undefined || tagged(value.when)),
      ),
      sustainedOperation: (value) => typeof value === "boolean",
      duration: tagged,
    };
    for (const [field, check] of Object.entries(checks)) {
      if (components[field] !== undefined && !check(components[field]))
        return `Provide a valid Action ${field} value.`;
    }
    return undefined;
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Action Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "An Action Definition requires a bounded JSON object.",
      );
    return payload;
  }

  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
}
