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
import { EffectDefinition } from "./effect-definition";

export type ConditionDefinitionState = CodexDefinitionState;
export type ConditionDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type ConditionDefinitionCommands = CodexDefinitionCommands;
export type ConditionDefinitionEvents = CodexDefinitionEvents;

/** Authored grants and explicit Effect overrides, without runtime condition mechanics. */
export class ConditionDefinition extends CodexDefinition {
  private constructor(
    data: ConditionDefinitionState,
    context: ConditionDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("condition-definition", data, context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: ConditionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ConditionDefinition {
    return new ConditionDefinition(
      this.decode(value, "condition-definition"),
      context,
      options,
    );
  }

  /** Hydrate a persisted resource; never interpret author input as an entity envelope. */
  static deserializePayload(
    value: unknown,
    context: ConditionDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ConditionDefinition {
    return new ConditionDefinition(this.decodePayload(value), context, options);
  }

  protected validateState(
    data: DeepReadonly<ConditionDefinitionState>,
    context: ConditionDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const identity = this.identityIssues(data, context, "condition");
    if (identity.length) return identity;
    const issue = (code: string, message: string): ValidationIssue[] => [
      { code: `condition-codex-${code}`, message },
    ];
    if (!ConditionDefinition.array(data.effects))
      return issue("effects", "Choose the Effects granted by this Condition.");
    const ids = new Set<string>();
    for (const link of data.effects) {
      if (
        !ConditionDefinition.isObject(link) ||
        !ConditionDefinition.text(link.effectId) ||
        ids.has(link.effectId)
      )
        return issue("duplicate", "Choose each Effect only once.");
      ids.add(link.effectId);
      if (!context.records) continue;
      const payload = context.records.find(
        (record) =>
          record.resourceType === WORLD_CODEX_RESOURCES.effects &&
          record.sourceId === link.effectId,
      )?.payload;
      let effect: EffectDefinition;
      try {
        // Only structural override capabilities belong to this relationship check.
        // World publication validates the Effect's full state separately.
        effect = EffectDefinition.deserializePayload(payload, {
          sourceId: link.effectId,
          mode: context.mode,
        });
      } catch {
        return issue(
          "effect-unavailable",
          "An Effect is unavailable in this World.",
        );
      }
      try {
        if (!effect.hasModifierDefinitions())
          return issue(
            "effect-unavailable",
            "An Effect is unavailable in this World.",
          );
        if (link.modifierOverrides !== undefined) {
          if (!ConditionDefinition.numbers(link.modifierOverrides))
            return issue("overrides", "Effect overrides must be numeric.");
          for (const key of Object.keys(link.modifierOverrides as object)) {
            if (!effect.permitsOverride(key))
              return issue(
                "override-forbidden",
                "This Effect modifier does not allow a Condition override.",
              );
          }
        }
      } finally {
        effect.dispose();
      }
    }
    if (!context.records)
      return [
        {
          code: "condition-references-unresolved",
          message:
            "Condition Effects have not been checked against a World capture.",
          unresolved: true,
        },
      ];
    return [];
  }
}
