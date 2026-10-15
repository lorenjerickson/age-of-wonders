import {
  BackgroundDefinition,
  HeritageDefinition,
  ProfessionDefinition,
} from "@aow/domain";
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
        ? BackgroundDefinition.authorComponents(existing)
        : input.kind === "profession"
          ? ProfessionDefinition.authorComponents(
              existing,
              input.startingProfessionRank,
            )
          : HeritageDefinition.authorComponents(
              existing,
              input.description,
              input.heritageBenefit,
              input.heritageDrawback,
            );
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

function isObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
