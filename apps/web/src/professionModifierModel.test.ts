import { describe, expect, it } from "vitest";
import { characterOptionDefinition } from "./characterOptionModel";
import { levelModifierGrants, professionModifierLevels, professionModifiersValid, withLevelModifierGrants } from "./professionModifierModel";

const grant = { id: "strength", label: "Forge strength", kind: "rolled-flat", stacking: "add", target: { kind: "attribute", attribute: "aow:attribute-might" }, dice: [{ count: 1, sides: 10 }] };
describe("profession modifier authoring", () => {
  it("adds, edits, and removes grants without losing other benefits or later tiers", () => {
    const original = professionModifierLevels({ expertiseLevels: [
      { tier: "aow:apprentice", rank: 0, benefits: { traitIds: ["existing-trait"] } },
      { tier: "aow:master", rank: 1, advancementPointCost: { kind: "constant", value: 10 }, benefits: { modifierGrants: [{ ...grant, id: "master-strength" }] } },
    ] });
    const added = withLevelModifierGrants(original, 0, [grant]);
    expect(professionModifiersValid(added)).toBe(true);
    const edited = withLevelModifierGrants(added, 0, [{ ...grant, dice: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }] }]);
    const result = characterOptionDefinition({ kind: "profession", id: "smith", key: "custom:smith", worldId: "world", name: "Blacksmith", description: "Smith", startingProfessionRank: "aow:journeyman", existingComponents: { expertiseLevels: edited, expertiseOrder: ["aow:apprentice", "aow:master"] } });
    expect(result.components.expertiseLevels).toMatchObject([{ tier: "aow:journeyman", benefits: { traitIds: ["existing-trait"], modifierGrants: [{ dice: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }] }] } }, original[1]]);
    const removed = withLevelModifierGrants(edited, 0, []);
    expect(levelModifierGrants(removed[0])).toEqual([]);
    expect(removed[1]).toEqual(original[1]);
    expect(removed[0].benefits).toMatchObject({ traitIds: ["existing-trait"] });
  });
  it("blocks empty names and invalid dice while allowing multiple contributions to one target", () => {
    const levels = professionModifierLevels({});
    expect(professionModifiersValid(withLevelModifierGrants(levels, 0, [{ ...grant, label: "" }]))).toBe(false);
    expect(professionModifiersValid(withLevelModifierGrants(levels, 0, [{ ...grant, dice: [{ count: 0, sides: 10 }] }]))).toBe(false);
    expect(professionModifiersValid(withLevelModifierGrants(levels, 0, [grant, { ...grant, id: "other" }]))).toBe(true);
  });
});
