import { describe, it, expect } from "vitest";
import {
  presentationFields,
  presentationField,
  presentationEntries,
} from "./locationPresentationModel";
import { locationMutationInput } from "./locationWorkspaceModel";
import type { WorldDraftRecord } from "./api";
describe("Location presentation authoring", () => {
  it("distinguishes untouched, explicit empty, and removal requests", () => {
    expect(presentationFields(undefined, undefined)).toEqual({});
    expect(presentationFields(null, [])).toEqual({
      weather: null,
      audiovisualEffects: [],
    });
    expect(presentationFields(undefined, null)).toEqual({
      audiovisualEffects: null,
    });
  });
  it("preserves private owner and nested wind fields during focused changes", () => {
    const wind = {
      speedKph: 8,
      directionDegrees: 40,
      privateWind: { retained: true },
    };
    const original = {
      condition: "Fog",
      wind,
      privateWeather: { retained: true },
    };
    const changed = presentationField(
      original,
      "wind",
      presentationField(wind, "directionDegrees", undefined),
    );
    expect(changed).toEqual({
      ...original,
      wind: { speedKph: 8, privateWind: { retained: true } },
    });
    expect(original.wind.directionDegrees).toBe(40);
  });
  it("blocks malformed and duplicate effect identities without coercing them", () => {
    expect(presentationEntries({})).toBeUndefined();
    expect(
      presentationEntries([
        { id: "same", kind: "audio" },
        { id: "same", kind: "visual" },
      ]),
    ).toBeUndefined();
    expect(
      presentationEntries([{ id: "a", kind: "advanced" }]),
    ).toBeUndefined();
    const imported = [{ id: "a", kind: "audio", private: { retained: true } }];
    expect(presentationEntries(imported)).toBe(imported);
  });
  it("carries presentation fields through the canonical Location save adapter", () => {
    const base: WorldDraftRecord = {
      sourceId: "location",
      resourceType: "locations",
      payload: { name: "Harbor", kind: "region" },
    };
    expect(locationMutationInput(base, 2)).not.toHaveProperty("weather");
    const payload = {
      weather: { condition: "Rain", private: { kept: true } },
      audiovisualEffects: [
        {
          id: "effect",
          kind: "audio",
          name: "Rainfall",
          assetId: "asset",
          enabled: true,
          loop: true,
          volume: 0.5,
          private: { kept: true },
        },
      ],
    };
    const saved = locationMutationInput(
      { ...base, payload: { ...(base.payload as object), ...payload } },
      2,
    );
    expect(saved.weather).toEqual(payload.weather);
    expect(saved.audiovisualEffects).toEqual(payload.audiovisualEffects);
    expect(
      locationMutationInput(
        {
          ...base,
          payload: {
            ...(base.payload as object),
            weather: null,
            audiovisualEffects: null,
          },
        },
        2,
      ),
    ).toMatchObject({ weather: null, audiovisualEffects: null });
  });
});

it("omits unchanged legacy presentation while retaining explicit replacements and removals", () => {
  const baseline = {
    weather: { climate: "foggy", private: { retained: true } },
    audiovisualEffects: "legacy presentation",
  };
  expect(
    presentationFields(baseline.weather, baseline.audiovisualEffects, baseline),
  ).toEqual({});
  expect(
    presentationFields(null, baseline.audiovisualEffects, baseline),
  ).toEqual({ weather: null });
  expect(presentationFields(baseline.weather, [], baseline)).toEqual({
    audiovisualEffects: [],
  });
  const record: WorldDraftRecord = {
    sourceId: "location",
    resourceType: "locations",
    payload: { name: "Harbor", ...baseline },
  };
  expect(
    locationMutationInput(
      {
        ...record,
        payload: { ...(record.payload as object), name: "Updated harbor" },
      },
      2,
      record,
    ),
  ).not.toHaveProperty("weather");
  expect(locationMutationInput(record, 2, record)).not.toHaveProperty(
    "audiovisualEffects",
  );
  expect(
    locationMutationInput(
      {
        ...record,
        payload: {
          ...(record.payload as object),
          weather: null,
          audiovisualEffects: null,
        },
      },
      2,
      record,
    ),
  ).toMatchObject({ weather: null, audiovisualEffects: null });
  const malformed: WorldDraftRecord = {
    ...record,
    payload: {
      name: "Harbor",
      weather: 42,
      audiovisualEffects: { legacy: true },
    },
  };
  expect(locationMutationInput(malformed, 2, malformed)).not.toHaveProperty(
    "weather",
  );
  expect(locationMutationInput(malformed, 2, malformed)).not.toHaveProperty(
    "audiovisualEffects",
  );
});
