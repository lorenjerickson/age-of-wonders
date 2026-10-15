import { RuleDefinitionEntity } from "./rule-definition-entity";
import { TraitDefinition } from "./trait-definition";
import { WORLD_CODEX_RESOURCES, isAttributeScore } from "@aow/common";
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

export interface CharacterDefinitionState extends Record<string, unknown> {
  readonly kind: "character-template";
}
export type CharacterDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type CharacterDefinitionCommands = CodexDefinitionCommands;
export type CharacterDefinitionEvents = CodexDefinitionEvents;

/** Common Character Definition template; distinct from flat NPC CharacterTemplate and runtime Character. */
export class CharacterDefinition extends RuleDefinitionEntity<
  CharacterDefinitionState,
  CharacterDefinitionValidationContext
> {
  private constructor(
    data: CharacterDefinitionState,
    context: CharacterDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("character-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: CharacterDefinitionValidationContext = {},
    options?: EntityOptions,
  ): CharacterDefinition {
    return this.deserializePayload(
      this.decode(value, "character-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: CharacterDefinitionValidationContext = {},
    options?: EntityOptions,
  ): CharacterDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "character-template")
      throw new TypeError(
        "A Character Definition requires a JSON object with Character kind.",
      );
    return new CharacterDefinition(
      data as CharacterDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): CharacterDefinitionState {
    return this.serialize().data as CharacterDefinitionState;
  }

  protected override handleCommand<K extends keyof CharacterDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<CharacterDefinitionCommands[K]>,
  ): EntityTransition<CharacterDefinitionState, CharacterDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Character Definition command.");
    if (!CharacterDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Character name.");
    const data = this.serializePayload();
    const identity = CharacterDefinition.isObject(data.identity)
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
    data: DeepReadonly<CharacterDefinitionState>,
    context: CharacterDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = CharacterDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    const required = ["attributeDefaults"];
    if (required.some((field) => components[field] === undefined))
      issues.push({
        code: "character-definition-components-unresolved",
        message: "Required Character information has not been supplied.",
        unresolved: true,
      });
    if (
      data.components !== undefined &&
      !CharacterDefinition.isObject(data.components)
    )
      issues.push({
        code: "character-definition-components-invalid",
        message: "Provide a valid Character components object.",
      });
    if (canonicalIssue)
      issues.push({
        code: "character-definition-components-invalid",
        message: canonicalIssue.message,
        path: canonicalIssue.path,
      });
    issues.push(...this.choiceIssues(components.choices, "Character"));
    if (
      CharacterDefinition.isObject(components.attributeGeneration) &&
      components.attributeGeneration.kind === "roll"
    )
      issues.push(
        ...this.ruleValueIssues(
          components.attributeGeneration.expression,
          "components.attributeGeneration.expression",
          "character-generation",
          "dice-expression",
        ),
      );
    // Embedded definitions own their validation; their metadata never enters authored data.
    if (Array.isArray(components.traits)) {
      for (const [index, value] of components.traits.entries()) {
        if (!CharacterDefinition.isObject(value) || value.kind !== "trait")
          continue;
        const child = TraitDefinition.deserializePayload(value, {
          mode: context.mode,
          records: context.records,
        });
        try {
          for (const issue of child.state.metadata.validity.issues)
            issues.push({
              ...issue,
              code: `character-definition-traits-${issue.code}`,
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
        issues.push({
          code: "character-definition-codex-granted-conditions",
          message,
        });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !CharacterDefinition.isObject(link) ||
            !CharacterDefinition.text(link.conditionId) ||
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
            code: "character-definition-references-unresolved",
            message:
              "Character Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    return issues;
  }

  /** Container structure; embedded Traits validate themselves. Choices and rolled attribute generation use the shared rule grammar. */
  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): { message: string; path: string } | undefined {
    const arrayOf =
      (predicate: (value: unknown) => boolean) => (value: unknown) =>
        Array.isArray(value) && value.every(predicate);
    const object = CharacterDefinition.isObject;
    const checks: Record<string, (value: unknown) => boolean> = {
      minimumLevel: (value) => typeof value === "number",
      maximumLevel: (value) => typeof value === "number",
      attributeDefaults: (value) =>
        object(value) &&
        Object.values(value).every(
          (score) => typeof score === "number" && isAttributeScore(score),
        ),
      attributeGeneration: (value) => {
        if (!object(value)) return false;
        switch (value.kind) {
          case "standard-array":
            return arrayOf(
              (score) => typeof score === "number" && isAttributeScore(score),
            )(value.values);
          case "point-buy":
            return (
              typeof value.points === "number" &&
              object(value.costs) &&
              Object.values(value.costs).every(
                (cost) => typeof cost === "number",
              )
            );
          case "roll":
            return object(value.expression) && typeof value.count === "number";
          case "custom":
            return typeof value.description === "string";
          default:
            return false;
        }
      },
      traits: arrayOf((value) => object(value) && value.kind === "trait"),
      choices: arrayOf(object),
    };
    for (const [field, check] of Object.entries(checks)) {
      if (components[field] !== undefined && !check(components[field]))
        return {
          message: `Provide a valid Character ${field} value.`,
          path: `components.${field}`,
        };
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
        throw new TypeError("Unsupported Character Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Character Definition requires a bounded JSON object.",
      );
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
  protected static isJson(
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
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      this.isJson(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}
