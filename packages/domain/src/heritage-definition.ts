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

export interface HeritageDefinitionState extends Record<string, unknown> {
  readonly kind: "heritage";
}
export type HeritageDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type HeritageDefinitionCommands = CodexDefinitionCommands;
export type HeritageDefinitionEvents = CodexDefinitionEvents;

/** Authored Heritage policy; selection and modifier execution remain runtime concerns. */
export class HeritageDefinition extends RuleDefinitionEntity<
  HeritageDefinitionState,
  HeritageDefinitionValidationContext
> {
  private constructor(
    data: HeritageDefinitionState,
    context: HeritageDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("heritage-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: HeritageDefinitionValidationContext = {},
    options?: EntityOptions,
  ): HeritageDefinition {
    return this.deserializePayload(
      this.decode(value, "heritage-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: HeritageDefinitionValidationContext = {},
    options?: EntityOptions,
  ): HeritageDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "heritage")
      throw new TypeError(
        "A Heritage Definition requires a JSON object with Heritage kind.",
      );
    return new HeritageDefinition(
      data as HeritageDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): HeritageDefinitionState {
    return this.serialize().data as HeritageDefinitionState;
  }

  protected override handleCommand<K extends keyof HeritageDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<HeritageDefinitionCommands[K]>,
  ): EntityTransition<HeritageDefinitionState, HeritageDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Heritage Definition command.");
    if (!HeritageDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Heritage name.");
    const data = this.serializePayload();
    const identity = HeritageDefinition.isObject(data.identity)
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
    data: DeepReadonly<HeritageDefinitionState>,
    context: HeritageDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const components = HeritageDefinition.isObject(data.components)
      ? data.components
      : {};
    const canonicalIssue = this.componentsIssue(components);
    if (components.shortDescription === undefined)
      issues.push({
        code: "heritage-description-unresolved",
        message: "Heritage short description has not been supplied.",
        unresolved: true,
      });
    if (components.modifierPairs === undefined)
      issues.push({
        code: "heritage-components-unresolved",
        message: "Heritage paired modifiers have not been supplied.",
        unresolved: true,
      });
    if (canonicalIssue)
      issues.push({
        code: "heritage-components-invalid",
        message: canonicalIssue,
      });
    const grants = components.grantedConditions;
    if (grants !== undefined) {
      const invalid = (message: string) =>
        issues.push({ code: "heritage-codex-granted-conditions", message });
      if (!Array.isArray(grants) || grants.length > 200)
        invalid("Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !HeritageDefinition.isObject(link) ||
            !HeritageDefinition.text(link.conditionId) ||
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
            code: "heritage-references-unresolved",
            message:
              "Heritage Conditions have not been checked against a World capture.",
            unresolved: true,
          });
      }
    }
    issues.push(...this.characterOptionIssues(data.components, "heritage"));
    return issues;
  }

  private componentsIssue(
    components: DeepReadonly<Record<string, unknown>>,
  ): string | undefined {
    if (
      components.shortDescription !== undefined &&
      typeof components.shortDescription !== "string"
    )
      return "Provide a valid Heritage short description.";
    const pairs = components.modifierPairs;
    if (pairs === undefined) return undefined;
    if (!Array.isArray(pairs) || pairs.length === 0)
      return "Provide at least one Heritage modifier pair.";
    const ids = new Set<string>();
    for (const pair of pairs) {
      if (
        !HeritageDefinition.isObject(pair) ||
        (pair.id !== undefined && !HeritageDefinition.text(pair.id)) ||
        (typeof pair.id === "string" && ids.has(pair.id))
      )
        return "Provide distinct Heritage modifier pair identities.";
      if (typeof pair.id === "string") ids.add(pair.id);
      if (
        (pair.title !== undefined && typeof pair.title !== "string") ||
        (pair.description !== undefined && typeof pair.description !== "string")
      )
        return "Provide valid Heritage modifier pair descriptions.";
      for (const side of [pair.beneficial, pair.harmful]) {
        if (side !== undefined && (!Array.isArray(side) || side.length === 0))
          return "Each Heritage pair requires beneficial and harmful modifiers with valid shapes.";
      }
    }
    return undefined;
  }

  /** Edit descriptive foundation modifiers without replacing authored pairs or other consequences. */
  static authorComponents(
    existing: Readonly<Record<string, JsonValue>>,
    description: string,
    benefit?: string,
    drawback?: string,
  ): Record<string, JsonValue> {
    const components = copyEntityData(existing) as Record<string, JsonValue>;
    components.shortDescription = description;
    const pairs = components.modifierPairs;
    if (
      pairs === undefined ||
      (Array.isArray(pairs) &&
        pairs.length === 0 &&
        (benefit !== undefined || drawback !== undefined))
    ) {
      components.modifierPairs = [
        {
          id: "foundation",
          title: "Heritage balance",
          beneficial: [
            {
              kind: "custom",
              key: "aow:heritage-benefit-description",
              payload: benefit ?? "",
            },
          ],
          harmful: [
            {
              kind: "custom",
              key: "aow:heritage-drawback-description",
              payload: drawback ?? "",
            },
          ],
        },
      ];
      return components;
    }
    if (!Array.isArray(pairs)) return components;
    const foundation = pairs.find(
      (pair) => HeritageDefinition.isObject(pair) && pair.id === "foundation",
    );
    if (!HeritageDefinition.isObject(foundation)) {
      if (benefit !== undefined || drawback !== undefined) {
        const created = HeritageDefinition.authorComponents(
          {},
          description,
          benefit,
          drawback,
        );
        pairs.push(...(created.modifierPairs as JsonValue[]));
      }
      return components;
    }
    for (const [side, key, text] of [
      ["beneficial", "aow:heritage-benefit-description", benefit],
      ["harmful", "aow:heritage-drawback-description", drawback],
    ] as const) {
      if (text === undefined) continue;
      const modifiers = foundation[side];
      if (!Array.isArray(modifiers)) continue;
      const matching = modifiers.find(
        (modifier) =>
          HeritageDefinition.isObject(modifier) &&
          modifier.kind === "custom" &&
          modifier.key === key,
      );
      if (HeritageDefinition.isObject(matching)) matching.payload = text;
      else modifiers.push({ kind: "custom", key, payload: text });
    }
    return components;
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Heritage Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Heritage Definition requires a bounded JSON object.",
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
