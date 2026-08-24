import type { Predicate } from "./expressions";
import type {
  Definition,
  DefinitionId,
  ExtensionData,
  JsonValue,
  LocationId,
  NamespacedKey,
  NonEmptyReadonlyArray,
} from "./primitives";
import type { ChoiceDefinition, RuleModifier } from "./rules";

/**
 * One persistent consequence supplied by a heritage selection. Rule modifiers
 * cover attributes, statistics, movement, senses, defenses, languages,
 * proficiencies, and other path-addressable rules state. The other variants
 * cover grants and choices that cannot be expressed as scalar modification.
 */
export type HeritageModifier =
  | { readonly kind: "rule-modifier"; readonly modifier: RuleModifier }
  | { readonly kind: "grant-action"; readonly actionId: DefinitionId }
  | { readonly kind: "grant-trait"; readonly traitId: DefinitionId }
  | {
      readonly kind: "grant-skill-proficiency";
      readonly skillDefinitionId: DefinitionId;
      readonly rank: "half" | "proficient" | "expertise" | "custom";
    }
  | {
      readonly kind: "grant-discipline-access";
      readonly disciplineDefinitionId: DefinitionId;
    }
  | { readonly kind: "choice"; readonly choice: ChoiceDefinition }
  | {
      readonly kind: "custom";
      readonly key: NamespacedKey;
      readonly payload: JsonValue;
    };

/** Both sides of every pair are granted together as one deliberate compromise. */
export interface HeritageModifierPair<
  Beneficial extends HeritageModifier = HeritageModifier,
  Harmful extends HeritageModifier = HeritageModifier,
> {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly beneficial: NonEmptyReadonlyArray<Beneficial>;
  readonly harmful: NonEmptyReadonlyArray<Harmful>;
}

export interface HeritageComponents<
  Modifier extends HeritageModifier = HeritageModifier,
> {
  readonly shortDescription: string;
  readonly modifierPairs: NonEmptyReadonlyArray<
    HeritageModifierPair<Modifier, Modifier>
  >;
  readonly prerequisites?: readonly Predicate[];
}

/** The definition identity name is the heritage's player-facing title. */
export type HeritageDefinition<
  Modifier extends HeritageModifier = HeritageModifier,
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"heritage", HeritageComponents<Modifier>, Extensions>;

export interface HeritageSelection<
  HeritageId extends DefinitionId = DefinitionId,
> {
  readonly heritageId: HeritageId;
}

/** Encodes the global creation limit without accepting an unbounded array. */
export type HeritageSelections<
  Selection extends HeritageSelection = HeritageSelection,
> =
  | readonly []
  | readonly [Selection]
  | readonly [Selection, Selection]
  | readonly [Selection, Selection, Selection];

export const MAX_HERITAGE_SELECTIONS = 3;

/**
 * Creation-only state. Engines must reject any transition that changes this
 * value after character creation; the literal lock makes that rule explicit in
 * serialized snapshots as well as in the readonly TypeScript shape.
 */
export interface CharacterHeritageState<
  Selection extends HeritageSelection = HeritageSelection,
> {
  readonly originRegionId: LocationId;
  readonly selections: HeritageSelections<Selection>;
  readonly lockedAtCharacterCreation: true;
}
