import { RuleDefinitionEntity } from "./rule-definition-entity";
import { TraitDefinition } from "./trait-definition";
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

export interface FeatDefinitionState extends Record<string, unknown> {
  readonly kind: "feat";
}
export type FeatDefinitionValidationContext = CodexDefinitionValidationContext;
export type FeatDefinitionCommands = CodexDefinitionCommands;
export type FeatDefinitionEvents = CodexDefinitionEvents;

/** Authored Feat structure and compatibility; execution remains a runtime concern. */
export class FeatDefinition extends RuleDefinitionEntity<
  FeatDefinitionState,
  FeatDefinitionValidationContext
> {
  private constructor(
    data: FeatDefinitionState,
    context: FeatDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("feat-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: FeatDefinitionValidationContext = {},
    options?: EntityOptions,
  ): FeatDefinition {
    return this.deserializePayload(
      this.decode(value, "feat-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: FeatDefinitionValidationContext = {},
    options?: EntityOptions,
  ): FeatDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "feat")
      throw new TypeError(
        "A Feat Definition requires a JSON object with Feat kind.",
      );
    return new FeatDefinition(data as FeatDefinitionState, context, options);
  }

  serializePayload(): FeatDefinitionState {
    return this.serialize().data as FeatDefinitionState;
  }

  protected override handleCommand<K extends keyof FeatDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<FeatDefinitionCommands[K]>,
  ): EntityTransition<FeatDefinitionState, FeatDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Feat Definition command.");
    if (!FeatDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Feat name.");
    const data = this.serializePayload();
    const identity = FeatDefinition.isObject(data.identity)
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
    data: DeepReadonly<FeatDefinitionState>,
    context: FeatDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = FeatDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    const required = ["traits"];
    if (required.some((field) => components[field] === undefined))
      issues.push({
        code: "feat-components-unresolved",
        message: "Required Feat information has not been supplied.",
        unresolved: true,
      });
    if (
      data.components !== undefined &&
      !FeatDefinition.isObject(data.components)
    )
      issues.push({
        code: "feat-components-invalid",
        message: "Provide a valid Feat components object.",
      });
    if (canonicalIssue)
      issues.push({
        code: "feat-components-invalid",
        message: canonicalIssue,
      });
    // Embedded definitions own their validation; their metadata never enters authored data.
    if (Array.isArray(components.traits)) {
      for (const [index, value] of components.traits.entries()) {
        if (!FeatDefinition.isObject(value) || value.kind !== "trait") continue;
        const child = TraitDefinition.deserializePayload(value, {
          mode: context.mode,
          records: context.records,
        });
        try {
          for (const issue of child.state.metadata.validity.issues)
            issues.push({
              ...issue,
              code: `feat-traits-${issue.code}`,
              path: `components.traits[${index}].${issue.path ?? "components"}`,
            });
        } finally {
          child.dispose();
        }
      }
    }
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "feat-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !FeatDefinition.isObject(link) ||
            !FeatDefinition.text(link.conditionId) ||
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
            code: "feat-references-unresolved",
            message:
              "Feat Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    issues.push(...this.characterOptionIssues(data.components, "feat"));
    return issues;
  }

  /** Container structure; embedded Traits validate themselves and shared grammar validates prerequisites/Choices. */
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    const arrayOf =
      (predicate: (value: unknown) => boolean) => (value: unknown) =>
        Array.isArray(value) && value.every(predicate);
    const object = FeatDefinition.isObject;
    const checks: Record<string, (value: unknown) => boolean> = {
      category: (value) => typeof value === "string",
      repeatable: (value) => typeof value === "boolean",
      prerequisites: arrayOf(
        (value) => object(value) && typeof value.kind === "string",
      ),
      traits: arrayOf((value) => object(value) && value.kind === "trait"),
      choices: arrayOf(object),
    };
    for (const [field, check] of Object.entries(checks)) {
      if (components[field] !== undefined && !check(components[field]))
        return `Provide a valid Feat ${field} value.`;
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
        throw new TypeError("Unsupported Feat Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError("A Feat Definition requires a bounded JSON object.");
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
}
