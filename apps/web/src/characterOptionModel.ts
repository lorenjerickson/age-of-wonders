import type { JsonValue } from "./api";

export type CharacterOptionKind =
  "skill" | "background" | "profession" | "heritage";

export const CHARACTER_OPTION_KINDS: readonly CharacterOptionKind[] = [
  "skill",
  "background",
  "profession",
  "heritage",
];

export function characterOptionKey(kind: CharacterOptionKind, name: string) {
  const slug =
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "option";
  return `custom:${kind}-${slug}`;
}

export function characterOptionDefinition(input: {
  kind: CharacterOptionKind;
  id: string;
  key: string;
  worldId: string;
  name: string;
  description: string;
  heritageBenefit?: string;
  heritageDrawback?: string;
  defaultAttribute?: string;
  startingProfessionRank?: string;
  existingComponents?: Record<string, JsonValue>;
}) {
  const existing = input.existingComponents ?? {};
  const components: Record<string, JsonValue> =
    input.kind === "skill"
      ? skillComponents(existing, input.defaultAttribute)
      : input.kind === "background"
        ? existing
        : input.kind === "profession"
          ? professionComponents(existing, input.startingProfessionRank)
          : {
              ...existing,
              shortDescription: input.description,
              modifierPairs: [
                {
                  id: "foundation",
                  title: "Heritage balance",
                  beneficial: [
                    {
                      kind: "custom",
                      key: "aow:heritage-benefit-description",
                      payload: input.heritageBenefit ?? "",
                    },
                  ],
                  harmful: [
                    {
                      kind: "custom",
                      key: "aow:heritage-drawback-description",
                      payload: input.heritageDrawback ?? "",
                    },
                  ],
                },
              ],
            };
  return {
    identity: {
      id: input.id,
      key: input.key,
      name: input.name,
      description: input.description,
      source: {
        namespace: "aow",
        edition: "homebrew:age-of-wonders",
        license: "private",
      },
    },
    kind: input.kind,
    components,
    extensions: { "aow:worldId": input.worldId },
  };
}

function skillComponents(
  existing: Record<string, JsonValue>,
  defaultAttribute: string | undefined,
): Record<string, JsonValue> {
  const components = { ...existing };
  if (defaultAttribute) components.defaultAttribute = defaultAttribute;
  else delete components.defaultAttribute;
  return components;
}

function professionComponents(
  existing: Record<string, JsonValue>,
  startingProfessionRank: string | undefined,
): Record<string, JsonValue> {
  const rank = startingProfessionRank ?? "aow:profession-rank-novice";
  const expertiseOrder = Array.isArray(existing.expertiseOrder)
    ? [...existing.expertiseOrder]
    : [];
  expertiseOrder[0] = rank;

  const expertiseLevels = Array.isArray(existing.expertiseLevels)
    ? existing.expertiseLevels.map((level, index) =>
        index === 0 && isObject(level) ? { ...level, tier: rank } : level,
      )
    : [];
  if (expertiseLevels.length === 0)
    expertiseLevels.push({ tier: rank, rank: 0, benefits: {} });

  const acquisition = Array.isArray(existing.acquisition)
    ? existing.acquisition.map((rule) =>
        isObject(rule) && rule.kind === "character-creation"
          ? { ...rule, startingExpertise: rank }
          : rule,
      )
    : [];
  if (
    !acquisition.some(
      (rule) => isObject(rule) && rule.kind === "character-creation",
    )
  )
    acquisition.unshift({
      kind: "character-creation",
      startingExpertise: rank,
    });

  return {
    ...existing,
    expertiseOrder,
    expertiseLevels,
    acquisition,
    actions: Array.isArray(existing.actions) ? existing.actions : [],
  };
}

function isObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
