import assert from "node:assert/strict";
import test from "node:test";
import { LocationDefinition } from "../dist/index.js";

const image = () => ({
  assetId: "map",
  altText: "The valley",
  width: 400,
  height: 200,
  mimeType: "image/png",
  orientation: "overhead",
});
const payload = () => ({
  identity: { id: "valley", version: { revision: 1, updatedAt: "2026-10-11" } },
  name: "Valley",
  kind: "region",
  placement: { kind: "root" },
  profile: { tags: [] },
  map: { kind: "image" },
  image: image(),
});
const terrain = () => ({
  kind: "isometric",
  formatVersion: 1,
  chunkSize: 16,
  dimensions: { x: 10, y: 10, z: 2 },
  cellSize: { value: 5, unit: "ft" },
  materials: [
    {
      key: "world:stone",
      name: "Stone",
      terrainType: "world:stone",
      revision: 1,
    },
  ],
  chunks: [],
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((i) => i.code);
const hydrate = (data, context = {}) =>
  LocationDefinition.deserializePayload(data, context);

test("Location round trips private fields, owned geometry, hierarchy position and legacy captures without aliases", () => {
  const data = {
    ...payload(),
    gmDescription: "Secret",
    discoveries: [{ id: "secret", kind: "truth", statement: "A tunnel" }],
    privateFields: { password: "hidden" },
    walls: [{ id: "wall", doors: [{ id: "door" }] }],
    extensions: { "world:notes": [1] },
    connectedLocationIds: ["legacy"],
  };
  const entity = hydrate(data);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.deepEqual(
    LocationDefinition.deserialize(entity.serialize()).serializePayload(),
    data,
  );
  const encoded = entity.serializePayload();
  encoded.walls[0].doors.push({ id: "second" });
  assert.equal(entity.state.data.walls[0].doors.length, 1);
});

test("Location mapless drafts hydrate as invalid; marker alone cannot satisfy the required map", () => {
  for (const map of [undefined, { kind: "image" }]) {
    const data = payload();
    delete data.image;
    if (map === undefined) delete data.map;
    else data.map = map;
    const entity = hydrate(data);
    assert(codes(entity).includes("location-canonical-map-required"));
    assert.deepEqual(entity.serializePayload(), data);
  }
  const legacy = payload();
  delete legacy.map;
  assert.equal(hydrate(legacy).state.metadata.validity.status, "valid");
});

test("Location accepts explicit blank terrain and validates manifest bounds and chunk hashes", () => {
  const data = payload();
  delete data.image;
  data.map = terrain();
  assert.equal(hydrate(data).state.metadata.validity.status, "valid");
  data.map.dimensions.x = 0;
  assert(codes(hydrate(data)).includes("location-canonical-map"));
  data.map = terrain();
  data.map.chunks = [{ address: { x: 0, y: 0, z: 0 }, contentHash: "bad" }];
  assert(codes(hydrate(data)).includes("location-canonical-map"));
});

test("Location validates image metadata and local scene grid while scenic grids stay dormant", () => {
  const data = {
    ...payload(),
    mapScene: {
      orientation: "overhead",
      grid: { kind: "hex", cellSizePixels: 32 },
    },
  };
  assert.deepEqual(hydrate(data).effectiveSceneGrid(), data.mapScene.grid);
  data.mapScene.orientation = "scenic";
  assert.equal(hydrate(data).effectiveSceneGrid(), undefined);
  assert.deepEqual(hydrate(data).serializePayload().mapScene.grid, {
    kind: "hex",
    cellSizePixels: 32,
  });
  data.mapScene.grid.cellSizePixels = 0;
  assert(codes(hydrate(data)).includes("location-canonical-scene"));
  for (const patch of [
    { width: 0 },
    { altText: "" },
    { orientation: "isometric" },
    { mimeType: "text/plain" },
  ])
    assert(
      codes(
        hydrate({ ...payload(), image: { ...image(), ...patch } }),
      ).includes("location-canonical-image"),
    );
});

test("Location references resolve only against authorized context and expose root and self-parent errors in state", () => {
  const data = {
    ...payload(),
    placement: {
      kind: "within-parent",
      parentLocationId: "world",
      mapPosition: { x: 0.2, y: 0.4 },
    },
  };
  assert.equal(hydrate(data).state.metadata.validity.status, "unresolved");
  assert(
    codes(hydrate(data, { records: [] })).includes("location-codex-parent"),
  );
  const context = {
    rootLocationId: "world",
    records: [{ resourceType: "locations", sourceId: "world", payload: {} }],
  };
  assert.equal(hydrate(data, context).state.metadata.validity.status, "valid");
  assert(codes(hydrate(payload(), context)).includes("location-codex-parent"));
  assert(
    codes(hydrate(data, { ...context, rootLocationId: "valley" })).includes(
      "location-codex-parent",
    ),
  );
  data.placement.parentLocationId = "valley";
  assert(codes(hydrate(data)).includes("location-codex-parent"));
});

test("Location grants check duplicate and missing Conditions even when its map is missing", () => {
  const data = {
    ...payload(),
    grantedConditions: [{ conditionId: "blessed" }],
  };
  delete data.image;
  const entity = hydrate(data, { records: [] });
  assert(codes(entity).includes("location-canonical-map-required"));
  assert(codes(entity).includes("location-codex-grants"));
  data.image = image();
  const records = [
    { resourceType: "world-conditions", sourceId: "blessed", payload: {} },
  ];
  assert.equal(
    hydrate(data, { records }).state.metadata.validity.status,
    "valid",
  );
  data.grantedConditions.push({ conditionId: "blessed" });
  assert(codes(hydrate(data, { records })).includes("location-codex-grants"));
});

test("Location authoring preserves private and grid state, strips authored adjacency and preserves position only for unchanged parent", () => {
  const prior = {
    ...payload(),
    gmDescription: "Private",
    discoveries: [{ id: "d", kind: "belief", statement: "A spirit" }],
    extensions: { "world:custom": true },
    placement: {
      kind: "within-parent",
      parentLocationId: "world",
      mapPosition: { x: 0.2, y: 0.3 },
      border: { kind: "circle", radius: 0.1 },
    },
    connectedLocationIds: ["x"],
    adjacentLocationIds: ["y"],
    mapScene: { grid: { kind: "square", cellSizePixels: 50 } },
  };
  const input = {
    name: " Valley ",
    kind: "region",
    parentLocationId: "world",
    mapOrientation: "scenic",
  };
  const result = LocationDefinition.authorPayload("valley", input, prior);
  assert.equal(result.name, "Valley");
  assert.equal(result.identity.version.revision, 2);
  assert.deepEqual(result.placement, prior.placement);
  assert.equal(result.gmDescription, "Private");
  assert.deepEqual(result.discoveries, prior.discoveries);
  assert.deepEqual(result.extensions, prior.extensions);
  assert.deepEqual(result.mapScene.grid, prior.mapScene.grid);
  assert.equal(result.connectedLocationIds, undefined);
  assert.equal(result.adjacentLocationIds, undefined);
  assert.deepEqual(prior.connectedLocationIds, ["x"]);
  assert.equal(
    LocationDefinition.authorPayload(
      "valley",
      { ...input, parentLocationId: "other" },
      prior,
    ).placement.mapPosition,
    undefined,
  );
  assert.equal(
    LocationDefinition.authorPayload(
      "valley",
      { ...input, mapSceneGrid: null },
      prior,
    ).mapScene.grid,
    undefined,
  );
});

test("Location terrain edits retain dormant grids, private state and increment server identity", () => {
  const prior = {
    ...payload(),
    mapScene: { grid: { kind: "square", cellSizePixels: 40 }, notes: "Fog" },
    gmDescription: "Secret",
  };
  const next = LocationDefinition.withMap(prior, terrain());
  assert.equal(next.identity.version.revision, 2);
  assert.equal(next.mapScene.orientation, "isometric");
  assert.deepEqual(next.mapScene.grid, prior.mapScene.grid);
  assert.equal(next.gmDescription, "Secret");
  assert.equal(hydrate(next).effectiveSceneGrid(), undefined);
});

test("Location artwork preserves trusted dimensions and strips transport URI", () => {
  const prior = { ...image(), uri: "private" };
  const input = {
    ...prior,
    altText: "New",
    orientation: "scenic",
    width: 999,
    uri: "untrusted",
  };
  assert.deepEqual(LocationDefinition.preservedArtwork(input, prior), {
    ...image(),
    altText: "New",
    orientation: "scenic",
  });
  assert.equal(
    LocationDefinition.preservedArtwork({ ...input, assetId: "other" }, prior),
    undefined,
  );
  assert.equal(
    LocationDefinition.verifiedArtwork(input, "image/webp").uri,
    undefined,
  );
  assert.equal(
    LocationDefinition.verifiedArtwork(input, "image/webp").mimeType,
    "image/webp",
  );
});

test("Location rename publishes immutable state before its event and rejects mutation of invalid drafts", async () => {
  const entity = hydrate(payload());
  const seen = [];
  entity.state$.subscribe((state) => seen.push(state.data.name));
  entity.events.renamed.listen((event) => seen.push(event.context.name));
  const invocation = {
    initiator: "gm",
    params: { name: " Canyon " },
    context: {},
  };
  assert.equal(
    (await entity.command("rename", invocation)).status,
    "committed",
  );
  assert.deepEqual(seen, ["Valley", "Canyon", "Canyon"]);
  assert.equal(
    (await entity.command("rename", invocation)).status,
    "unchanged",
  );
  const data = payload();
  delete data.image;
  assert.equal(
    (await hydrate(data).command("rename", invocation)).status,
    "rejected",
  );
});

test("Location raw codec never unwraps an envelope-shaped stored record and rejects non-JSON inputs", () => {
  const entity = hydrate(payload());
  assert(
    codes(hydrate(entity.serialize())).includes("location-canonical-identity"),
  );
  assert.equal(
    LocationDefinition.deserialize(entity.serialize()).state.metadata.validity
      .status,
    "valid",
  );
  for (const bad of [
    null,
    [],
    { ...payload(), value: undefined },
    { type: "location-definition", schemaVersion: 2, data: payload() },
  ])
    assert.throws(() => LocationDefinition.deserialize(bad));
});

test("Location rejects invalid discoveries and preserves canonical source identity checking", () => {
  assert(
    codes(hydrate(payload(), { sourceId: "other" })).includes(
      "location-canonical-identity",
    ),
  );
  assert(
    codes(
      hydrate({
        ...payload(),
        discoveries: [{ id: "a", kind: "fact", statement: "No" }],
      }),
    ).includes("location-canonical-discoveries"),
  );
  assert(
    codes(hydrate({ ...payload(), gmDescription: 9 })).includes(
      "location-canonical-private-description",
    ),
  );
});

test("Location partial legacy payloads still report unavailable Condition grants independently of canonical errors", () => {
  const entity = hydrate(
    { grantedConditions: [{ conditionId: "missing" }] },
    { records: [] },
  );
  assert(codes(entity).includes("location-canonical-identity"));
  assert(codes(entity).includes("location-codex-grants"));
});

test("Location draft edits reject new or changed retired links but preserve unchanged legacy captures", () => {
  const data = { ...payload(), connectedLocationIds: ["legacy"] };
  assert(
    !codes(hydrate(data, { mode: "publication" })).includes(
      "location-codex-retired-links",
    ),
  );
  assert(
    !codes(hydrate(data, { mode: "draft", baseline: data })).includes(
      "location-codex-retired-links",
    ),
  );
  assert(
    codes(hydrate(data, { mode: "draft" })).includes(
      "location-codex-retired-links",
    ),
  );
  assert(
    codes(
      hydrate(
        { ...data, connectedLocationIds: [] },
        { mode: "draft", baseline: data },
      ),
    ).includes("location-codex-retired-links"),
  );
  assert(
    codes(
      hydrate(
        { ...payload(), adjacentLocationIds: ["legacy"] },
        { mode: "draft" },
      ),
    ).includes("location-codex-retired-links"),
  );
});

test("Location active reference scans ignore retired adjacency while preserving containment and grants", () => {
  const data = {
    ...payload(),
    connectedLocationIds: ["retired"],
    adjacentLocationIds: ["retired-too"],
    placement: { kind: "within-parent", parentLocationId: "world" },
    grantedConditions: [{ conditionId: "blessed" }],
  };
  const entity = hydrate(data);
  assert.equal(entity.references("retired"), false);
  assert.equal(entity.references("retired-too"), false);
  assert.equal(entity.references("world"), true);
  assert.equal(entity.references("blessed"), true);
  assert.equal(entity.references("map"), true);
  assert.deepEqual(entity.serializePayload(), data);
});

test("Location unrelated authoring preserves scenic orientation, dormant grids and scene notes", () => {
  const prior = {
    ...payload(),
    mapScene: {
      orientation: "scenic",
      notes: "Keep the distant ruins hidden",
      grid: { kind: "square", cellSizePixels: 48 },
    },
  };
  const renamed = LocationDefinition.authorPayload(
    "valley",
    { name: "Hidden Valley", kind: "region" },
    prior,
  );
  assert.equal(renamed.image.orientation, "overhead");
  assert.deepEqual(renamed.mapScene, prior.mapScene);
  assert.equal(hydrate(renamed).effectiveSceneGrid(), undefined);
  const clearedNotes = LocationDefinition.authorPayload(
    "valley",
    { name: "Hidden Valley", kind: "region", mapSceneNotes: "" },
    prior,
  );
  assert.equal(clearedNotes.mapScene.notes, undefined);
  assert.equal(clearedNotes.mapScene.orientation, "scenic");
  const overhead = LocationDefinition.authorPayload(
    "valley",
    { name: "Hidden Valley", kind: "region", mapOrientation: "overhead" },
    prior,
  );
  assert.deepEqual(hydrate(overhead).effectiveSceneGrid(), prior.mapScene.grid);
});

test("authored map selection preserves terrain and requires image content", () => {
  const terrain = { kind: "isometric", private: { retained: true } };
  assert.equal(LocationDefinition.authoringMap(terrain, undefined, "isometric"), terrain);
  assert.deepEqual(LocationDefinition.authoringMap(terrain, image(), "scenic"), { kind: "image" });
  assert.throws(() => LocationDefinition.authoringMap({ kind: "image" }, image(), "isometric"), /terrain map/);
  assert.throws(() => LocationDefinition.authoringMap(undefined, undefined, "overhead"), /map image/);
});
