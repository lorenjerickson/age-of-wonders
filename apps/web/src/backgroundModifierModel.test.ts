import { describe, expect, it } from "vitest";
import { BackgroundDefinition } from "@aow/domain";
import { backgroundModifiersValid } from "./backgroundModifierModel";
import { characterOptionDefinition } from "./characterOptionModel";
const grant = {
  id: "gift",
  label: "Practice",
  kind: "rolled-flat",
  stacking: "add",
  target: { kind: "attribute", attribute: "aow:might" },
  dice: [{ count: 1, sides: 6 }],
};

describe("Background authoring delegation", () => {
  it("checks Background grants including duplicate identity and bad dice", () => {
    expect(backgroundModifiersValid([])).toBe(true);
    expect(backgroundModifiersValid([grant])).toBe(true);
    expect(backgroundModifiersValid([grant, grant])).toBe(false);
    expect(
      backgroundModifiersValid([{ ...grant, dice: [{ count: 0, sides: 6 }] }]),
    ).toBe(false);
  });
  it("preserves and detaches richer components when editing or clearing grants", () => {
    const original = {
      skillProficiencyIds: ["skill"],
      characteristics: { private: ["secret"] },
      modifierGrants: [grant],
    };
    const components = BackgroundDefinition.withModifierGrants(original, []);
    const result = characterOptionDefinition({
      kind: "background",
      id: "origin",
      key: "custom:origin",
      worldId: "world",
      name: "Origin",
      description: "History",
      existingComponents: components,
    });
    expect(result.components).toEqual({ ...original, modifierGrants: [] });
    (result.components.skillProficiencyIds as string[]).push("another");
    expect(original.skillProficiencyIds).toEqual(["skill"]);
    expect(components.skillProficiencyIds).toEqual(["skill"]);
    expect(original.modifierGrants).toEqual([grant]);
  });
});
