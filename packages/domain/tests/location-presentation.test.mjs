import assert from "node:assert/strict";
import test from "node:test";
import { LocationDefinition } from "../dist/index.js";
const base = {
  identity: {
    id: "harbor",
    version: { revision: 1, updatedAt: "2026-10-14T00:00:00.000Z" },
  },
  name: "Harbor",
  kind: "world",
  placement: { kind: "root" },
  profile: { tags: [] },
  map: { kind: "image" },
  image: {
    assetId: "map",
    altText: "Map",
    width: 64,
    height: 64,
    mimeType: "image/png",
    orientation: "overhead",
  },
  privateNotes: { secret: true },
  weather: { condition: "Rain", privateForecast: "GM" },
  audiovisualEffects: [
    {
      id: "rain",
      name: "Rainfall",
      kind: "audio",
      assetId: "audio",
      enabled: true,
      loop: true,
      volume: 0.5,
      privateCue: true,
    },
  ],
};
test("presentation owner configures, clears and roundtrips weather and named audiovisual cues without losing private fields", async () => {
  const entity = LocationDefinition.deserializePayload(base);
  try {
    await entity.command("configurePresentation", {
      initiator: "gm",
      params: {
        weather: {
          condition: "Snow",
          temperatureCelsius: -2,
          wind: { speedKph: 12, directionDegrees: 90 },
        },
      },
      context: {},
    });
    assert.equal(entity.state.data.weather.condition, "Snow");
    assert.equal(entity.state.data.weather.privateForecast, "GM");
    assert.equal(entity.state.data.audiovisualEffects[0].privateCue, true);
    assert.deepEqual(entity.state.data.privateNotes, { secret: true });
    const { privateCue: _privateCue, ...knownCue } = base.audiovisualEffects[0];
    await entity.command("configurePresentation", {
      initiator: "gm",
      params: { audiovisualEffects: [{ ...knownCue, volume: 0.8 }] },
      context: {},
    });
    assert.equal(entity.state.data.audiovisualEffects[0].privateCue, true);
    assert.equal(entity.state.data.audiovisualEffects[0].volume, 0.8);
    await entity.command("configurePresentation", {
      initiator: "gm",
      params: { weather: null, audiovisualEffects: [] },
      context: {},
    });
    assert.equal(entity.state.data.weather, undefined);
    assert.deepEqual(entity.state.data.audiovisualEffects, []);
    const copy = LocationDefinition.deserialize(entity.serialize());
    assert.deepEqual(copy.serializePayload(), entity.serializePayload());
    copy.dispose();
  } finally {
    entity.dispose();
  }
});
test("invalid presentation changes reject atomically and malformed imports remain inspectable", async () => {
  const entity = LocationDefinition.deserializePayload(base);
  const before = entity.serializePayload();
  try {
    for (const change of [
      { weather: { condition: "Wind", wind: { speedKph: -1 } } },
      {
        weather: {
          condition: "Wind",
          wind: { speedKph: 1, directionDegrees: 360 },
        },
      },
      { audiovisualEffects: [{ ...base.audiovisualEffects[0], volume: 2 }] },
      {
        audiovisualEffects: [
          base.audiovisualEffects[0],
          base.audiovisualEffects[0],
        ],
      },
    ])
      await assert.rejects(() =>
        entity.command("configurePresentation", {
          initiator: "gm",
          params: change,
          context: {},
        }),
      );
    assert.deepEqual(entity.serializePayload(), before);
  } finally {
    entity.dispose();
  }
  const malformed = LocationDefinition.deserializePayload({
    ...base,
    weather: { condition: 23 },
  });
  try {
    assert.ok(
      malformed.state.metadata.validity.issues.some((i) =>
        i.code.includes("presentation"),
      ),
    );
  } finally {
    malformed.dispose();
  }
});
test("author payload omission preserves configuration, null removes it and both map formats retain it", () => {
  const updated = LocationDefinition.authorPayload(
    "harbor",
    { name: "Harbor renamed", kind: "world" },
    base,
  );
  assert.deepEqual(updated.weather, base.weather);
  assert.deepEqual(updated.audiovisualEffects, base.audiovisualEffects);
  const cleared = LocationDefinition.authorPayload(
    "harbor",
    { name: "Harbor", kind: "world", weather: null, audiovisualEffects: null },
    updated,
  );
  assert.equal(cleared.weather, undefined);
  assert.equal(cleared.audiovisualEffects, undefined);
  assert.deepEqual(cleared.privateNotes, base.privateNotes);
});

test("unchanged opaque legacy presentation survives unrelated draft edits, but new malformed changes and publication remain invalid", () => {
  const legacy = {
    ...base,
    weather: { climate: "foggy" },
    audiovisualEffects: [{ legacyCue: "rain" }],
  };
  for (const input of [
    { name: "Renamed", kind: "world" },
    {
      name: "Renamed",
      kind: "world",
      weather: legacy.weather,
      audiovisualEffects: legacy.audiovisualEffects,
    },
  ]) {
    const next = LocationDefinition.authorPayload("harbor", input, legacy);
    assert.deepEqual(next.weather, legacy.weather);
    assert.deepEqual(next.audiovisualEffects, legacy.audiovisualEffects);
    const draft = LocationDefinition.deserializePayload(next, {
      mode: "draft",
      baseline: legacy,
    });
    const published = LocationDefinition.deserializePayload(next);
    assert.equal(
      draft.state.metadata.validity.issues.some((i) =>
        i.code.includes("presentation"),
      ),
      false,
    );
    assert.equal(
      published.state.metadata.validity.issues.some((i) =>
        i.code.includes("presentation"),
      ),
      true,
    );
    draft.dispose();
    published.dispose();
  }
  assert.throws(
    () =>
      LocationDefinition.authorPayload(
        "harbor",
        { name: "Harbor", kind: "world", weather: { climate: "changed" } },
        legacy,
      ),
    /condition/,
  );
});
