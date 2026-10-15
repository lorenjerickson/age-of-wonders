import assert from "node:assert/strict";
import test from "node:test";
import { Attribute } from "../dist/index.js";
const option = () => ({
  lineage: {
    id: "strength",
    registryId: "core",
    key: "aow:strength",
    kind: "vocabulary-option",
    semanticRole: "aow:attribute",
    applicability: { kind: "global" },
    status: "active",
    currentRevisionId: "strength-1",
  },
  revision: {
    identity: {
      id: "strength-1",
      lineageId: "strength",
      revisionNumber: 1,
      publishedAt: "2026-01-01",
      contentHash: "hash-1",
    },
    payload: {
      kind: "vocabulary-option",
      vocabularyId: "attributes",
      valueMetadata: { "custom:range": [1, 20] },
    },
    presentation: { label: "Strength", order: 1 },
  },
});
const owner = () => ({
  lineage: {
    ...option().lineage,
    id: "attributes",
    kind: "vocabulary",
    semanticRole: "aow:attribute-registry",
  },
  revision: {
    ...option().revision,
    payload: { kind: "vocabulary", ordered: true },
  },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Attribute preserves the exact Model lineage/revision payload and extensions through codecs", () => {
  const data = option();
  const entity = Attribute.deserializePayload(data, { elements: [owner()] });
  assert.equal(entity.state.metadata.validity.status, "valid");
  data.revision.presentation.label = "changed";
  assert.equal(entity.state.data.revision.presentation.label, "Strength");
  const restored = Attribute.deserialize(entity.serialize(), {
    elements: [owner()],
  });
  assert.deepEqual(restored.serializePayload(), option());
  assert.ok(Object.isFrozen(entity.state.data.revision.presentation));
  entity.dispose();
  restored.dispose();
});
test("Attribute reports unresolved capture separately from missing/wrong vocabulary relationships", () => {
  const entity = Attribute.deserializePayload(option());
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.validate({ elements: [] });
  assert.deepEqual(codes(entity), ["element-reference-missing"]);
  const invalid = owner();
  invalid.lineage.kind = "concept";
  entity.validate({ elements: [invalid] });
  assert.deepEqual(codes(entity), ["element-reference-kind-mismatch"]);
  entity.dispose();
});
test("Attribute parent belongs to the same open vocabulary without a fixed standard key list", () => {
  const data = option();
  data.lineage.key = "custom:likeable";
  data.revision.payload.parentOptionId = "parent";
  const parent = option();
  parent.lineage.id = "parent";
  const entity = Attribute.deserializePayload(data, {
    elements: [owner(), parent],
  });
  assert.equal(entity.state.metadata.validity.status, "valid");
  parent.revision.payload.vocabularyId = "other";
  entity.validate({ elements: [owner(), parent] });
  assert.deepEqual(codes(entity), [
    "element-option-parent-vocabulary-mismatch",
  ]);
  entity.dispose();
});
test("Attribute selection publishes state before its event and does not edit published revisions", async () => {
  const entity = Attribute.deserializePayload(option(), {
    elements: [owner()],
  });
  const observations = [];
  entity.state$.subscribe((state) =>
    observations.push(state.data.revision.identity.id),
  );
  entity.events.revisionSelected.listen((event) =>
    observations.push(`event:${event.context.revisionId}`),
  );
  const revision = option().revision;
  revision.identity = {
    ...revision.identity,
    id: "strength-2",
    revisionNumber: 2,
    predecessorRevisionId: "strength-1",
    contentHash: "hash-2",
  };
  revision.presentation.label = "Might";
  const invocation = { initiator: "gm", params: { revision }, context: {} };
  assert.equal(
    (await entity.command("selectRevision", invocation)).status,
    "committed",
  );
  assert.deepEqual(observations, [
    "strength-1",
    "strength-2",
    "event:strength-2",
  ]);
  assert.equal(
    (await entity.command("selectRevision", invocation)).status,
    "unchanged",
  );
  const reordered = Object.fromEntries(Object.entries(revision).reverse());
  reordered.identity = Object.fromEntries(
    Object.entries(revision.identity).reverse(),
  );
  assert.equal(
    (
      await entity.command("selectRevision", {
        ...invocation,
        params: { revision: reordered },
      })
    ).status,
    "unchanged",
  );
  revision.presentation.label = "Tampered";
  await assert.rejects(entity.command("selectRevision", invocation), TypeError);
  revision.identity.id = "another";
  revision.identity.lineageId = "other";
  await assert.rejects(entity.command("selectRevision", invocation), TypeError);
  assert.equal(entity.state.data.revision.presentation.label, "Might");
  entity.dispose();
});
test("Attribute raw payload hydration never treats author input as an envelope", () => {
  const envelope = { type: "attribute", schemaVersion: 1, data: option() };
  assert.throws(() => Attribute.deserializePayload(envelope));
  assert.throws(() => Attribute.deserialize({ ...envelope, schemaVersion: 2 }));
  const data = option();
  data.revision.presentation.label = " ";
  const entity = Attribute.deserializePayload(data, { elements: [owner()] });
  assert.deepEqual(codes(entity), ["element-label-missing"]);
  entity.dispose();
});
