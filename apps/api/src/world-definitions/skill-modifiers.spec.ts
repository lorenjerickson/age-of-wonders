import { isGrantedModifier, isModifierGrantDefinition, skillModifierGrantIssue } from "@aow/common";
import { canonicalWorldRecordIssue } from "./world-authored-record";
const speed = { id: "climbing", label: "Sure climbing", kind: "rolled-flat", stacking: "add", target: { kind: "speed", movementMode: "climb", unit: "foot" }, dice: [{ count: 1, sides: 4 }] };
describe("Skill modifiers", () => {
  it("accepts shared grants and explicit skill provenance", () => {
    expect(skillModifierGrantIssue({ associatedProfessionIds: ["sailor"], modifierGrants: [speed] })).toBeUndefined();
    expect(isGrantedModifier({ id: "grant", active: true, grantedByEventId: "acquisition", source: { kind: "skill", definitionId: "rigging" }, definition: speed, resolution: { kind: "flat", rolls: [[3]], value: 3 } })).toBe(true);
  });
  it("requires speed units and rejects dice added per check to a speed value", () => {
    expect(isModifierGrantDefinition({ ...speed, target: { kind: "speed", movementMode: "climb" } })).toBe(false);
    expect(isModifierGrantDefinition({ ...speed, kind: "roll-dice" })).toBe(false);
  });
  it("validates Skill drafts while preserving older definitions", () => {
    expect(canonicalWorldRecordIssue("definitions", "skill", { kind: "skill", components: {} })).toBeUndefined();
    expect(canonicalWorldRecordIssue("definitions", "skill", { kind: "skill", components: { modifierGrants: [{ ...speed, dice: [] }] } })).toContain("Skill modifier");
    expect(skillModifierGrantIssue({ associatedProfessionIds: ["sailor", "sailor"] })).toBeDefined();
    expect(skillModifierGrantIssue({ modifierGrants: [speed, speed] })).toContain("unique");
  });
});
