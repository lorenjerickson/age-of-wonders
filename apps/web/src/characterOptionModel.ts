export type CharacterOptionKind = "background" | "profession" | "heritage";

export const CHARACTER_OPTION_KINDS: readonly CharacterOptionKind[] = [
  "background",
  "profession",
  "heritage",
];

export function characterOptionDefinition(input: {
  kind: CharacterOptionKind;
  id: string;
  key: string;
  worldId: string;
  name: string;
  description: string;
  heritageBenefit?: string;
  heritageDrawback?: string;
}) {
  const components =
    input.kind === "background"
      ? {}
      : input.kind === "profession"
        ? {
            expertiseOrder: ["unskilled"],
            expertiseLevels: [{ tier: "unskilled", rank: 0, benefits: {} }],
            acquisition: [
              {
                kind: "character-creation",
                startingExpertise: "unskilled",
              },
            ],
            actions: [],
          }
        : {
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
