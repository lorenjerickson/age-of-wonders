import test from "node:test";
import assert from "node:assert/strict";
import { Map as DomainMap, Wall, Door, Window } from "../dist/index.js";
import {
  createTerrainVolume,
  terrainShapePreset,
} from "../../common/dist/index.js";
const material = {
  key: "terrain:stone",
  terrainType: "terrain:stone",
  name: "Stone",
  revision: 1,
};
const blank = () => createTerrainVolume({ x: 4, y: 4, z: 4 }, [material]);
const cube = {
  materialKey: material.key,
  shape: terrainShapePreset("cube", 0),
};
const address = { x: 1, y: 1, z: 0 };
const terrain = () =>
  DomainMap.applyTerrainWrites(blank(), [{ address, cell: cube }]).volume;
const wall = {
  id: "shared",
  vertices: [
    { kind: "normalized-map", x: 0, y: 0 },
    { kind: "normalized-map", x: 1, y: 1 },
  ],
  blocks: {
    sight: true,
    sound: false,
    movement: true,
    environmentalEffects: true,
  },
  private: { note: "keep" },
};
const command = (owner, name, params) =>
  owner.command(name, { params, context: {}, initiator: "gm" });
test("legacy walls round-trip without inventing kind, and formats remain explicit", () => {
  const legacy = Wall.deserializePayload(wall);
  assert.deepEqual(legacy.serializePayload(), wall);
  assert.equal(legacy.blocking().movement, true);
  legacy.dispose();
  const location = {
    image: { assetId: "map" },
    walls: [wall],
    gmDescription: "private",
  };
  const owner = DomainMap.fromLocation(location);
  assert.deepEqual(owner.serializePayload(), location);
  assert.deepEqual(
    DomainMap.deserialize(owner.serialize()).serializePayload(),
    location,
  );
  owner.dispose();
  assert.throws(
    () => Window.deserializePayload({ ...wall, kind: "window" }),
    /normalized/,
  );
});
test("opening state and blocking follow existing 2D and 3D contracts", async () => {
  const door = Door.deserializePayload({
    ...wall,
    kind: "door",
    doorState: "closed",
  });
  await command(door, "change", { state: "open" });
  assert.deepEqual(door.blocking(), {
    sight: false,
    sound: false,
    movement: false,
    environmentalEffects: false,
  });
  assert.equal(door.serializePayload().private.note, "keep");
  await assert.rejects(command(door, "change", { state: "locked" }));
  door.dispose();
  const window = Window.deserializePayload({
    id: "window",
    kind: "window",
    state: "closed",
    facing: 0,
    frameThickness: 2 / 16,
  });
  await assert.rejects(command(window, "change", { state: "locked" }));
  await command(window, "change", { state: "open" });
  assert.equal(window.serializePayload().state, "open");
  window.dispose();
});
test("Map owns stable isolated child views and commits one atomic parent transition", async () => {
  const location = {
    walls: [{ ...wall, kind: "door", doorState: "closed" }],
    gmDescription: "private",
  };
  const first = DomainMap.fromLocation(location),
    second = DomainMap.fromLocation(location);
  const child = first.elements()[0];
  assert.equal(child, first.elements()[0]);
  let emissions = 0;
  const sub = first.state$.subscribe(() => emissions++);
  const receipt = await child.change({ state: "open" }, "gm");
  assert.equal(receipt.status, "committed");
  assert.equal(emissions, 2);
  assert.equal(first.serializePayload().walls[0].doorState, "open");
  assert.equal(child.state.doorState, "open");
  assert.equal(second.elements()[0].state.doorState, "closed");
  await assert.rejects(child.change({ state: "locked" }, "gm"));
  assert.equal(emissions, 2);
  assert.equal(child.state.doorState, "open");
  assert.equal(first.serializePayload().gmDescription, "private");
  first.dispose();
  assert.equal(child.disposed, true);
  await assert.rejects(child.change({ state: "closed" }, "gm"), /disposed/);
  second.dispose();
  sub.unsubscribe();
});
test("terrain opening batches retain identity, reject incompatible cells and undo exactly", () => {
  const volume = terrain(),
    settings = {
      kind: "door",
      state: "closed",
      facing: 1,
      frameThickness: 2 / 16,
    };
  const created = DomainMap.applyTerrainWrites(
    volume,
    DomainMap.openingWrites(volume, [address], settings, () => "door"),
  );
  const changed = DomainMap.applyTerrainWrites(
    created.volume,
    DomainMap.openingWrites(
      created.volume,
      [address],
      { ...settings, state: "open" },
      () => {
        throw Error("identity replaced");
      },
    ),
  );
  assert.equal(changed.volume.chunks[0].cells[0].opening.id, "door");
  assert.deepEqual(
    DomainMap.applyTerrainWrites(changed.volume, changed.undo).volume,
    created.volume,
  );
  const rampAddress = { x: 2, y: 1, z: 0 };
  const mixed = DomainMap.applyTerrainWrites(volume, [
    {
      address: rampAddress,
      cell: { ...cube, shape: terrainShapePreset("ramp", 0) },
    },
  ]).volume;
  const before = JSON.stringify(mixed);
  assert.throws(
    () =>
      DomainMap.openingWrites(
        mixed,
        [address, rampAddress],
        settings,
        () => "new",
      ),
    /cube/,
  );
  assert.equal(JSON.stringify(mixed), before);
  assert.throws(
    () => DomainMap.smoothingWrites(created.volume, [address], 0.5),
    /cannot be smoothed/,
  );
});
test("terrain element facades route state changes and end when their cell is removed", async () => {
  const volume = DomainMap.applyTerrainWrites(
    terrain(),
    DomainMap.openingWrites(
      terrain(),
      [address],
      { kind: "door", state: "locked", facing: 0, frameThickness: 2 / 16 },
      () => "door",
    ),
  ).volume;
  const owner = DomainMap.fromTerrain(volume),
    child = owner.elements()[0];
  let completed = false;
  child.state$.subscribe({
    complete() {
      completed = true;
    },
  });
  await child.change({ state: "open" }, "gm");
  assert.equal(
    owner.serializePayload().chunks[0].cells[0].opening.state,
    "open",
  );
  await command(owner, "writeTerrain", { writes: [{ address, cell: null }] });
  assert.equal(child.disposed, true);
  assert.equal(completed, true);
  assert.equal(owner.elements().length, 0);
  await assert.rejects(child.change({ state: "closed" }, "gm"));
  owner.dispose();
});
test("invalid writes reject atomically and map scopes do not mutate inputs", async () => {
  const volume = terrain(),
    owner = DomainMap.fromTerrain(volume);
  let n = 0;
  owner.state$.subscribe(() => n++);
  await assert.rejects(
    command(owner, "writeTerrain", {
      writes: [
        { address, cell: null },
        { address: { x: 8, y: 0, z: 0 }, cell: cube },
      ],
    }),
  );
  assert.equal(n, 1);
  assert.deepEqual(owner.serializePayload(), volume);
  const bad = {
    ...cube,
    opening: {
      id: "door",
      kind: "door",
      state: "closed",
      facing: 0,
      frameThickness: 1 / 100,
    },
  };
  assert.throws(() =>
    DomainMap.applyTerrainWrites(volume, [{ address, cell: bad }]),
  );
  owner.dispose();
});
test("Map manifest validation preserves both formats and rejects malformed captures", () => {
  assert.equal(
    DomainMap.mapIssue({ kind: "image", private: "keep" }),
    undefined,
  );
  assert.match(
    DomainMap.mapIssue({ kind: "isometric", formatVersion: 9 }),
    /format|Terrain/,
  );
  assert.throws(() => DomainMap.fromTerrain({ ...blank(), formatVersion: 9 }));
  assert.throws(
    () =>
      DomainMap.openingWrites(
        terrain(),
        [{ x: -1, y: 0, z: 0 }],
        null,
        () => "unused",
      ),
    /outside/,
  );
});

