import { LocationDefinition } from "@aow/domain";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpsertWorldLocationDraftDto } from "./dto/world-definition-authoring.dto";
import {
  canonicalWorldRecordIssue,
  worldLocationPayload,
} from "./world-authored-record";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";

const image = {
  assetId: "map-artwork",
  altText: "A harbor and its islands",
  width: 1024,
  height: 768,
  mimeType: "image/png",
  orientation: "overhead",
};
const mapless = {
  identity: {
    id: "harbor",
    version: { revision: 1, updatedAt: "2026-10-11T00:00:00.000Z" },
  },
  name: "Harbor",
  kind: "world",
  placement: { kind: "root" },
  profile: { tags: [] },
};
const content = {
  rootLocationId: "harbor",
  locationIds: ["harbor"],
  definitionIds: [],
  schemaDefinitionIds: [],
  worldPlacementDefinitionIds: [],
  modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
};
const emptyTerrain = {
  kind: "isometric" as const,
  formatVersion: 1 as const,
  dimensions: { x: 16, y: 16, z: 8 },
  cellSize: { value: 5 as const, unit: "ft" as const },
  chunkSize: 16 as const,
  materials: [
    {
      key: "terrain:grass" as const,
      revision: 1,
      name: "Grass",
      terrainType: "terrain:grass" as const,
    },
  ],
  chunks: [],
};

const publication = (payload: unknown) =>
  validateWorldDefinitionDraft(content, [
    { resourceType: "locations", sourceId: "harbor", payload },
  ]);

describe("Location entity migration compatibility", () => {
  it("keeps legacy mapless drafts readable while exposing blocking validity", () => {
    const entity = LocationDefinition.deserializePayload(mapless);
    try {
      expect(entity.serializePayload()).toEqual(mapless);
      expect(entity.state.metadata.validity.status).toBe("invalid");
      expect(entity.state.metadata.validity.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "location-canonical-map-required" }),
        ]),
      );
      expect(
        canonicalWorldRecordIssue("locations", "harbor", mapless),
      ).toContain("requires an image map or an isometric terrain map");
    } finally {
      entity.dispose();
    }
  });

  it("blocks publication of a mapless Location and an empty image-map marker", () => {
    for (const payload of [mapless, { ...mapless, map: { kind: "image" } }]) {
      const report = publication(payload);
      expect(report.valid).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "location-definition-invalid" }),
        ]),
      );
    }
  });

  it.each([
    { ...mapless, map: { kind: "image" }, image },
    { ...mapless, map: emptyTerrain },
  ])(
    "accepts image content and explicitly authored empty terrain",
    (payload) => {
      expect(
        canonicalWorldRecordIssue("locations", "harbor", payload),
      ).toBeUndefined();
      expect(publication(payload)).toEqual({ valid: true, issues: [] });
    },
  );

  it("retains saved grids through scenic presentation and explicitly clears them", () => {
    const grid = { kind: "hex" as const, cellSizePixels: 48 };
    const initial = worldLocationPayload("harbor", {
      name: "Harbor",
      kind: "world",
      image,
      mapOrientation: "overhead",
      mapSceneGrid: grid,
    });
    const scenic = worldLocationPayload(
      "harbor",
      { name: "Harbor", kind: "world", mapOrientation: "scenic" },
      initial,
    );
    const entity = LocationDefinition.deserializePayload(scenic);
    try {
      expect(scenic.mapScene?.grid).toEqual(grid);
      expect(entity.effectiveSceneGrid()).toBeUndefined();
      expect(
        canonicalWorldRecordIssue("locations", "harbor", scenic),
      ).toBeUndefined();
    } finally {
      entity.dispose();
    }
    const restored = worldLocationPayload(
      "harbor",
      { name: "Harbor", kind: "world", mapOrientation: "overhead" },
      scenic,
    );
    const restoredEntity = LocationDefinition.deserializePayload(restored);
    try {
      expect(restoredEntity.effectiveSceneGrid()).toEqual(grid);
    } finally {
      restoredEntity.dispose();
    }
    const cleared = worldLocationPayload(
      "harbor",
      { name: "Harbor", kind: "world", mapSceneGrid: null },
      restored,
    );
    expect(cleared.mapScene?.grid).toBeUndefined();
  });

  it("rejects malformed grids through the canonical boundary", () => {
    for (const grid of [
      { kind: "triangle", cellSizePixels: 20 },
      { kind: "square", cellSizePixels: 0 },
      { kind: "hex", cellSizePixels: -10 },
    ]) {
      expect(
        canonicalWorldRecordIssue("locations", "harbor", {
          ...mapless,
          image,
          map: { kind: "image" },
          mapScene: { orientation: "scenic", grid },
        }),
      ).toContain("positive pixel cell size");
    }
  });

  it("strips retired adjacency request fields without stripping the retained grid", async () => {
    const dto = plainToInstance(UpsertWorldLocationDraftDto, {
      expectedStorageRevision: 1,
      name: "Harbor",
      kind: "world",
      connectedLocationIds: ["neighbor"],
      adjacentLocationIds: ["neighbor"],
      image,
      mapSceneGrid: { kind: "square", cellSizePixels: 64 },
    });
    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto).not.toHaveProperty("connectedLocationIds");
    expect(dto).not.toHaveProperty("adjacentLocationIds");
    expect(dto.mapSceneGrid).toEqual({ kind: "square", cellSizePixels: 64 });
  });

  it("preserves private fields and unknown extensions through edits and codecs", () => {
    const previous = {
      ...mapless,
      image,
      map: { kind: "image" },
      gmDescription: "The harbor master is a spy.",
      discoveries: [
        { id: "secret", kind: "truth", statement: "A hidden vault." },
      ],
      privateLedger: { keeper: "GM" },
      extensions: { "test:location": { unrevealed: true } },
      connectedLocationIds: ["retired-link"],
    };
    const edited = worldLocationPayload(
      "harbor",
      { name: "New Harbor", kind: "world" },
      previous,
    );
    expect(edited).toMatchObject({
      gmDescription: previous.gmDescription,
      discoveries: previous.discoveries,
      privateLedger: previous.privateLedger,
      extensions: previous.extensions,
    });
    expect(edited).not.toHaveProperty("connectedLocationIds");
    const entity = LocationDefinition.deserializePayload(edited);
    const restored = LocationDefinition.deserialize(entity.serialize());
    try {
      expect(restored.serializePayload()).toEqual(edited);
    } finally {
      entity.dispose();
      restored.dispose();
    }
  });
});
