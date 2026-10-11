import { backgroundModifierGrantIssue, isGrantedModifier } from "@aow/common";
import { canonicalWorldRecordIssue } from "./world-authored-record";
const benefit = {
  id: "streetwise",
  label: "Streetwise",
  kind: "rolled-flat",
  stacking: "add",
  target: { kind: "attribute", attribute: "aow:attribute-intellect" },
  dice: [{ count: 1, sides: 4 }],
};
describe("Background backstory modifiers", () => {
  it("accepts shared grant recipes with Background provenance", () => {
    expect(
      backgroundModifierGrantIssue({ modifierGrants: [benefit] }),
    ).toBeUndefined();
    expect(
      isGrantedModifier({
        id: "grant",
        active: true,
        grantedByEventId: "creation",
        source: { kind: "background", definitionId: "orphan" },
        definition: benefit,
        resolution: { kind: "flat", rolls: [[3]], value: 3 },
      }),
    ).toBe(true);
  });
  it("rejects malformed and duplicate grants at the World write boundary", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        kind: "background",
        components: { modifierGrants: [{ ...benefit, dice: [] }] },
      }),
    ).toContain("Background modifier");
    expect(
      backgroundModifierGrantIssue({ modifierGrants: [benefit, benefit] }),
    ).toContain("unique");
    expect(backgroundModifierGrantIssue({})).toBeUndefined();
  });
});
