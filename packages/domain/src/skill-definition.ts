import {
  Entity,
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

export interface SkillDefinitionState extends Record<string, unknown> {
  readonly kind: "skill";
}
export interface SkillDefinitionValidationContext extends CodexDefinitionValidationContext {
  readonly definitionIds?: readonly string[];
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
export type SkillDefinitionCommands = CodexDefinitionCommands;
export type SkillDefinitionEvents = CodexDefinitionEvents;

/** Authored Skill policy; acquisition and modifier execution remain runtime concerns. */
export class SkillDefinition extends Entity<
  SkillDefinitionState,
  SkillDefinitionCommands,
  SkillDefinitionEvents,
  SkillDefinitionValidationContext
> {
  private constructor(
    data: SkillDefinitionState,
    context: SkillDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("skill-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: SkillDefinitionValidationContext = {},
    options?: EntityOptions,
  ): SkillDefinition {
    return this.deserializePayload(
      this.decode(value, "skill-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: SkillDefinitionValidationContext = {},
    options?: EntityOptions,
  ): SkillDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "skill")
      throw new TypeError(
        "A Skill Definition requires a JSON object with Skill kind.",
      );
    return new SkillDefinition(data as SkillDefinitionState, context, options);
  }

  serializePayload(): SkillDefinitionState {
    return this.serialize().data as SkillDefinitionState;
  }

  protected override handleCommand<K extends keyof SkillDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<SkillDefinitionCommands[K]>,
  ): EntityTransition<SkillDefinitionState, SkillDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Skill Definition command.");
    if (!SkillDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Skill name.");
    const data = this.serializePayload();
    const identity = SkillDefinition.isObject(data.identity)
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
    data: DeepReadonly<SkillDefinitionState>,
    context: SkillDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = SkillDefinition.isObject(data.components)
      ? data.components
      : {};
    const professions = components.associatedProfessionIds;
    if (
      professions !== undefined &&
      (!Array.isArray(professions) ||
        professions.length > 128 ||
        !professions.every(
          (value) => typeof value === "string" && !!value.trim(),
        ) ||
        new Set(professions).size !== professions.length)
    )
      issues.push({
        code: "skill-canonical-components",
        message:
          "Associated Professions must be a bounded list of distinct references.",
      });
    else if (components.modifierGrants !== undefined) {
      const message = Modifier.grantListIssue(
        components.modifierGrants,
        "Skill",
      );
      if (message) issues.push({ code: "skill-canonical-components", message });
    }
    if (Array.isArray(professions)) {
      if (context.records && context.definitionIds) {
        for (const id of professions) {
          const record = context.records.find(
            (record) =>
              record.resourceType === "definitions" && record.sourceId === id,
          );
          if (
            typeof id !== "string" ||
            !context.definitionIds.includes(id) ||
            !record ||
            !SkillDefinition.isObject(record.payload) ||
            record.payload.kind !== "profession"
          )
            issues.push({
              code: "skill-profession-missing",
              message: "An associated Profession is unavailable in this World.",
            });
        }
      } else if (professions.length)
        issues.push({
          code: "skill-references-unresolved",
          message:
            "Skill Professions have not been checked against a World capture.",
          unresolved: true,
        });
    }
    if (context.model) issues.push(...this.modelIssues(data, context.model));
    else
      issues.push({
        code: "skill-model-unresolved",
        message:
          "Skill Model conformance has not been checked against the effective Model Schema.",
        unresolved: true,
      });
    return issues;
  }

  private modelIssues(
    data: DeepReadonly<SkillDefinitionState>,
    model: NonNullable<SkillDefinitionValidationContext["model"]>,
  ): ValidationIssue[] {
    const issue = (message: string): ValidationIssue[] => [
      { code: "skill-model-invalid", message },
    ];
    const conformance = data.conformance;
    if (!SkillDefinition.isObject(conformance))
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
          element.semanticRole === "aow:skill",
      )
    )
      return issue(
        "A governed authored resource uses the wrong Model concept.",
      );
    const components = SkillDefinition.isObject(data.components)
      ? data.components
      : {};
    const defaultAttribute = components.defaultAttribute;
    const byKey = new Map(
      model.elements.map((element) => [element.key, element]),
    );
    if (
      defaultAttribute !== undefined &&
      (typeof defaultAttribute !== "string" ||
        byKey.get(defaultAttribute)?.semanticRole !== "aow:attribute")
    )
      return issue(
        "A Skill Definition must select an available default Attribute.",
      );
    return [];
  }
  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Skill Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError("A Skill Definition requires a bounded JSON object.");
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
  private static isJson(
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