test("Location owns a stable Map view whose replacement commits the parent and retains image/grid/private content", async () => {
  const { LocationDefinition } = await import("../dist/index.js");
  const original = {
    identity: {
      id: "location",
      version: { revision: 1, updatedAt: "2026-10-14" },
    },
    name: "Harbor",
    kind: "world",
    placement: { kind: "root" },
    profile: { tags: [] },
    image: {
      assetId: "art",
      altText: "Harbor",
      width: 64,
      height: 64,
      mimeType: "image/png",
      orientation: "scenic",
    },
    map: { kind: "image" },
    mapScene: {
      orientation: "scenic",
      grid: { kind: "square", cellSizePixels: 30 },
      notes: "Scene",
    },
    gmDescription: "Private",
  };
  const location = LocationDefinition.deserializePayload(original),
    view = location.map;
  let emissions = 0,
    completed = false;
  view.state$.subscribe({
    next() {
      emissions++;
    },
    complete() {
      completed = true;
    },
  });
  const { kind: _kind, ...volume } = blank();
  const manifest = { ...volume, kind: "isometric" };
  assert.equal((await view.replace(manifest, "gm")).status, "committed");
  assert.equal(view, location.map);
  assert.equal(location.serializePayload().map.kind, "isometric");
  assert.equal(view.state.map.kind, "isometric");
  assert.deepEqual(location.serializePayload().image, original.image);
  assert.deepEqual(
    location.serializePayload().mapScene.grid,
    original.mapScene.grid,
  );
  assert.equal(location.serializePayload().gmDescription, "Private");
  assert.equal(emissions, 2);
  await assert.rejects(view.replace({ ...manifest, formatVersion: 9 }, "gm"));
  assert.equal(emissions, 2);
  assert.equal(
    (await view.replace({ kind: "image" }, "gm")).status,
    "committed",
  );
  assert.equal(location.effectiveSceneGrid(), undefined);
  location.dispose();
  assert.equal(view.disposed, true);
  assert.equal(completed, true);
  await assert.rejects(view.replace(manifest, "gm"), /disposed/);
});

test("terrain ownership retains imported cell and chunk metadata through material edits and undo", () => {
  const original = terrain();
  original.chunks[0].privateChunk = "private";
  original.chunks[0].cells[0].privateCell = { note: "keep" };
  const changed = DomainMap.applyTerrainWrites(
    original,
    DomainMap.openingWrites(
      original,
      [address],
      { kind: "window", state: "closed", facing: 0, frameThickness: 2 / 16 },
      () => "window",
    ),
  );
  assert.equal(changed.volume.chunks[0].privateChunk, "private");
  assert.deepEqual(
    DomainMap.applyTerrainWrites(changed.volume, changed.undo).volume,
    original,
  );
  const material = DomainMap.editTerrainSelection(changed.volume, [address], {
    kind: "material",
    materialKey: "terrain:stone",
  });
  assert.deepEqual(material.volume.chunks[0].cells[0].privateCell, {
    note: "keep",
  });
});
