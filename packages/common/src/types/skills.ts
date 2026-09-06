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
  ["acrobatics", "Acrobatics", "aow:attribute-agility"],
  ["animal-handling", "Animal Handling", "aow:attribute-charisma"],
  ["athletics", "Athletics", "aow:attribute-might"],
  ["deception", "Deception", "aow:attribute-charisma"],
  ["history", "History", "aow:attribute-intellect"],
  ["insight", "Insight", "aow:attribute-wisdom"],
  ["intimidation", "Intimidation", "aow:attribute-charisma"],
  ["investigation", "Investigation", "aow:attribute-intellect"],
  ["medicine", "Medicine", "aow:attribute-intellect"],
  ["nature", "Nature", "aow:attribute-intellect"],
  ["perception", "Perception", "aow:attribute-wisdom"],
  ["performance", "Performance", "aow:attribute-charisma"],
  ["persuasion", "Persuasion", "aow:attribute-charisma"],
  ["religion", "Religion", "aow:attribute-intellect"],
  ["sleight-of-hand", "Sleight of Hand", "aow:attribute-agility"],
  ["stealth", "Stealth", "aow:attribute-agility"],
  ["survival", "Survival", "aow:attribute-hardiness"],
  ["demolition", "Demolition", "aow:attribute-intellect"],
  ["engineering", "Engineering", "aow:attribute-intellect"],
  ["navigation", "Navigation", "aow:attribute-intellect"],
  ["pilot", "Pilot", "aow:attribute-agility"],
  ["science", "Science", "aow:attribute-intellect"],
  ["streetwise", "Streetwise", "aow:attribute-charisma"],
  ["subterfuge", "Subterfuge", "aow:attribute-agility"],
  ["tactics", "Tactics", "aow:attribute-intellect"],
  ["technology", "Technology", "aow:attribute-intellect"],
  ["marksmanship", "Marksmanship", "aow:attribute-agility"],
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
