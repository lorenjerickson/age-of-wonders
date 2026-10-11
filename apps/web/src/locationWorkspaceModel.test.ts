import { describe, expect, it } from "vitest";
import {
  locationAncestry,
  locationGmNotes,
  locationMutationInput,
  locationParentOptions,
  LOCATION_SECTIONS,
} from "./locationWorkspaceModel";
import {
  contextualBreadcrumbs,
  contextualNavigationStack,
} from "./contextualNavigationModel";
import type { WorldDraftRecord } from "./api";
const record = (
  id: string,
  name: string,
  parent?: string,
): WorldDraftRecord => ({
  sourceId: id,
  resourceType: "locations",
  payload: {
    name,
    kind: "region",
    placement: parent
      ? { kind: "within-parent", parentLocationId: parent }
      : { kind: "root" },
    profile: { tags: [] },
  },
});
const records = [
  record("city", "London", "country"),
  record("root", "Earth"),
  record("country", "Britain", "root"),
  record("site", "Baker Street", "city"),
];
describe("Location workspace", () => {
  it("uses containment ancestry, independent of record order and selected section", () => {
    expect(locationAncestry(records, "site").map((r) => r.sourceId)).toEqual([
      "root",
      "country",
      "city",
      "site",
    ]);
    for (const section of LOCATION_SECTIONS) {
      const path = `/worlds/world/atlas/locations/site/${section.toLowerCase()}`;
      const stack = contextualNavigationStack(path, {
        worldName: "Victorian World",
        records,
      });
      expect(contextualBreadcrumbs(path, stack).map((r) => r.label)).toEqual([
        "GM Workspace",
        "Worlds",
        "Victorian World",
        "Earth",
        "Britain",
        "London",
        "Baker Street",
      ]);
      expect(stack.at(-1)?.links).toEqual([]);
      expect(stack.at(-2)?.label).toBe("London");
    }
  });
  it("recomputes ancestry after reparenting and excludes descendant parent choices", () => {
    const moved = records.map((r) =>
      r.sourceId === "site" ? record("site", "Baker Street", "root") : r,
    );
    expect(locationAncestry(moved, "site").map((r) => r.sourceId)).toEqual([
      "root",
      "site",
    ]);
    expect(locationParentOptions(records, "city").map((r) => r.id)).toEqual([
      "root",
      "country",
    ]);
    expect(
      locationAncestry([record("a", "A", "b"), record("b", "B", "a")], "a"),
    ).toHaveLength(2);
    expect(locationAncestry(records, "missing")).toEqual([]);
  });
  it("retains legacy GM secrets until a canonical description is authored", () => {
    const legacy = {
      ...records[0],
      payload: {
        extensions: {
          "aow:gm-secrets": { secrets: ["Hidden tunnel", "False wall"] },
        },
      },
    };
    expect(locationGmNotes(legacy)).toBe("Hidden tunnel\n\nFalse wall");
    expect(
      locationGmNotes({
        ...legacy,
        payload: { ...legacy.payload, gmDescription: "" },
      }),
    ).toBe("");
  });
  it("builds a dedicated Location mutation preserving image and other sections", () => {
    const payload = {
      ...(records[0].payload as object),
      description: "Public",
      gmDescription: "Secret",
      discoveries: [
        { id: "claim", kind: "truth", statement: "A hidden passage" },
      ],
      image: {
        assetId: "map",
        width: 1024,
        height: 512,
        altText: "London map",
        mimeType: "image/webp",
        orientation: "overhead",
      },
      mapScene: { notes: "Fog", orientation: "overhead" },
    };
    const mutation = locationMutationInput({ ...records[0], payload }, 8);
    expect(mutation).toMatchObject({
      expectedStorageRevision: 8,
      name: "London",
      parentLocationId: "country",
      gmDescription: "Secret",
      image: payload.image,
      discoveries: payload.discoveries,
      mapSceneNotes: "Fog",
    });
  });
});
