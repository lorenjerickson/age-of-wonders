import test from "node:test";
import assert from "node:assert/strict";
import { CharacterCreation } from "../dist/index.js";
const context = () => ({
  campaignInstanceSnapshotId: "capture",
  backgrounds: [{ id: "background", name: "Scout" }],
  professions: [{ id: "profession", name: "Ranger" }],
  heritages: [],
  maximumHeritages: 1,
  attributes: [
    { id: "strength", name: "Strength", minimum: 0, maximum: 100 },
    { id: "agility", name: "Agility", minimum: 0, maximum: 100 },
  ],
  attributeRollCount: 4,
  startingEquipment: [
    { id: "hat", name: "Hat", compatibleSlotSets: [["head"]] },
  ],
  equipmentSlots: [{ id: "head", name: "Head" }],
});
const draft = () => ({
  name: "Iris",
  backgroundDefinitionId: "background",
  professionDefinitionId: "profession",
  attributeRolls: [10, 20, 30, 40],
  attributeAssignments: { strength: 10, agility: 20 },
  startingEquipmentIds: ["hat"],
  equipmentAssignments: { hat: ["head"] },
  imageAssetIds: {
    portrait: "portrait",
    overheadToken: "overhead",
    paperDollToken: "side",
  },
  biography: "private biography",
});
test("creation captures independent options and validates partial versus complete sheets", () => {
  const original = context();
  const owner = new CharacterCreation(original);
  original.backgrounds.length = 0;
  assert.deepEqual(owner.completeIssues(draft()), []);
  assert.equal(
    owner.selectionIssue({ backgroundDefinitionId: "background" }),
    undefined,
  );
  assert.match(
    owner.selectionIssue({ backgroundDefinitionId: "foreign" }),
    /not available/,
  );
  assert.ok(
    owner
      .completeIssues({ ...draft(), professionDefinitionId: undefined })
      .some((x) => x.code === "profession-required"),
  );
});
test("creation consumes each generated roll once and rejects incomplete captured attributes", () => {
  const owner = new CharacterCreation(context());
  assert.ok(
    owner
      .completeIssues({
        ...draft(),
        attributeAssignments: { strength: 10, agility: 10 },
      })
      .some((x) => x.code === "attribute-roll-mismatch"),
  );
  assert.ok(
    owner
      .completeIssues({ ...draft(), attributeAssignments: { strength: 10 } })
      .some((x) => x.code === "attribute-assignments-incomplete"),
  );
  assert.ok(
    owner
      .completeIssues({ ...draft(), attributeRolls: [10, 20, 30, 101] })
      .some((x) => x.code === "attribute-rolls-required"),
  );
});
test("creation rejects invalid equipment and repeated artwork without mutating inputs", () => {
  const owner = new CharacterCreation(context());
  const source = draft();
  const before = structuredClone(source);
  assert.match(
    owner.equipmentIssue({ hat: ["head", "head"] }, ["hat"]),
    /does not fit/,
  );
  assert.match(owner.equipmentIssue({ hat: ["head"] }, []), /carried Item/);
  assert.ok(
    owner
      .completeIssues({
        ...source,
        imageAssetIds: {
          portrait: "same",
          overheadToken: "same",
          paperDollToken: "same",
        },
      })
      .some((x) => x.code === "artwork-required"),
  );
  assert.deepEqual(source, before);
});
test("review and association transitions preserve existing workflow and terminal states", () => {
  assert.equal(
    CharacterCreation.reviewIssue("READY_FOR_REVIEW", "approve", "DRAFT"),
    undefined,
  );
  assert.equal(
    CharacterCreation.reviewIssue("COMPLETE", "request-changes", "DRAFT"),
    undefined,
  );
  assert.match(
    CharacterCreation.reviewIssue("COMPLETE", "request-changes", "ACTIVE"),
    /active Character/,
  );
  assert.match(
    CharacterCreation.reviewIssue("IN_PROGRESS", "approve", "DRAFT"),
    /reviewable/,
  );
  assert.equal(
    CharacterCreation.canTransition("INACTIVE", "INACTIVE", "ACTIVE"),
    true,
  );
  assert.equal(
    CharacterCreation.canTransition("DEAD", "DEAD", "ACTIVE"),
    false,
  );
  assert.equal(
    CharacterCreation.canTransition("ACTIVE", "DRAFT", "ACTIVE"),
    false,
  );
});
test("activation is deterministic, snapshot-bound and detached from draft data", () => {
  const owner = new CharacterCreation(context());
  const source = draft();
  const sheet = owner.activationSheet(source, {
    characterId: "actor",
    campaignInstanceId: "instance",
    ownerMembershipId: "member",
    sourceDraftRevision: 7,
    approvedAt: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(sheet.campaignInstanceSnapshotId, "capture");
  assert.equal(sheet.sourceDraftRevision, 7);
  assert.equal(sheet.biography, source.biography);
  sheet.equipmentAssignments.hat.push("extension");
  assert.deepEqual(source.equipmentAssignments.hat, ["head"]);
  assert.throws(
    () =>
      owner.activationSheet(
        { ...source, name: "" },
        {
          characterId: "actor",
          campaignInstanceId: "instance",
          ownerMembershipId: "member",
          sourceDraftRevision: 7,
          approvedAt: "now",
        },
      ),
    /no longer conforms/,
  );
});
test("one-way import preserves compatible choices and private biography without retaining identity", () => {
  const source = {
    ...draft(),
    startingEquipmentDefinitionIds: ["hat"],
    identity: { id: "old" },
    equipmentAssignments: { hat: ["head"], custom: { detail: "retained" } },
  };
  const imported = CharacterCreation.importDraft(source, "New name");
  assert.equal(imported.name, "New name");
  assert.equal(imported.biography, "private biography");
  assert.equal(imported.identity, undefined);
  assert.deepEqual(imported.equipmentAssignments, source.equipmentAssignments);
  imported.equipmentAssignments.custom.detail = "changed";
  assert.equal(source.equipmentAssignments.custom.detail, "retained");
  assert.throws(() => CharacterCreation.importDraft(null, "Name"), /safely/);
});

test("import-to-activation preserves extensions while authoritative cleared fields are replaced", () => {
  const owner = new CharacterCreation(context());
  const source = {
    ...draft(),
    startingEquipmentDefinitionIds: ["hat"],
    privateData: { secret: "retained" },
    modifierGrants: [{ old: true }],
    biography: "old",
    sourceSheet: { nested: "must not expand" },
  };
  const imported = CharacterCreation.importDraft(source, "New name");
  const sheet = owner.activationSheet(
    { ...imported, attributeRolls: draft().attributeRolls, biography: "" },
    {
      characterId: "new",
      campaignInstanceId: "new-instance",
      ownerMembershipId: "new-member",
      sourceDraftRevision: 8,
      approvedAt: "2026-10-14T00:00:00Z",
    },
  );
  assert.deepEqual(sheet.privateData, { secret: "retained" });
  assert.equal(sheet.identity.id, "new");
  assert.equal(sheet.biography, undefined);
  assert.equal(sheet.modifierGrants, undefined);
  assert.equal(sheet.sourceSheet, undefined);
  assert.equal(imported.sourceSheet.biography, "old");
});
test("available rolls and fitting equipment options match creation policy", () => {
  assert.deepEqual(
    CharacterCreation.availableRolls([10, 10, 20], { a: 10, b: 10 }, "c"),
    [20],
  );
  assert.deepEqual(
    CharacterCreation.availableRolls([10, 10, 20], { a: 10, b: 10 }, "a"),
    [10, 20],
  );
  const item = {
    id: "hat",
    name: "Hat",
    compatibleSlotSets: [["head"], ["missing"], ["head", "head"]],
  };
  assert.deepEqual(
    CharacterCreation.fittingSlotSets(item, {}, context().equipmentSlots),
    [["head"]],
  );
  assert.deepEqual(
    CharacterCreation.fittingSlotSets(
      item,
      { other: ["head"] },
      context().equipmentSlots,
    ),
    [],
  );
});

test("optional absent capture DTO keys remain compatible without retaining caller mutations", () => {
  const capture = { ...context(), worldDefinitionId: undefined };
  capture.backgrounds[0].description = undefined;
  const owner = new CharacterCreation(capture);
  capture.backgrounds[0].name = "mutated";
  assert.equal(owner.context.backgrounds[0].name, "Scout");
  assert.equal(owner.context.worldDefinitionId, undefined);
  assert.deepEqual(owner.completeIssues(draft()), []);
});
