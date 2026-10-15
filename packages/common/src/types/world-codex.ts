import type { CreatureImages } from "./creatures";

/** World authoring resources; never campaign-instance playable Characters or active effects. */
export const WORLD_CODEX_RESOURCES = {
  characters: "world-character-templates",
  conditions: "world-conditions",
  effects: "world-effects",
} as const;
export type WorldCodexCollection = keyof typeof WORLD_CODEX_RESOURCES;
export interface WorldCodexIdentity {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly revision: number;
}
export type WorldEffectDuration =
  | { readonly kind: "permanent" }
  | {
      readonly kind: "timed";
      readonly amount: number;
      readonly unit: "rounds" | "minutes" | "hours" | "days";
    };
export interface WorldEffectModifier {
  readonly id: string;
  readonly propertyPath: string;
  readonly operation: "add" | "set" | "multiply";
  readonly value: number;
  readonly unit?: string;
  readonly allowConditionOverride: boolean;
  /** Overrides the Effect default for this modifier only. */
  readonly duration?: WorldEffectDuration;
}
export interface WorldEffectDefinition extends WorldCodexIdentity {
  readonly modifiers: readonly WorldEffectModifier[];
  /** Compatibility default for modifiers that omit duration. */
  readonly duration: WorldEffectDuration;
}
export interface WorldConditionEffect {
  readonly effectId: string;
  /** Keys identify modifiers on the selected Effect. Only explicitly overridable values may change. */
  readonly modifierOverrides?: Readonly<Record<string, number>>;
}
export interface WorldConditionDefinition extends WorldCodexIdentity {
  readonly effects: readonly WorldConditionEffect[];
}
export interface WorldGrantedCondition {
  readonly conditionId: string;
}
export interface WorldCharacterTemplate extends WorldCodexIdentity {
  /** Immutable after creation; references a creature Definition in the same World draft. */
  readonly creatureDefinitionId: string;
  readonly attributes: Readonly<Record<string, number>>;
  readonly skills: Readonly<Record<string, number>>;
  readonly health: {
    readonly current: number;
    readonly maximum: number;
    readonly temporary: number;
  };
  readonly movement: Readonly<
    Partial<
      Record<
        | "walk"
        | "run"
        | "sprint"
        | "jump"
        | "swim"
        | "climb"
        | "crawl"
        | "fly"
        | "burrow",
        number
      >
    >
  >;
  readonly vision: { readonly day: number; readonly night: number };
  readonly equipment: readonly {
    /** "carried" may repeat; named equipment slots are unique. */
    readonly slot: string;
    readonly itemDefinitionId: string;
  }[];
  readonly grantedConditions: readonly WorldGrantedCondition[];
  readonly images?: Partial<CreatureImages>;
}
export type WorldCodexEntry =
  WorldCharacterTemplate | WorldConditionDefinition | WorldEffectDefinition;
export interface WorldCodexLibrary {
  readonly worldDefinitionId: string;
  readonly draftId: string;
  readonly storageRevision: number;
  readonly items: readonly WorldCodexEntry[];
}

/** Explicit collaboration membership; owner alone maintains the roster. */
export interface WorldAccessEntry {
  readonly id: string;
  readonly playerId: string;
  readonly displayName: string;
  readonly role: "viewer" | "editor";
  readonly revision: number;
}
