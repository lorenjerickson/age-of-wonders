import { describe, expect, it } from "vitest";
import { characterOptionDefinition } from "./characterOptionModel";
import type { JsonValue } from "./api";
const base = {
  kind: "heritage" as const,
  id: "river",
  key: "custom:river",
  worldId: "world",
  name: "Riverfolk",
  description: "River culture",
};
const pair = {
  id: "water",
  title: "Water",
  beneficial: [{ kind: "grant-action", actionId: "swim" }],
  harmful: [{ kind: "custom", key: "custom:cost", payload: { note: "cost" } }],
};

describe("Heritage authoring preservation", () => {
  it("preserves advanced pairs and extensions when editing description only", () => {
    const existing = {
      shortDescription: "Old",
      modifierPairs: [pair],
      prerequisites: [{ kind: "always" }],
      privateNotes: { secret: "GM" },
    };
    const result = characterOptionDefinition({
      ...base,
      existingComponents: existing,
    });
    expect(result.components).toEqual({
      ...existing,
      shortDescription: "River culture",
    });
    (result.components.modifierPairs as Record<string, JsonValue>[])[0].title =
      "Changed";
    expect(pair.title).toBe("Water");
  });
  it("does not discard other pairs or other modifiers when editing a foundation text", () => {
    const foundation: {
      id: string;
      title: string;
      beneficial: Record<string, JsonValue>[];
      harmful: Record<string, JsonValue>[];
    } = {
      id: "foundation",
      title: "Custom",
      beneficial: [
        {
          kind: "custom",
          key: "aow:heritage-benefit-description",
          payload: "Old",
        },
        { kind: "grant-trait", traitId: "trait" },
      ],
      harmful: [
        {
          kind: "custom",
          key: "aow:heritage-drawback-description",
          payload: "Cost",
        },
      ],
    };
    const result = characterOptionDefinition({
      ...base,
      heritageBenefit: "New",
      existingComponents: { modifierPairs: [foundation, pair] },
    });
    expect(result.components.modifierPairs).toEqual([
      {
        ...foundation,
        beneficial: [
          { ...foundation.beneficial[0], payload: "New" },
          foundation.beneficial[1],
        ],
      },
      pair,
    ]);
  });
});
