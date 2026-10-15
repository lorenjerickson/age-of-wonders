import { RuleDefinitionEntity } from "./rule-definition-entity";
import { ActionDefinition } from "./action-definition";
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

export interface TraitDefinitionState extends Record<string, unknown> {
  readonly kind: "trait";
}
export type TraitDefinitionValidationContext = CodexDefinitionValidationContext;
export type TraitDefinitionCommands = CodexDefinitionCommands;
export type TraitDefinitionEvents = CodexDefinitionEvents;

/** Authored Trait structure and compatibility; execution remains a runtime concern. */
export class TraitDefinition extends RuleDefinitionEntity<
  TraitDefinitionState,
  TraitDefinitionValidationContext
> {
  private constructor(
    data: TraitDefinitionState,
    context: TraitDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("trait-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: TraitDefinitionValidationContext = {},
    options?: EntityOptions,
  ): TraitDefinition {
    return this.deserializePayload(
      this.decode(value, "trait-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: TraitDefinitionValidationContext = {},
    options?: EntityOptions,
  ): TraitDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "trait")
      throw new TypeError(
        "A Trait Definition requires a JSON object with Trait kind.",
      );
    return new TraitDefinition(data as TraitDefinitionState, context, options);
  }

  serializePayload(): TraitDefinitionState {
    return this.serialize().data as TraitDefinitionState;
  }

  protected override handleCommand<K extends keyof TraitDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<TraitDefinitionCommands[K]>,
  ): EntityTransition<TraitDefinitionState, TraitDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Trait Definition command.");
    if (!TraitDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Trait name.");
    const data = this.serializePayload();
    const identity = TraitDefinition.isObject(data.identity)
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
    data: DeepReadonly<TraitDefinitionState>,
    context: TraitDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = TraitDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    if (data.components === undefined)
      issues.push({
        code: "trait-components-unresolved",
        message: "Required Trait information has not been supplied.",
        unresolved: true,
      });
    if (
      data.components !== undefined &&
      !TraitDefinition.isObject(data.components)
    )
      issues.push({
        code: "trait-components-invalid",
        message: "Provide a valid Trait components object.",
      });
    if (canonicalIssue)
      issues.push({
        code: "trait-components-invalid",
        message: canonicalIssue,
      });
    issues.push(...this.triggerIssues(components.triggers));
    issues.push(...this.modifierIssues(components.modifiers));
    issues.push(...this.choiceIssues(components.choices, "Trait"));
    issues.push(...this.prerequisiteIssues(components.prerequisites, "Trait"));
    // Embedded definitions own their validation; their metadata never enters authored data.
    if (Array.isArray(components.actions)) {
      for (const [index, value] of components.actions.entries()) {
        if (!TraitDefinition.isObject(value) || value.kind !== "action")
          continue;
        const child = ActionDefinition.deserializePayload(value, {
          mode: context.mode,
          records: context.records,
        });
        try {
          for (const issue of child.state.metadata.validity.issues)
            issues.push({
              ...issue,
              code: `trait-actions-${issue.code}`,
              path: `components.actions[${index}].${issue.path ?? "components"}`,
            });
        } finally {
          child.dispose();
        }
      }
    }
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "trait-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !TraitDefinition.isObject(link) ||
            !TraitDefinition.text(link.conditionId) ||
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
            code: "trait-references-unresolved",
            message:
              "Trait Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    return issues;
  }

  /** Trigger metadata, predicates, usage limits and edited effects belong to Trait; execution remains deferred. */
  private triggerIssues(triggers: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (triggers === undefined) return issues;
    const field = (
      value: unknown,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code: `trait-trigger-${value === undefined ? "unresolved" : "invalid"}`,
          message:
            value === undefined
              ? "Supply the trigger value."
              : "Provide a valid trigger value.",
          path,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    field(triggers, "components.triggers", Array.isArray);
    if (!Array.isArray(triggers)) return issues;
    const string = (value: unknown) => typeof value === "string";
    const tagged = (value: unknown) =>
      TraitDefinition.isObject(value) && string(value.kind);
    triggers.forEach((trigger, index) => {
      const path = `components.triggers[${index}]`;
      field(trigger, path, TraitDefinition.isObject);
      if (!TraitDefinition.isObject(trigger)) return;
      field(trigger.event, `${path}.event`, (value) =>
        TraitDefinition.triggerEvents.includes(value as string),
      );
      field(
        trigger.customEvent,
        `${path}.customEvent`,
        (value) => string(value) && value.includes(":"),
        false,
      );
      field(
        trigger.timing,
        `${path}.timing`,
        (value) => ["before", "replace", "after"].includes(value as string),
        false,
      );
      field(
        trigger.optional,
        `${path}.optional`,
        (value) => typeof value === "boolean",
        false,
      );
      field(
        trigger.priority,
        `${path}.priority`,
        (value) => typeof value === "number" && Number.isFinite(value),
        false,
      );
      field(
        trigger.effects,
        `${path}.effects`,
        (value) => Array.isArray(value) && value.every(tagged),
      );
      issues.push(
        ...this.effectIssues(trigger.effects, `${path}.effects`, "Trait"),
      );
      issues.push(
        ...this.usageLimitIssues(
          trigger.limit,
          `${path}.limit`,
          "trait-trigger",
        ),
      );
      if (trigger.predicate !== undefined)
        issues.push(
          ...this.predicateIssues(
            trigger.predicate,
            `${path}.predicate`,
            "trait-trigger",
          ),
        );
    });
    return issues;
  }

  /** RuleModifier is an owned value object, separate from catalog Modifier definitions. */
  private modifierIssues(modifiers: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (modifiers === undefined) return issues;
    const field = (
      value: unknown,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code: `trait-modifier-${value === undefined ? "unresolved" : "invalid"}`,
          message:
            value === undefined
              ? "Supply the modifier value."
              : "Provide a valid modifier value.",
          path,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    field(modifiers, "components.modifiers", Array.isArray);
    if (!Array.isArray(modifiers)) return issues;
    const string = (value: unknown) => typeof value === "string";
    modifiers.forEach((modifier, index) => {
      const path = `components.modifiers[${index}]`;
      field(modifier, path, TraitDefinition.isObject);
      if (!TraitDefinition.isObject(modifier)) return;
      for (const key of ["id", "target"])
        field(modifier[key], `${path}.${key}`, string);
      field(modifier.operation, `${path}.operation`, (value) =>
        [
          "add",
          "subtract",
          "multiply",
          "divide",
          "set",
          "minimum",
          "maximum",
          "grant-advantage",
          "grant-disadvantage",
          "grant-proficiency",
          "grant-expertise",
          "allow",
          "prohibit",
        ].includes(value as string),
      );
      field(
        modifier.priority,
        `${path}.priority`,
        (value) => typeof value === "number" && Number.isFinite(value),
        false,
      );
      field(
        modifier.stacking,
        `${path}.stacking`,
        (value) =>
          [
            "stack",
            "highest",
            "lowest",
            "replace",
            "unique-by-source",
          ].includes(value as string),
        false,
      );
      field(modifier.sourceLabel, `${path}.sourceLabel`, string, false);
      if (modifier.value !== undefined)
        issues.push(
          ...this.scalarExpressionIssues(
            modifier.value,
            `${path}.value`,
            "trait-modifier",
          ),
        );
      if (modifier.predicate !== undefined)
        issues.push(
          ...this.predicateIssues(
            modifier.predicate,
            `${path}.predicate`,
            "trait-modifier",
          ),
        );
    });
    return issues;
  }

  /** Container structure; embedded Actions validate themselves. Prerequisites share the authored rule grammar; other nested rules remain shallow. */
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    const arrayOf =
      (predicate: (value: unknown) => boolean) => (value: unknown) =>
        Array.isArray(value) && value.every(predicate);
    const object = TraitDefinition.isObject;
    const tagged = (value: unknown) =>
      object(value) && typeof value.kind === "string";
    const checks: Record<string, (value: unknown) => boolean> = {
      prerequisites: arrayOf(tagged),
      modifiers: arrayOf(object),
      actions: arrayOf((value) => object(value) && value.kind === "action"),
      grants: arrayOf((value) => typeof value === "string"),
      choices: arrayOf(object),
    };
    for (const [field, check] of Object.entries(checks)) {
      if (components[field] !== undefined && !check(components[field]))
        return `Provide a valid Trait ${field} value.`;
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
        throw new TypeError("Unsupported Trait Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError("A Trait Definition requires a bounded JSON object.");
    return payload;
  }

  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
}
