import type {
  Attribute,
  Definition,
  DefinitionId,
  ExtensionData,
  NamespacedKey,
} from "./primitives";

export interface SkillComponents {
  /** Used when a test does not select a different governing attribute. */
  readonly defaultAttribute?: Attribute;
}

export type SkillDefinition<Extensions extends ExtensionData = ExtensionData> =
  Definition<"skill", SkillComponents, Extensions>;

const STANDARD_SKILL_SPECS = [
  ["acrobatics", "Acrobatics", "agility"],
  ["animal-handling", "Animal Handling", "charisma"],
  ["athletics", "Athletics", "might"],
  ["deception", "Deception", "charisma"],
  ["history", "History", "intellect"],
  ["insight", "Insight", "will"],
  ["intimidation", "Intimidation", "charisma"],
  ["investigation", "Investigation", "intellect"],
  ["medicine", "Medicine", "intellect"],
  ["nature", "Nature", "intellect"],
  ["perception", "Perception", "will"],
  ["performance", "Performance", "charisma"],
  ["persuasion", "Persuasion", "charisma"],
  ["religion", "Religion", "intellect"],
  ["sleight-of-hand", "Sleight of Hand", "agility"],
  ["stealth", "Stealth", "agility"],
  ["survival", "Survival", "hardiness"],
  ["demolition", "Demolition", "intellect"],
  ["engineering", "Engineering", "intellect"],
  ["navigation", "Navigation", "intellect"],
  ["pilot", "Pilot", "agility"],
  ["science", "Science", "intellect"],
  ["streetwise", "Streetwise", "charisma"],
  ["subterfuge", "Subterfuge", "agility"],
  ["tactics", "Tactics", "intellect"],
  ["technology", "Technology", "intellect"],
  ["marksmanship", "Marksmanship", "agility"],
] as const satisfies ReadonlyArray<
  readonly [key: string, name: string, defaultAttribute: Attribute]
>;

/** Stable built-in definitions that can be seeded into a rules catalog. */
export const STANDARD_SKILL_DEFINITIONS: readonly SkillDefinition[] =
  STANDARD_SKILL_SPECS.map(([key, name, defaultAttribute]) => ({
    identity: {
      id: `aow:skill-${key}` as DefinitionId,
      key: `aow:skill-${key}` as NamespacedKey,
      name,
      source: {
        namespace: "aow",
        edition: "homebrew:age-of-wonders",
        license: "private",
      },
      tags: ["skill"],
    },
    kind: "skill",
    components: { defaultAttribute },
  }));
