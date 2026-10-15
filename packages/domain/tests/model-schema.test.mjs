import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  ModelElement,
  ModelSchema,
  ModelMigration,
  modelElementRevisionContentHash,
  modelSchemaReleaseContentHash,
} from "../dist/index.js";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const context = { contentHash: hash };
function fixture() {
  const registry = {
    identity: {
      id: "registry",
      version: { revision: 1, updatedAt: "2026-01-01" },
    },
    key: "gm:model",
    name: "Private model",
    provenance: { kind: "gm", namespace: "gm", ownerUserId: "gm" },
  };
  const lineage = {
    id: "concept",
    registryId: "registry",
    key: "gm:concept",
    kind: "concept",
    semanticRole: "gm:concept",
    applicability: { kind: "global" },
    status: "active",
    currentRevisionId: "concept-1",
  };
  const revision = {
    identity: {
      id: "concept-1",
      lineageId: "concept",
      revisionNumber: 1,
      publishedAt: "2026-01-01",
      contentHash: "",
    },
    payload: { kind: "concept", abstract: false },
    presentation: {
      label: "Secret creatures",
      description: "Private GM material",
      helpText: "Do not discard",
    },
    source: { title: "Private source" },
    authoredByUserId: "gm",
  };
  revision.identity.contentHash = modelElementRevisionContentHash(
    revision,
    hash,
  );
  const release = {
    identity: {
      id: "release-1",
      lineageId: "registry",
      revisionNumber: 1,
      publishedAt: "2026-01-01",
      contentHash: "",
    },
    name: "First",
    elementSelections: [
      { elementId: "concept", elementRevisionId: "concept-1" },
    ],
    publishedByUserId: "gm",
  };
  release.identity.contentHash = modelSchemaReleaseContentHash(release, hash);
  return { registry, release, lineages: [lineage], revisions: [revision] };
}
test("Model release publication owns isolated exact content and rejects hash drift", async () => {
  const input = fixture();
  const owner = ModelSchema.deserializePayload(input, context);
  input.revisions[0].presentation.description = "mutated outside owner";
  const events = [];
  owner.events.published.listen((event) => events.push(event));
  assert.equal(
    (
      await owner.command("publish", {
        initiator: "gm",
        params: {},
        context: {},
      })
    ).status,
    "committed",
  );
  const compiled = owner.serializePayload().compiled;
  assert.equal(
    compiled.elements[0].revision.presentation.description,
    "Private GM material",
  );
  assert.equal(events.length, 1);
  assert.equal(
    (
      await owner.command("publish", {
        initiator: "gm",
        params: {},
        context: {},
      })
    ).status,
    "unchanged",
  );
  const restored = ModelSchema.deserialize(owner.serialize(), context);
  assert.deepEqual(restored.serializePayload(), owner.serializePayload());
  const invalid = ModelSchema.deserializePayload(input, context);
  assert.ok(
    invalid
      .compilationValidation()
      .issues.some((issue) => issue.code === "element-content-hash-mismatch"),
  );
  await assert.rejects(
    invalid.command("publish", { initiator: "gm", params: {}, context: {} }),
    /compilation is blocked/,
  );
  assert.equal(invalid.serializePayload().compiled, undefined);
  [owner, restored, invalid].forEach((entity) => entity.dispose());
});
test("Model Element revise and archive preserve content and reject wrong predecessors", async () => {
  const input = fixture();
  const owner = ModelElement.deserializePayload(
    { lineage: input.lineages[0], revision: input.revisions[0] },
    { ...context, registry: input.registry },
  );
  const revision = structuredClone(input.revisions[0]);
  revision.identity = {
    ...revision.identity,
    id: "concept-2",
    revisionNumber: 2,
    predecessorRevisionId: "wrong",
  };
  const command = () =>
    owner.command("revise", {
      initiator: "gm",
      params: { revision },
      context: {},
    });
  await assert.rejects(command(), /changed; refresh/);
  assert.deepEqual(owner.serializePayload().revision, input.revisions[0]);
  revision.identity.predecessorRevisionId = "concept-1";
  revision.identity.id = "concept-1";
  await assert.rejects(command(), /changed; refresh/);
  revision.identity.id = "concept-2";
  revision.identity.contentHash = modelElementRevisionContentHash(
    revision,
    hash,
  );
  assert.equal((await command()).status, "committed");
  assert.equal(owner.serializePayload().lineage.currentRevisionId, "concept-2");
  assert.equal(
    owner.serializePayload().revision.presentation.description,
    "Private GM material",
  );
  assert.equal(
    (
      await owner.command("archive", {
        initiator: "gm",
        params: {},
        context: {},
      })
    ).status,
    "committed",
  );
  await assert.rejects(command(), /changed; refresh/);
  owner.dispose();
});
test("Model migration and adopted roots keep exact release policy", () => {
  const owner = ModelSchema.deserializePayload(fixture(), context);
  const source = owner.compile();
  assert.deepEqual(ModelSchema.mergeRoots([source, source]), source.elements);
  assert.throws(
    () =>
      ModelSchema.mergeRoots([
        source,
        {
          ...source,
          elements: source.elements.map((element) => ({
            ...element,
            sourceReleaseId: "different",
          })),
        },
      ]),
    /conflicting/,
  );
  const target = {
    ...source,
    releaseId: "release-2",
    releaseIdentity: {
      ...source.releaseIdentity,
      id: "release-2",
      predecessorRevisionId: "release-1",
    },
  };
  const plan = {
    id: "migration",
    sourceReleaseId: "release-1",
    targetReleaseId: "release-2",
    mappings: [],
    createdByUserId: "gm",
    createdAt: "2026-01-02",
  };
  const migration = ModelMigration.deserializePayload({ plan, source, target });
  assert.deepEqual(migration.migrationValidation(), {
    valid: true,
    issues: [],
  });
  const restored = ModelMigration.deserialize(migration.serialize());
  assert.deepEqual(restored.serializePayload(), migration.serializePayload());
  [owner, migration, restored].forEach((entity) => entity.dispose());
});
