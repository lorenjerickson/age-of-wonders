import test from "node:test";
import assert from "node:assert/strict";
import {
  CampaignDefinition,
  DefinitionLineage,
  rewriteWorldDefinitionReferences,
  rewriteCampaignWorldReferences,
} from "../dist/index.js";
const invoke = (owner, name, params) =>
  owner.command(name, { initiator: "gm", context: {}, params });
const content = () => ({
  ...CampaignDefinition.createContent(),
  preparation: {
    startingContext: "Private staging",
    locationCanvases: [
      {
        locationId: "room",
        layers: [{ key: "notes", visible: false, opacity: 0.5 }],
        notes: [
          {
            id: "note",
            name: "Secret",
            position: { x: 0.1, y: 0.2 },
            text: "Hidden",
            private: true,
          },
        ],
      },
    ],
  },
  extensions: { private: true },
});
const context = {
  campaignDefinitionId: "campaign",
  capturedWorld: {
    records: [
      {
        resourceType: "locations",
        sourceId: "room",
        payload: { name: "Room" },
      },
    ],
  },
};
test("Campaign aggregate codecs and replacement preserve preparation and private extensions", async () => {
  const owner = CampaignDefinition.deserializePayload(
    { content: content(), records: [] },
    context,
  );
  assert.equal(owner.state.metadata.validity.status, "valid");
  const updated = {
    ...owner.serializePayload(),
    content: {
      ...owner.serializePayload().content,
      gmPremise: "A new premise",
    },
  };
  await invoke(owner, "replace", updated);
  const restored = CampaignDefinition.deserialize(owner.serialize(), context);
  assert.deepEqual(restored.serializePayload(), updated);
  assert.equal(
    restored.state.data.content.preparation.locationCanvases[0].notes[0]
      .private,
    true,
  );
  await assert.rejects(
    invoke(owner, "replace", { content: null, records: [] }),
    /required/,
  );
  assert.deepEqual(owner.serializePayload(), updated);
  restored.dispose();
  owner.dispose();
});
test("Campaign owns captured preparation validity without rejecting editable incomplete drafts", async () => {
  const owner = CampaignDefinition.deserializePayload(
    { content: content(), records: [] },
    context,
  );
  const invalid = content();
  invalid.preparation.locationCanvases[0].locationId = "elsewhere";
  await invoke(owner, "replace", { content: invalid, records: [] });
  assert.ok(
    owner.state.metadata.validity.issues.some(
      (x) => x.code === "location-not-captured",
    ),
  );
  assert.equal(owner.state.data.content.extensions.private, true);
  owner.dispose();
});
test("fork rewrites Campaign identities and preserves captured references, private data and source isolation", async () => {
  const owner = CampaignDefinition.deserializePayload(
    {
      content: { ...content(), plotDefinitionIds: ["plot"] },
      records: [
        {
          resourceType: "plots",
          sourceId: "plot",
          payload: {
            id: "plot",
            campaignDefinitionId: "campaign",
            locationId: "room",
            private: "memo",
          },
        },
      ],
    },
    context,
  );
  const before = owner.serializePayload();
  await invoke(owner, "fork", {
    targetCampaignId: "fork",
    mapping: { plots: { plot: "copy" } },
  });
  assert.equal(owner.state.data.records[0].sourceId, "copy");
  assert.equal(
    owner.state.data.records[0].payload.campaignDefinitionId,
    "fork",
  );
  assert.equal(owner.state.data.records[0].payload.locationId, "room");
  assert.equal(owner.state.data.records[0].payload.private, "memo");
  assert.equal(before.records[0].sourceId, "plot");
  owner.dispose();
});
test("lineage publication rejects stale/unvalidated evidence without emitting or advancing; accepts exact predecessor", async () => {
  const owner = DefinitionLineage.deserializePayload({
    status: "ACTIVE",
    currentRevisionId: "old",
    revisionNumber: 2,
  });
  const evidence = {
    storageRevision: 4,
    expectedStorageRevision: 4,
    baseRevisionId: "old",
    validationStatus: "VALID",
    validatedStorageRevision: 4,
    revisionId: "new",
  };
  await assert.rejects(
    invoke(owner, "publish", { ...evidence, validatedStorageRevision: 3 }),
    /not-validated/,
  );
  await assert.rejects(
    invoke(owner, "publish", { ...evidence, baseRevisionId: "other" }),
    /stale-base/,
  );
  assert.equal(owner.state.data.revisionNumber, 2);
  await invoke(owner, "publish", evidence);
  assert.equal(owner.state.data.revisionNumber, 3);
  assert.equal(owner.state.data.currentRevisionId, "new");
  await invoke(owner, "archive", { archived: true });
  await assert.rejects(
    invoke(owner, "publish", {
      ...evidence,
      baseRevisionId: "new",
      revisionId: "next",
    }),
    /archived/,
  );
  owner.dispose();
});
test("World fork and Campaign adoption rewrite only existing reference grammar", () => {
  const data = {
    id: "item",
    locationId: "room",
    skills: { skill: { value: 3 } },
    propertyPath: "skills.skill.value",
    description: "room",
    extensions: { private: true },
  };
  const fork = rewriteWorldDefinitionReferences(
    data,
    {
      definitions: { item: "new-item", skill: "new-skill" },
      locations: { room: "new-room" },
    },
    "definitions",
  );
  assert.equal(fork.id, "new-item");
  assert.equal(fork.locationId, "new-room");
  assert.equal(fork.propertyPath, "skills.new-skill.value");
  assert.equal(fork.skills["new-skill"].value, 3);
  assert.equal(fork.description, "room");
  const migrated = rewriteCampaignWorldReferences(
    { locationId: "room", creatureId: "beast", notes: "room" },
    new Map([
      ["locations\0room", "new-room"],
      ["definitions\0beast", "new-beast"],
    ]),
  );
  assert.deepEqual(migrated, {
    locationId: "new-room",
    creatureId: "new-beast",
    notes: "room",
  });
  assert.match(
    DefinitionLineage.successorIssue(
      { worldDefinitionId: "world", worldDefinitionRevisionId: "old" },
      { worldDefinitionId: "other", predecessorRevisionId: "old" },
    ),
    /different/,
  );
});

test("World NPC placement forks use the Character resource namespace", () => {
  assert.deepEqual(
    rewriteWorldDefinitionReferences(
      { kind: "world-character", characterTemplateId: "same", notes: "same" },
      {
        definitions: { same: "creature-copy" },
        "world-character-templates": { same: "npc-copy" },
      },
    ),
    { kind: "world-character", characterTemplateId: "npc-copy", notes: "same" },
  );
});

test("Profession and Background forks rewrite Effect and Condition associations by resource namespace", () => {
  const source = {
    components: {
      grantedEffects: [{ effectId: "benefit" }],
      grantedConditions: [{ conditionId: "benefit" }],
    },
    extensions: { private: "benefit" },
  };
  const fork = rewriteWorldDefinitionReferences(source, {
    "world-effects": { benefit: "effect-copy" },
    "world-conditions": { benefit: "condition-copy" },
  });
  assert.equal(fork.components.grantedEffects[0].effectId, "effect-copy");
  assert.equal(
    fork.components.grantedConditions[0].conditionId,
    "condition-copy",
  );
  assert.equal(fork.extensions.private, "benefit");
});
