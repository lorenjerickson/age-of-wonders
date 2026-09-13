import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  updateTerrainExploration,
  parseTerrainExplorationSnapshot,
  MAX_TERRAIN_EXPLORATION_SURFACES,
} from "../dist/index.js";
const context = {
  campaignInstanceId: "instance",
  snapshotId: "snapshot",
  locationId: "map",
  observerId: "hero",
  runtimeRevision: 1,
};
const surface = (key = "1,1,1/solid/0", revision = 1) => ({
  key,
  material: { key: "terrain:stone", revision },
  treatment: "terrain",
  triangle: [
    { x: 1, y: 1, z: 2 },
    { x: 2, y: 1, z: 2 },
    { x: 2, y: 2, z: 2 },
  ],
});
const observation = (revision, surfaces = [], absentSurfaceKeys = []) => ({
  context: { ...context, runtimeRevision: revision },
  surfaces,
  absentSurfaceKeys,
});
describe("observer exploration snapshots", () => {
  it("round-trips owned last-known surfaces; unseen terrain and creatures cannot enter memory", () => {
    const input = observation(1, [surface()]);
    const first = updateTerrainExploration(undefined, input);
    input.surfaces[0].triangle[0].x = 90;
    const next = updateTerrainExploration(
      JSON.parse(JSON.stringify(first)),
      observation(2),
    );
    assert.equal(next.surfaces[0].triangle[0].x, 1);
    assert.equal(next.surfaces[0].lastSeenRuntimeRevision, 1);
    assert.deepEqual(next.visibleSurfaceKeys, []);
    assert.equal(next.surfaces.length, 1);
    assert.equal("actors" in next, false);
    next.surfaces[0].triangle[0].x = 30;
    assert.equal(first.surfaces[0].triangle[0].x, 1);
  });
  it("keeps roof and underside independent and preserves the material revision actually seen", () => {
    const roof = surface("1,1,1/solid/0"),
      underside = surface("1,1,1/solid/1");
    const first = updateTerrainExploration(
      undefined,
      observation(1, [roof, underside]),
    );
    const next = updateTerrainExploration(
      first,
      observation(2, [surface(roof.key, 2)]),
    );
    assert.equal(
      next.surfaces.find((s) => s.key === roof.key).material.revision,
      2,
    );
    assert.equal(
      next.surfaces.find((s) => s.key === underside.key).material.revision,
      1,
    );
    assert.deepEqual(next.visibleSurfaceKeys, [roof.key]);
  });
  it("erases disappeared surfaces only when explicitly observed absent", () => {
    const first = updateTerrainExploration(
      undefined,
      observation(1, [surface()]),
    );
    assert.equal(
      updateTerrainExploration(first, observation(2)).surfaces.length,
      1,
    );
    assert.equal(
      updateTerrainExploration(first, observation(2, [], [surface().key]))
        .surfaces.length,
      0,
    );
    assert.throws(() =>
      updateTerrainExploration(
        first,
        observation(2, [surface()], [surface().key]),
      ),
    );
    assert.equal(first.surfaces.length, 1);
  });
  it("rejects cross-instance, observer, map, snapshot, and future histories", () => {
    const first = updateTerrainExploration(
      undefined,
      observation(3, [surface()]),
    );
    for (const field of [
      "campaignInstanceId",
      "snapshotId",
      "locationId",
      "observerId",
    ]) {
      assert.throws(() =>
        updateTerrainExploration(first, {
          ...observation(4),
          context: { ...context, [field]: "other", runtimeRevision: 4 },
        }),
      );
    }
    assert.throws(() => updateTerrainExploration(first, observation(2)));
  });
  it("supports deterministic retries but rejects conflicting decisions at one revision", () => {
    const a = surface(),
      b = surface("1,1,1/solid/1");
    const first = updateTerrainExploration(undefined, observation(1, [b, a]));
    assert.deepEqual(
      updateTerrainExploration(first, observation(1, [a, b])),
      first,
    );
    assert.throws(() => updateTerrainExploration(first, observation(1, [a])));
    assert.throws(() =>
      updateTerrainExploration(first, observation(1, [surface(a.key, 2), b])),
    );
  });
  it("rejects corrupt persisted data, unknown fields, and oversized observations atomically", () => {
    const valid = updateTerrainExploration(
      undefined,
      observation(1, [surface()]),
    );
    for (const change of [
      (s) => (s.formatVersion = 2),
      (s) => (s.actors = []),
      (s) => (s.context.runtimeRevision = NaN),
      (s) => s.surfaces.push(s.surfaces[0]),
      (s) => (s.surfaces[0].lastSeenRuntimeRevision = 2),
      (s) => (s.surfaces[0].triangle[0].x = Infinity),
      (s) => (s.surfaces[0].triangle[0].gmNotes = "secret"),
      (s) => (s.surfaces[0].material.name = "secret"),
      (s) => (s.visibleSurfaceKeys = ["9,9,9/solid/0"]),
      (s) => (s.surfaces[0].key = "../secret"),
    ]) {
      const copy = JSON.parse(JSON.stringify(valid));
      change(copy);
      assert.throws(() => parseTerrainExplorationSnapshot(copy));
    }
    assert.throws(() =>
      updateTerrainExploration(
        valid,
        observation(
          2,
          Array(MAX_TERRAIN_EXPLORATION_SURFACES + 1).fill(surface()),
        ),
      ),
    );
    assert.deepEqual(parseTerrainExplorationSnapshot(valid), valid);
  });
});
