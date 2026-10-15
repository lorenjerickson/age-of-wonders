import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
const env = JSON.parse(await readFile("/tmp/aow-mapfix-env.json", "utf8"));
assert.equal(
  new URL(env.DATABASE_URL).pathname,
  "/aow_mapfix_disposable_20261014",
  "Only the disposable MAPFIX database is permitted",
);
const { cookie } = JSON.parse(
  await readFile("/tmp/aow-mapfix-auth.json", "utf8"),
);
const { worldId, locationId } = JSON.parse(
  await readFile("/tmp/aow-MAPFIX-target.json", "utf8"),
);
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const api = "http://127.0.0.1:3109/api",
  worldPath = `/worlds/${worldId}`,
  mapPath = `${worldPath}/atlas/locations/${locationId}/map`;
async function request(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      origin: "http://127.0.0.1:5198",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
async function ok(path, method = "GET", body, status = 200) {
  const response = await request(path, method, body);
  assert.equal(
    response.status,
    status,
    `${method} failed: ${JSON.stringify(response.data)}`,
  );
  return response.data;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const location = (records) =>
  records.find(
    (record) =>
      record.resourceType === "locations" && record.sourceId === locationId,
  ).payload;
try {
  const draft = await ok(`${worldPath}/draft`);
  const baseline = location(draft.records);
  assert.equal(
    baseline.map.kind,
    "image",
    "Begin with the verified image fixture",
  );
  const weather = {
    condition: "Terrain acceptance rain",
    temperatureCelsius: 7,
    wind: { speedKph: 10, directionDegrees: 90 },
    privateForecast: "retained",
  };
  let saved = await ok(`${worldPath}/atlas/locations/${locationId}`, "PUT", {
    expectedStorageRevision: draft.storageRevision,
    name: baseline.name,
    kind: baseline.kind,
    description: baseline.description,
    parentLocationId: baseline.placement?.parentLocationId,
    profileSummary: baseline.profile?.summary,
    profileTags: baseline.profile?.tags ?? [],
    mapSceneNotes: baseline.mapScene?.notes,
    weather,
    gmDescription: "B09 terrain private notes",
  });
  const revision = {
    expectedDraftId: saved.id,
    expectedStorageRevision: saved.storageRevision,
  };
  const chunk = {
    address: { x: 0, y: 0, z: 0 },
    cells: [
      {
        offset: 0,
        materialKey: "terrain:stone",
        shape: { top: [1, 1, 1, 1], diagonal: "00-11" },
        opening: {
          id: "acceptance-door",
          kind: "door",
          state: "closed",
          facing: 0,
          frameThickness: 0.125,
        },
      },
    ],
  };
  const uploaded = await ok(
    `${mapPath}/chunks`,
    "POST",
    { ...revision, chunk },
    201,
  );
  assert.equal(uploaded.contentHash, hash(chunk));
  const map = {
    kind: "isometric",
    formatVersion: 1,
    dimensions: { x: 4, y: 4, z: 4 },
    cellSize: { value: 5, unit: "ft" },
    chunkSize: 16,
    materials: [
      {
        key: "terrain:stone",
        name: "Stone",
        terrainType: "terrain:stone",
        revision: 1,
      },
    ],
    chunks: [{ address: chunk.address, contentHash: uploaded.contentHash }],
  };
  saved = await ok(mapPath, "PUT", {
    ...revision,
    operationId: randomUUID(),
    map,
  });
  assert.equal(saved.storageRevision, revision.expectedStorageRevision + 1);
  const persisted = await prisma.worldDefinitionDraft.findUniqueOrThrow({
    where: { worldDefinitionId: worldId },
  });
  const payload = location(persisted.snapshotRecords);
  assert.deepEqual(payload.map, map);
  assert.deepEqual(payload.weather, weather);
  assert.deepEqual(payload.image, baseline.image);
  assert.equal(payload.gmDescription, "B09 terrain private notes");
  const captured = persisted.snapshotRecords.find(
    (record) =>
      record.resourceType === "location-terrain-chunks" &&
      record.sourceId === uploaded.contentHash,
  );
  assert.deepEqual(captured.payload, chunk);
  assert.equal(hash(captured.payload), uploaded.contentHash);
  const hydrated = await ok(mapPath);
  assert.equal(hydrated.kind, "isometric-terrain");
  assert.deepEqual(hydrated.chunks, [chunk]);
  assert.deepEqual(
    await ok(`${mapPath}/chunks/${uploaded.contentHash}`),
    chunk,
  );
  const reloaded = await ok(`${worldPath}/draft`);
  assert.deepEqual(location(reloaded.records).map, map);
  const before = {
    storageRevision: persisted.storageRevision,
    records: persisted.snapshotRecords,
    uploads: await prisma.worldTerrainUpload.count({
      where: { draftId: saved.id },
    }),
  };
  const invalidChunk = {
    ...chunk,
    cells: [
      {
        ...chunk.cells[0],
        opening: { ...chunk.cells[0].opening, kind: "window", state: "locked" },
      },
    ],
  };
  const rejected = await request(`${mapPath}/chunks`, "POST", {
    expectedDraftId: saved.id,
    expectedStorageRevision: saved.storageRevision,
    chunk: invalidChunk,
  });
  assert.equal(rejected.status, 400);
  const after = await prisma.worldDefinitionDraft.findUniqueOrThrow({
    where: { worldDefinitionId: worldId },
  });
  assert.equal(after.storageRevision, before.storageRevision);
  assert.deepEqual(after.snapshotRecords, before.records);
  assert.equal(
    await prisma.worldTerrainUpload.count({ where: { draftId: saved.id } }),
    before.uploads,
  );
  const invalidCapture = await request(mapPath, "PUT", {
    expectedDraftId: saved.id,
    expectedStorageRevision: saved.storageRevision,
    operationId: randomUUID(),
    map: {
      ...map,
      chunks: [{ address: chunk.address, contentHash: "0".repeat(64) }],
    },
  });
  assert.equal(invalidCapture.status, 400);
  const still = await prisma.worldDefinitionDraft.findUniqueOrThrow({
    where: { worldDefinitionId: worldId },
  });
  assert.equal(still.storageRevision, before.storageRevision);
  assert.deepEqual(still.snapshotRecords, before.records);
  saved = await ok(mapPath, "PUT", {
    expectedDraftId: saved.id,
    expectedStorageRevision: saved.storageRevision,
    operationId: randomUUID(),
    map: baseline.map,
  });
  const restored = location((await ok(`${worldPath}/draft`)).records);
  assert.deepEqual(restored.map, baseline.map);
  assert.deepEqual(restored.image, baseline.image);
  assert.deepEqual(restored.weather, weather);
  assert.equal(restored.gmDescription, "B09 terrain private notes");
  console.log(
    JSON.stringify({
      pass: true,
      checks: [
        "actual HTTP Location.map replacement",
        "PostgreSQL captured manifest and chunk hash",
        "cube door hydration and reload",
        "weather/image/private preservation",
        "invalid chunk and missing capture atomic rejection",
        "image map restoration",
      ],
    }),
  );
} finally {
  await prisma.$disconnect();
}
