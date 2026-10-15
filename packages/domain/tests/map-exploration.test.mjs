import test from "node:test";
import assert from "node:assert/strict";
import { MapExploration } from "../dist/index.js";

const context = {
  campaignInstanceId: "instance",
  snapshotId: "capture",
  locationId: "map",
  observerId: "observer",
  runtimeRevision: 1,
};
const surface = {
  key: "0,0,0/solid/0",
  material: { key: "terrain:stone", revision: 2 },
  treatment: "terrain",
  triangle: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ],
};
const observation = (
  runtimeRevision,
  surfaces = [],
  absentSurfaceKeys = [],
) => ({
  context: { ...context, runtimeRevision },
  surfaces,
  absentSurfaceKeys,
});
const invoke = (params) => ({ initiator: "server", context: {}, params });

test("Map exploration retains unseen material revisions and removes only observed absence", async () => {
  const owner = MapExploration.fromObservation(observation(1, [surface]));
  const seen = [];
  owner.state$.subscribe((state) => seen.push(state));
  await owner.command("observe", invoke(observation(2)));
  assert.equal(owner.state.data.surfaces[0].material.revision, 2);
  assert.equal(owner.state.data.surfaces[0].lastSeenRuntimeRevision, 1);
  assert.deepEqual(owner.state.data.visibleSurfaceKeys, []);
  const restored = MapExploration.deserialize(
    JSON.parse(JSON.stringify(owner.serialize())),
  );
  assert.deepEqual(restored.serializePayload(), owner.serializePayload());
  await owner.command("observe", invoke(observation(3, [], [surface.key])));
  assert.deepEqual(owner.state.data.surfaces, []);
  assert.equal(seen.length, 3);
  owner.dispose();
  restored.dispose();
});

test("Map exploration is isolated, idempotent and rejects scope/revision conflicts atomically", async () => {
  const owner = MapExploration.fromObservation(observation(1, [surface]));
  const other = MapExploration.deserializePayload(owner.serializePayload());
  const seen = [];
  owner.state$.subscribe((state) => seen.push(state));
  await owner.command("observe", invoke(observation(1, [surface])));
  assert.equal(seen.length, 1);
  const before = owner.serializePayload();
  await assert.rejects(
    owner.command("observe", invoke(observation(1))),
    /Conflicting/,
  );
  for (const key of [
    "campaignInstanceId",
    "snapshotId",
    "locationId",
    "observerId",
  ]) {
    await assert.rejects(
      owner.command(
        "observe",
        invoke({
          ...observation(2),
          context: { ...context, runtimeRevision: 2, [key]: "foreign" },
        }),
      ),
      /different scope/,
    );
  }
  assert.deepEqual(owner.serializePayload(), before);
  assert.equal(seen.length, 1);
  await owner.command("observe", invoke(observation(2)));
  await assert.rejects(
    owner.command("observe", invoke(observation(1))),
    /newer runtime/,
  );
  assert.deepEqual(other.serializePayload(), before);
  owner.dispose();
  await assert.rejects(
    owner.command("observe", invoke(observation(3))),
    /disposed/,
  );
  other.dispose();
});

test("Map exploration rejects unknown/private fields at its player-memory boundary", () => {
  const snapshot = MapExploration.observeSnapshot(
    undefined,
    observation(1, [surface]),
  );
  assert.throws(() =>
    MapExploration.deserializePayload({ ...snapshot, secret: "hidden" }),
  );
  assert.throws(() =>
    MapExploration.deserializePayload({
      ...snapshot,
      surfaces: [{ ...snapshot.surfaces[0], openingId: "private" }],
    }),
  );
  assert.throws(() =>
    MapExploration.deserialize({
      type: "map-exploration",
      schemaVersion: 2,
      data: snapshot,
    }),
  );
});
