import type { MechanicsObject } from "./itemMechanicsModel";
export const actorRuleTypes = [
  "skill",
  "speed",
  "damage-adjustment",
  "sense",
  "communication",
  "discipline-source",
  "discipline-state",
  "attribute-generation",
] as const;
export type ActorRuleType = (typeof actorRuleTypes)[number];
export function newActorRule(type: ActorRuleType): MechanicsObject {
  switch (type) {
    case "skill":
      return { skillDefinitionId: "", bonus: 0 };
    case "speed":
      return { mode: "walk", distance: { value: 30, unit: "foot" } };
    case "damage-adjustment":
      return { damageType: "", response: "resistance" };
    case "sense":
      return { sense: "sight" };
    case "communication":
      return {
        medium: "acoustic",
        directionality: "bidirectional",
        operatingBasis: "unknown",
        understanding: "unknown",
      };
    case "discipline-source":
      return {
        id: crypto.randomUUID(),
        sourceDefinitionId: "",
        attribute: "",
        accessMode: "trained",
        targetingBonus: { kind: "constant", value: 0 },
        resistanceDifficulty: { kind: "constant", value: 0 },
      };
    case "discipline-state":
      return { sources: [] };
    case "attribute-generation":
      return { kind: "standard-array", values: [] };
  }
}
export function actorRuleChildren(type: string) {
  switch (type) {
    case "speed":
      return [
        {
          key: "restrictions",
          label: "Restrictions",
          type: "predicate",
          list: true,
        },
      ];
    case "damage-adjustment":
      return [
        { key: "predicate", label: "Predicate", type: "predicate" },
        {
          key: "bypassPredicate",
          label: "Bypass predicate",
          type: "predicate",
        },
      ];
    case "discipline-state":
      return [
        {
          key: "sources",
          label: "Sources",
          type: "discipline-source",
          list: true,
        },
      ];
    default:
      return [];
  }
}

export function newActorCatalogDefinition(
  kind: "monster" | "character-template",
  id: string,
  attributes: readonly { key: string }[],
): MechanicsObject {
  const scores = Object.fromEntries(attributes.map((a) => [a.key, 50]));
  return {
    kind,
    identity: {
      id,
      key: `homebrew:${id}`,
      name: "",
      source: { namespace: "homebrew", edition: "1" },
    },
    components:
      kind === "monster"
        ? {
            size: "medium",
            classification: { nature: "organism", aliases: [] },
            defenseRating: { terms: [{ kind: "dice", count: 1, size: 20 }] },
            hitPoints: {
              average: 1,
              formula: { terms: [{ kind: "dice", count: 1, size: 6 }] },
            },
            speeds: [],
            attributes: scores,
            challengeRating: 0,
            actions: [],
          }
        : { attributeDefaults: scores },
  };
}
