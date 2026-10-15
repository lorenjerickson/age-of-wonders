import { describe, expect, it } from "vitest";
import {
  replaceRuleNode,
  resolveRuleNode,
  type RuleNodeType,
} from "./ruleNodeModel";
import { syncProfessionTierOrder } from "./professionAuthoringModel";
import { contextualNavigationStack } from "./contextualNavigationModel";
import type { MechanicsObject } from "./itemMechanicsModel";
const profession: MechanicsObject = {
  expertiseOrder: ["adopted:first"],
  expertiseLevels: [
    {
      tier: "adopted:first",
      rank: 0,
      benefits: { private: true },
      prerequisites: [],
    },
  ],
  acquisition: [
    {
      kind: "during-play",
      startingExpertise: "adopted:first",
      prerequisites: [{ kind: "all", predicates: [] }],
    },
  ],
  actions: [
    {
      actionId: "action",
      unlocksAt: "adopted:first",
      improvements: [{ atExpertise: "adopted:first", modifiers: [] }],
    },
  ],
  private: { secret: "keep" },
};
describe("Character authoring ownership paths", () => {
  it.each([
    ["expertiseLevels/0/benefits/modifierGrants/new", "modifier-grant"],
    ["expertiseLevels/0/benefits/modifiers/new", "modifier"],
    ["expertiseLevels/0/advancementWindow", "profession-window"],
    ["acquisition/0/prerequisites/0/predicates/new", "predicate"],
    ["acquisition/0/trainingDuration", "duration"],
    ["actions/0/improvements/0/modifiers/new", "modifier"],
    ["actions/0/qualifyingUse", "predicate"],
  ])(
    "resolves and updates %s without dropping private/sibling data",
    (path, type) => {
      const segments = path.split("/");
      expect(resolveRuleNode(profession, "profession", segments).type).toBe(
        type,
      );
      const next = replaceRuleNode(profession, "profession", segments, {
        kind: "test",
        private: "new",
      });
      expect(
        resolveRuleNode(
          next,
          "profession",
          segments.at(-1) === "new"
            ? [...segments.slice(0, -1), "0"]
            : segments,
        ).value,
      ).toEqual({ kind: "test", private: "new" });
      expect(next.private).toEqual(profession.private);
      expect(
        syncProfessionTierOrder(profession, next, segments).expertiseOrder,
      ).toEqual(profession.expertiseOrder);
      expect(profession.expertiseLevels).toHaveLength(1);
    },
  );
  it("keeps acquisition variant paths distinct", () => {
    expect(() =>
      resolveRuleNode(profession, "profession", [
        "acquisition",
        "0",
        "choices",
      ]),
    ).toThrow();
    const root = { acquisition: [{ kind: "character-creation" }] };
    expect(
      resolveRuleNode(root, "profession", ["acquisition", "0", "choices"]).type,
    ).toBe("choice");
    expect(() =>
      resolveRuleNode(root, "profession", [
        "acquisition",
        "0",
        "prerequisites",
      ]),
    ).toThrow();
  });
  it.each(["profession", "background"] as RuleNodeType[])(
    "guards malformed collections for %s",
    (kind) => {
      const key = kind === "profession" ? "expertiseLevels" : "modifierGrants";
      expect(() =>
        replaceRuleNode(
          { [key]: "private imported data" },
          kind,
          [key, "new"],
          {},
        ),
      ).toThrow();
    },
  );
  it("adds optional Background children only on explicit save", () => {
    const original = { private: true };
    const next = replaceRuleNode(original, "background", ["choices", "new"], {
      id: "choice",
      prompt: "Pick",
    });
    expect(next).toEqual({
      private: true,
      choices: [{ id: "choice", prompt: "Pick" }],
    });
    expect(original).toEqual({ private: true });
    expect(replaceRuleNode(next, "background", ["choices"], undefined)).toEqual(
      original,
    );
  });
  it("builds named owner ancestry for direct nested entry without exposing IDs", () => {
    const id = "0550a6c9-5f99-4382-931c-cc5fa6bbb2a6";
    const stack = contextualNavigationStack(
      `/worlds/world/characters/professions/${id}/rule/expertiseLevels/0/benefits`,
      {
        records: [
          {
            sourceId: id,
            resourceType: "definitions",
            payload: {
              kind: "profession",
              identity: { name: "Engineer" },
              components: profession,
            },
          },
        ],
      },
    );
    expect(stack.map((s) => s.label)).toContain("Engineer");
    expect(stack.at(-1)?.label).toBe("Benefits");
    expect(stack.map((s) => s.label).join(" ")).not.toContain(id);
  });
});
