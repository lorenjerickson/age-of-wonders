import { expect, it } from "vitest";
import { locationWithMapScene } from "./worldMapModel";
import type { WorldDraftRecord } from "./api";

it("changes only map fields while preserving Location identity, hierarchy, profile, and richer scene data", () => {
  const record: WorldDraftRecord = {
    sourceId: "location",
    resourceType: "locations",
    sourceRevision: 4,
    payload: {
      identity: { name: "London" },
      placement: { parentLocationId: "england" },
      profile: { summary: "A bustling city", tags: ["city"] },
      mapScene: { notes: "Old notes", orientation: "scenic", weather: "fog" },
      extensions: { "custom:landmark": "Tower" },
    },
  };
  const updated = locationWithMapScene(
    record,
    "The Thames at night",
    "overhead",
  );
  expect(updated).toEqual({
    ...record,
    payload: {
      ...(record.payload as object),
      mapScene: {
        notes: "The Thames at night",
        orientation: "overhead",
        weather: "fog",
      },
    },
  });
  expect(JSON.stringify(record)).toContain("Old notes");
  const cleared = locationWithMapScene(updated, "", "");
  expect((cleared.payload as Record<string, unknown>).mapScene).toEqual({
    notes: "",
    weather: "fog",
  });
});
