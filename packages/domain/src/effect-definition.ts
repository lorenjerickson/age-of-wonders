import { WORLD_CODEX_RESOURCES } from "@aow/common";
import {
  type DeepReadonly,
  type EntityOptions,
  type ValidationIssue,
} from "./entity";
import {
  CodexDefinition,
  type CodexDefinitionState,
  type CodexDefinitionValidationContext,
  type CodexDefinitionCommands,
  type CodexDefinitionEvents,
} from "./codex-definition";

export type EffectDefinitionState = CodexDefinitionState;
export type EffectDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type EffectDefinitionCommands = CodexDefinitionCommands;
export type EffectDefinitionEvents = CodexDefinitionEvents;

/** Authored Effect composition; does not apply modifiers or execute gameplay. */
export class EffectDefinition extends CodexDefinition {
  private constructor(
    data: EffectDefinitionState,
    context: EffectDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("effect-definition", data, context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: EffectDefinitionValidationContext = {},
    options?: EntityOptions,
  ): EffectDefinition {
    return new EffectDefinition(
      this.decode(value, "effect-definition"),
      context,
      options,
    );
  }

  /** Hydrate a persisted resource; never interpret author input as an entity envelope. */
  static deserializePayload(
    value: unknown,
    context: EffectDefinitionValidationContext = {},
    options?: EntityOptions,
  ): EffectDefinition {
    return new EffectDefinition(this.decodePayload(value), context, options);
  }

  /** A linked legacy Effect may declare modifiers before its full authoring state is valid. */
  hasModifierDefinitions(): boolean {
    return Array.isArray(this.state.data.modifiers);
  }

  /** Explicit capability; Condition never needs to parse Effect storage fields. */
  permitsOverride(modifierId: string): boolean {
    const modifiers = this.state.data.modifiers;
    return (
      Array.isArray(modifiers) &&
      modifiers.some(
        (modifier: unknown) =>
          EffectDefinition.isObject(modifier) &&
          modifier.id === modifierId &&
          modifier.allowConditionOverride === true,
      )
    );
  }

  protected validateState(
    data: DeepReadonly<EffectDefinitionState>,
    context: EffectDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const identity = this.identityIssues(data, context, "effect");
    if (identity.length) return identity;
    const issue = (code: string, message: string): ValidationIssue[] => [
      { code: `effect-codex-${code}`, message },
    ];
    if (!EffectDefinition.array(data.modifiers) || data.modifiers.length === 0)
      return issue("modifiers", "Add at least one numeric property modifier.");
    const ids = new Set<string>();
    for (const modifier of data.modifiers) {
      if (
        !EffectDefinition.isObject(modifier) ||
        !EffectDefinition.text(modifier.id) ||
        ids.has(modifier.id) ||
        !EffectDefinition.text(modifier.propertyPath) ||
        !/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(modifier.propertyPath) ||
        modifier.propertyPath
          .split(".")
          .some((part) =>
            ["__proto__", "constructor", "prototype"].includes(part),
          ) ||
        !["add", "set", "multiply"].includes(String(modifier.operation)) ||
        !EffectDefinition.finite(modifier.value) ||
        typeof modifier.allowConditionOverride !== "boolean" ||
        (modifier.unit !== undefined &&
          !EffectDefinition.text(modifier.unit, 80))
      )
        return issue(
          "modifier",
          "Each modifier needs a unique key, numeric property, operation and finite value.",
        );
      if (
        context.records &&
        !EffectDefinition.numericPropertyPath(
          modifier.propertyPath,
          context.records,
        )
      )
        return issue(
          "property",
          "Choose an available numeric Character property in this World.",
        );
      if (
        modifier.duration !== undefined &&
        !EffectDefinition.validDuration(modifier.duration)
      )
        return issue(
          "modifier-duration",
          "Choose a permanent or positive timed duration for each modifier.",
        );
      ids.add(modifier.id);
    }
    if (!EffectDefinition.validDuration(data.duration))
      return issue(
        "duration",
        "Choose a permanent or positive timed duration.",
      );
    if (!context.records)
      return [
        {
          code: "effect-references-unresolved",
          message:
            "Effect numeric properties have not been checked against a World capture.",
          unresolved: true,
        },
      ];
    return [];
  }

  private static validDuration(value: unknown): boolean {
    return (
      this.isObject(value) &&
      (value.kind === "permanent" ||
        (value.kind === "timed" &&
          this.finite(value.amount) &&
          value.amount > 0 &&
          ["rounds", "minutes", "hours", "days"].includes(String(value.unit))))
    );
  }

  private static numericPropertyPath(
    path: string,
    records: NonNullable<EffectDefinitionValidationContext["records"]>,
  ): boolean {
    if (
      /^health\.(current|maximum|temporary)$/.test(path) ||
      /^vision\.(day|night)$/.test(path) ||
      /^movement\.(walk|run|sprint|jump|swim|climb|crawl|fly|burrow)$/.test(
        path,
      )
    )
      return true;
    const match = /^(attributes|skills)\.(.+)\.(value|modifier)$/.exec(path);
    if (!match) return false;
    const [, group, key] = match;
    return records.some((record) => {
      if (!this.isObject(record.payload)) return false;
      const payload = record.payload;
      const values =
        record.resourceType === WORLD_CODEX_RESOURCES.characters
          ? payload[group!]
          : record.resourceType === "definitions" &&
              payload.kind === "creature" &&
              this.isObject(payload.components)
            ? payload.components[group!]
            : undefined;
      if (
        this.isObject(values) &&
        Object.hasOwn(values, key!) &&
        this.finite(values[key!])
      )
        return true;
      if (
        group === "skills" &&
        record.resourceType === "definitions" &&
        payload.kind === "skill" &&
        this.isObject(payload.identity)
      )
        return key === record.sourceId || key === payload.identity.key;
      return false;
    });
  }
}
