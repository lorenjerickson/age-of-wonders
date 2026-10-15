import { describe, expect, it } from "vitest";
import {
  locationAncestry,
  locationClaims,
  locationGmNotes,
  locationMutationInput,
  locationParentOptions,
  locationMapForSave,
  LOCATION_SECTIONS,
} from "./locationWorkspaceModel";
import {
  contextualBreadcrumbs,
  contextualNavigationStack,
} from "./contextualNavigationModel";
import type { JsonValue, WorldDraftRecord } from "./api";
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
      map: { kind: "image" },
      mapScene: {
        notes: "Fog",
        orientation: "scenic",
        grid: { kind: "hex", cellSizePixels: 60 },
      },
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
      map: payload.map,
      mapSceneGrid: payload.mapScene.grid,
      mapOrientation: "scenic",
    });
  });
});

describe("Location map representation during orientation changes", () => {
  const terrain = {
    kind: "isometric",
    formatVersion: 1,
    dimensions: { x: 16, y: 16, z: 8 },
    cellSize: { value: 5, unit: "ft" },
    chunkSize: 16,
    materials: [],
    chunks: [],
  };
  const image = {
    assetId: "map",
    width: 1024,
    height: 768,
    mimeType: "image/png",
    altText: "A coast",
    orientation: "overhead",
  } as unknown as import("@aow/common").LocationImage;
  it.each(["scenic", "overhead", "side-on"] as const)(
    "replaces terrain with an image map for %s",
    (orientation) => {
      expect(locationMapForSave(terrain, image, orientation)).toEqual({
        kind: "image",
      });
      expect(() => locationMapForSave(terrain, undefined, orientation)).toThrow(
        "Choose a map image",
      );
    },
  );
  it("retains existing terrain only for isometric and rejects a fake terrain transition", () => {
    expect(locationMapForSave(terrain, undefined, "isometric")).toBe(terrain);
    expect(() =>
      locationMapForSave({ kind: "image" }, image, "isometric"),
    ).toThrow("Create a terrain map");
    expect(() => locationMapForSave(undefined, image, "isometric")).toThrow(
      "Create a terrain map",
    );
  });
});

describe("Location claim collection boundaries", () => {
  it("preserves identity, provenance, relationships and extensions", () => {
    const claims: JsonValue[] = [
      {
        id: "truth",
        kind: "truth",
        statement: "A gate",
        provenance: "Keeper",
        extensions: { private: true },
      },
      {
        id: "rumor",
        kind: "rumor",
        statement: "Another gate",
        relatedTruthClaimId: "truth",
        conflictsWithClaimIds: ["unknown"],
      },
    ];
    expect(
      locationClaims({
        ...record("location", "Harbor"),
        payload: { discoveries: claims },
      }),
    ).toEqual(claims);
  });
  it.each([
    null,
    {},
    "import",
    [
      { id: "same", kind: "truth", statement: "One" },
      { id: "same", kind: "truth", statement: "Two" },
    ],
    [{ id: "missing", kind: "custom", statement: "Preserved" }],
  ])("blocks malformed or ambiguous imported claims %j", (discoveries) => {
    expect(
      locationClaims({
        ...record("location", "Harbor"),
        payload: { discoveries },
      }),
    ).toBeUndefined();
  });
  it("allows adding to an omitted collection without inventing claims", () =>
    expect(locationClaims(record("location", "Harbor"))).toEqual([]));
});
