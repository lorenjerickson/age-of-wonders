import {
  isGrantedModifier,
  isModifierGrantDefinition,
  professionModifierGrantIssue,
  type GrantedModifier,
  type ModifierGrantDefinition,
} from "@aow/common";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";

const might: ModifierGrantDefinition = {
  id: "forge-strength", label: "Forge strength", kind: "rolled-flat",
  target: { kind: "attribute", attribute: "aow:attribute-might" },
  stacking: "add", dice: [{ count: 1, sides: 10 }],
};
const damage: ModifierGrantDefinition = {
  id: "heavy-blow", label: "Heavy blow", kind: "roll-dice",
  target: { kind: "roll", roll: "damage" },
  stacking: "add", dice: [{ count: 1, sides: 4 }],
};
const granted: GrantedModifier = {
  id: "grant-one" as never, grantedByEventId: "acquisition-event" as never,
  source: { kind: "profession", definitionId: "blacksmith" as never, expertise: "aow:profession-rank-apprentice" },
  active: true, definition: might,
  resolution: { kind: "flat", rolls: [[4]], value: 4 },
};
const benefits = (modifierGrants: unknown) => ({ expertiseLevels: [{ benefits: { modifierGrants } }] });

describe("Profession modifier grant schema", () => {
  it("represents Blacksmith's one-time 1d10 Might roll and retains its +4 result", () => {
    expect(isModifierGrantDefinition(might)).toBe(true);
    expect(isGrantedModifier(JSON.parse(JSON.stringify(granted)))).toBe(true);
    expect(isGrantedModifier({ ...granted, resolution: { kind: "flat", rolls: [[4]], value: 5 } })).toBe(false);
    expect(isGrantedModifier({ ...granted, resolution: { kind: "flat", rolls: [[11]], value: 11 } })).toBe(false);
    expect(isGrantedModifier({ ...granted, resolution: { kind: "per-check" } })).toBe(false);
  });
  it("represents repeatable damage and skill proficiency dice without a fixed total", () => {
    const proficiency: ModifierGrantDefinition = {
      ...damage, kind: "skill-proficiency",
      target: { kind: "skill-check", skillDefinitionId: "smithing" as never },
      dice: [{ count: 2, sides: 6 }],
    };
    for (const definition of [damage, proficiency]) {
      expect(isGrantedModifier({ ...granted, definition, resolution: { kind: "per-check" } })).toBe(true);
      expect(isGrantedModifier({ ...granted, definition })).toBe(false);
    }
  });
  it("supports all requested flat targets and multiple additive contributions", () => {
    const targets = [might.target, { kind: "health-maximum" }, { kind: "statistic", key: "aow:initiative" },
      { kind: "skill-check", skillDefinitionId: "smithing" }, ...["hit", "defense", "damage"].map(roll => ({ kind: "roll", roll }))];
    for (const target of targets) expect(isModifierGrantDefinition({ ...might, target })).toBe(true);
    expect(professionModifierGrantIssue(benefits([might, { ...might, id: "another-strength-grant" }, damage]))).toBeUndefined();
    expect(isGrantedModifier({ ...granted, source: { kind: "equipment", definitionId: "gloves", itemInstanceId: "pair-one" } })).toBe(true);
  });
  it.each([
    { ...might, dice: [] }, { ...might, dice: [{ count: 0, sides: 10 }] },
    { ...might, dice: [{ count: 1, sides: 1.5 }] }, { ...might, stacking: "highest" },
    { ...damage, target: { kind: "health-maximum" } },
    { ...damage, kind: "skill-proficiency" },
  ])("rejects invalid recipes and target combinations: %j", (recipe) => {
    expect(isModifierGrantDefinition(recipe)).toBe(false);
    expect(canonicalWorldRecordIssue("definitions", "blacksmith", { kind: "profession", components: benefits([recipe]) })).toBeDefined();
  });
  it("rejects repeated authored grant IDs across tiers, not repeated target attributes", () => {
    expect(professionModifierGrantIssue({ expertiseLevels: [
      { benefits: { modifierGrants: [might] } }, { benefits: { modifierGrants: [might] } },
    ] })).toContain("unique");
    expect(professionModifierGrantIssue({ expertiseLevels: [{ benefits: {} }] })).toBeUndefined();
  });
  it("preserves valid recipes in the editable draft round trip", async () => {
    const record = { resourceType: "definitions", sourceId: "blacksmith",
      payload: { kind: "profession", components: benefits([might, damage]) } };
    const content = { definitionIds: ["blacksmith"] };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new WorldDefinitionAuthoringService({
      worldDefinition: { findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", draft: {
        id: "draft", worldDefinitionId: "world", storageRevision: 1, content,
        revisionName: "Draft", snapshotRecords: [record], validationStatus: "NOT_VALIDATED",
        createdAt: new Date(), updatedAt: new Date(),
      } }) },
      worldDefinitionDraft: { updateMany },
    } as never, {} as never);
    const response = await service.save("world", {
      expectedStorageRevision: 1, revisionName: "Draft", content, records: [record],
    }, "gm");
    expect(response.records).toEqual([record]);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ snapshotRecords: [record] }) as unknown,
    }));
  });
  it("rejects malformed grants before a whole-draft save writes to the database", async () => {
    const updateMany = jest.fn();
    const service = new WorldDefinitionAuthoringService({
      worldDefinition: { findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", draft: { storageRevision: 1 } }) },
      worldDefinitionDraft: { updateMany },
    } as never, {} as never);
    await expect(service.save("world", {
      expectedStorageRevision: 1, revisionName: "Draft", content: {},
      records: [{ resourceType: "definitions", sourceId: "profession", payload: { kind: "profession", components: benefits([{ ...might, dice: [] }]) } }],
    }, "gm")).rejects.toThrow("invalid target");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
