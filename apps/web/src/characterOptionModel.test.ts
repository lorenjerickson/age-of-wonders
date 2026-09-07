import { describe, expect, it } from "vitest";
import { characterOptionDefinition } from "./characterOptionModel";

describe("characterOptionDefinition", () => {
  it.each(["skill", "background", "profession", "heritage"] as const)(
    "builds a world-scoped %s definition",
    (kind) => {
      const definition = characterOptionDefinition({
        kind,
        id: `definition:${kind}`,
        key: `aow:${kind}`,
        worldId: "world-1",
        name: "Example",
        description: "A player-facing option.",
        heritageBenefit: "A useful edge.",
        heritageDrawback: "A meaningful cost.",
        defaultAttribute: "aow:attribute-wisdom",
        startingProfessionRank: "aow:profession-rank-novice",
      });

      expect(definition).toMatchObject({
        kind,
        identity: { name: "Example" },
        extensions: { "aow:worldId": "world-1" },
      });
      if (kind === "profession") {
        expect(definition.components).toMatchObject({
          expertiseOrder: ["aow:profession-rank-novice"],
        });
      }
      if (kind === "skill") {
        expect(definition.components).toMatchObject({
          defaultAttribute: "aow:attribute-wisdom",
        });
      }
      if (kind === "heritage") {
        expect(definition.components).toMatchObject({
          modifierPairs: [
            {
              beneficial: [{ payload: "A useful edge." }],
              harmful: [{ payload: "A meaningful cost." }],
            },
          ],
        });
      }
    },
  );

  it("preserves advanced Profession components when its starting rank changes", () => {
    const definition = characterOptionDefinition({
      kind: "profession",
      id: "profession-1",
      key: "custom:profession-sky-sailor",
      worldId: "world-1",
      name: "Sky Sailor",
      description: "Works above the clouds.",
      startingProfessionRank: "custom:profession-rank-initiate",
      existingComponents: {
        expertiseOrder: [
          "aow:profession-rank-novice",
          "aow:profession-rank-master",
        ],
        expertiseLevels: [
          {
            tier: "aow:profession-rank-novice",
            rank: 0,
            benefits: {},
          },
          {
            tier: "aow:profession-rank-master",
            rank: 1,
            benefits: {},
          },
        ],
        acquisition: [
          {
            kind: "character-creation",
            startingExpertise: "aow:profession-rank-novice",
          },
        ],
        actions: [{ actionId: "action-1" }],
        prerequisites: [{ kind: "always" }],
      },
    });

    expect(definition.components).toMatchObject({
      expertiseOrder: [
        "custom:profession-rank-initiate",
        "aow:profession-rank-master",
      ],
      expertiseLevels: [
        { tier: "custom:profession-rank-initiate", rank: 0 },
        { tier: "aow:profession-rank-master", rank: 1 },
      ],
      acquisition: [
        {
          kind: "character-creation",
          startingExpertise: "custom:profession-rank-initiate",
        },
      ],
      actions: [{ actionId: "action-1" }],
      prerequisites: [{ kind: "always" }],
    });
  });

  it("can clear a Skill's optional default Attribute without dropping extensions", () => {
    const definition = characterOptionDefinition({
      kind: "skill",
      id: "skill-1",
      key: "custom:skill-courtly-grace",
      worldId: "world-1",
      name: "Courtly Grace",
      description: "Navigating a formal court.",
      existingComponents: {
        defaultAttribute: "aow:attribute-charisma",
        "custom:training": "formal",
      },
    });

    expect(definition.components).toEqual({ "custom:training": "formal" });
  });
});
