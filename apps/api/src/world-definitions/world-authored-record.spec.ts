import {
  canonicalWorldRecordIssue,
  worldCreaturePayload,
  worldItemPayload,
  worldLocationPayload,
} from "./world-authored-record";

const conformance = {
  conceptId: "concept" as never,
  modelSchemaReleaseIds: ["release"] as never,
};

describe("canonical World authored records", () => {
  it("recovers archived legacy artwork when saving an already upgraded Creature", () => {
    const image = (assetId: string) => ({ assetId, altText: "Elyena", width: 1024, height: 1024, mimeType: "image/webp" });
    const originalImages = { portrait: image("portrait"), overheadToken: image("overhead"), paperDollToken: image("side") };
    const prior = { components: { art: {} }, extensions: { "aow:legacy-creature": { payload: { images: originalImages } } } };
    const input = { name: "Elyena", attributes: {}, equipmentSlots: [], instanceEmbodimentPolicy: { strategy: "one-per-instance" } };
    const recovered = worldCreaturePayload("creature", input, conformance, prior);
    expect(recovered.components.art.images).toEqual(originalImages);
    expect(recovered.extensions).toEqual(prior.extensions);
    expect(canonicalWorldRecordIssue("definitions", "creature", recovered)).toBeUndefined();
    const replaced = worldCreaturePayload("creature", { ...input, images: { overheadToken: image("new") } }, conformance, recovered);
    expect(replaced.components.art.images).toEqual({ ...originalImages, overheadToken: image("new") });
  });

  it("replaces one Creature artwork view while preserving other views and art metadata", () => {
    const image = (assetId: string) => ({ assetId, altText: "Keeper", width: 1024, height: 1024, mimeType: "image/webp" });
    const prior = { components: { art: { direction: "Blue wool", custom: "keep", images: { portrait: image("portrait"), overheadToken: image("old"), paperDollToken: image("side") } } } };
    const updated = worldCreaturePayload("keeper", { name: "Keeper", attributes: {}, equipmentSlots: [], instanceEmbodimentPolicy: { strategy: "one-per-instance" }, artDirection: "Blue wool", images: { overheadToken: image("new") } }, conformance, prior);
    expect(updated.components.art).toMatchObject({ custom: "keep", images: { portrait: image("portrait"), overheadToken: image("new"), paperDollToken: image("side") } });
    expect(canonicalWorldRecordIssue("definitions", "keeper", updated)).toBeUndefined();
  });

  it("preserves legacy Creature artwork on upgrade and canonical artwork on later edits", () => {
    const images = Object.fromEntries(
      ["portrait", "overheadToken", "paperDollToken"].map((view) => [view, {
        assetId: `asset-${view}`, altText: view, width: 512, height: 512, mimeType: "image/png",
      }]),
    );
    const input = { name: "Bell Keeper", attributes: {}, equipmentSlots: [], instanceEmbodimentPolicy: { strategy: "one-per-instance" } };
    const upgraded = worldCreaturePayload("creature-1", input, conformance, { images });
    expect(upgraded.components.art.images).toEqual(images);
    expect(canonicalWorldRecordIssue("definitions", "creature-1", upgraded)).toBeUndefined();
    const edited = worldCreaturePayload("creature-1", { ...input, name: "New name" }, conformance, upgraded);
    expect(edited.components.art.images).toEqual(images);
  });

  it("creates and revises a server-owned Location identity", () => {
    const created = worldLocationPayload("location-1", {
      name: "Glass Harbor",
      kind: "settlement",
      parentLocationId: "world-root",
      image: {
        assetId: "harbor-map", altText: "Harbor map", width: 1024, height: 768,
        mimeType: "image/png", orientation: "overhead",
      },
    });
    const revised = worldLocationPayload(
      "location-1",
      { name: "Glass Harbor", kind: "site", parentLocationId: "world-root" },
      created,
    );
    expect(created.identity.version.revision).toBe(1);
    expect(revised.identity.version.revision).toBe(2);
    expect(
      canonicalWorldRecordIssue("locations", "location-1", revised),
    ).toBeUndefined();
  });

  it("builds complete canonical Creature and Item source definitions", () => {
    const creature = worldCreaturePayload(
      "creature-1",
      {
        name: "Bell Keeper",
        attributes: { "aow:attribute-wisdom": 60 },
        equipmentSlots: ["aow:equipment-slot-hands"],
        instanceEmbodimentPolicy: { strategy: "one-per-instance" },
      },
      conformance,
    );
    const item = worldItemPayload(
      "item-1",
      {
        name: "Bell Key",
        itemFamilyKey: "aow:item-family-tool",
        category: "tool",
        quality: "standard",
        compatibleEquipmentSlotSets: [["aow:equipment-slot-belt"]],
        image: {
          assetId: "asset-1",
          altText: "An iron bell key",
          width: 512,
          height: 512,
          mimeType: "image/png",
        },
      },
      conformance,
    );
    expect(
      canonicalWorldRecordIssue("definitions", "creature-1", creature),
    ).toBeUndefined();
    expect(creature.identity.name).toBe("Bell Keeper");
    expect(creature.components.attributes).toEqual({
      "aow:attribute-wisdom": 60,
    });
    expect(item.identity.name).toBe("Bell Key");
    expect(item.components.category).toBe("tool");
    expect(
      canonicalWorldRecordIssue("definitions", "item-1", item),
    ).toBeUndefined();
  });

  it("rejects an incomplete canonical Item instead of persisting a parallel draft shape", () => {
    const incomplete = worldItemPayload(
      "item-1",
      {
        name: "Bell Key",
        itemFamilyKey: "aow:item-family-tool",
        category: "tool",
        quality: "standard",
        compatibleEquipmentSlotSets: [],
        image: {
          assetId: "asset-1",
          altText: "",
          width: 512,
          height: 512,
          mimeType: "image/png",
        },
      },
      conformance,
    );

    expect(
      canonicalWorldRecordIssue("definitions", "item-1", incomplete),
    ).toContain("image");
  });

  it("preserves unedited Location details and canonical Item mechanics", () => {
    const legacyItemPayload = {
      name: "Old Tower Shield",
      category: "armor",
      customLore: { maker: "Sable Guild" },
      components: {
        category: "armor",
        quality: "standard",
        weight: { value: 12, unit: "pound" },
        cost: { value: 50, currency: "credit" },
        armor: { defense: { count: 1, sides: 8 } },
      },
    };
    const location = worldLocationPayload(
      "location-1",
      {
        name: "Glass Harbor",
        kind: "settlement",
        parentLocationId: "world-root",
        profileTags: ["harbor"],
      },
      {
        identity: {
          id: "location-1",
          version: { revision: 4, updatedAt: "then" },
        },
        name: "Old Harbor",
        kind: "settlement",
        weather: { climate: "foggy" },
        placement: {
          kind: "within-parent",
          parentLocationId: "world-root",
          mapPosition: { x: 0.2, y: 0.7 },
        },
      },
    );
    expect((location as unknown as Record<string, unknown>).weather).toEqual({
      climate: "foggy",
    });
    expect(location.placement).toMatchObject({
      mapPosition: { x: 0.2, y: 0.7 },
    });

    const item = worldItemPayload(
      "item-1",
      {
        name: "Tower Shield",
        itemFamilyKey: "aow:item-family-armor",
        category: "armor",
        quality: "fine",
        compatibleEquipmentSlotSets: [
          ["aow:equipment-slot-main-hand", "aow:equipment-slot-off-hand"],
          ["aow:equipment-slot-back"],
        ],
        image: {
          assetId: "asset-1",
          altText: "A tower shield",
          width: 512,
          height: 512,
          mimeType: "image/png",
        },
      },
      conformance,
      legacyItemPayload,
    );
    expect(item.components).toMatchObject({
      weight: { value: 12, unit: "pound" },
      cost: { value: 50, currency: "credit" },
      armor: { defense: { count: 1, sides: 8 } },
      equippable: {
        compatibleSlotSets: [
          ["aow:equipment-slot-main-hand", "aow:equipment-slot-off-hand"],
          ["aow:equipment-slot-back"],
        ],
      },
    });
    expect(item.extensions?.["aow:legacy-item"]).toEqual(legacyItemPayload);
  });
});

it("rejects malformed or duplicate discovery claims and preserves richer map fields", () => {
  const initial = worldLocationPayload("location", {
    name: "London",
    kind: "settlement",
    parentLocationId: "root",
  });
  const next = worldLocationPayload(
    "location",
    {
      name: "London",
      kind: "settlement",
      parentLocationId: "root",
      gmDescription: "Secrets",
      discoveries: [{ id: "truth", kind: "truth", statement: "A secret" }],
    },
    {
      ...initial,
      image: {
        assetId: "map",
        altText: "Map",
        width: 1024,
        height: 512,
        mimeType: "image/png",
        orientation: "overhead",
      },
      walls: [{ id: "wall", vertices: [] }],
    },
  );
  expect(next.image?.assetId).toBe("map");
  expect((next as unknown as Record<string, unknown>).walls).toEqual([
    { id: "wall", vertices: [] },
  ]);
  expect(
    canonicalWorldRecordIssue("locations", "location", next),
  ).toBeUndefined();
  expect(
    canonicalWorldRecordIssue("locations", "location", {
      ...next,
      discoveries: [{ id: "x", kind: "rumor", statement: "" }],
    }),
  ).toContain("statement");
  expect(
    canonicalWorldRecordIssue("locations", "location", {
      ...next,
      discoveries: [next.discoveries![0], next.discoveries![0]],
    }),
  ).toContain("own identity");
});

it.each([undefined, "overhead", "side-on", "isometric"])(
  "saves discoveries with existing artwork missing orientation (scene: %s)",
  (orientation) => {
    const image = {
      assetId: "existing-artwork", altText: "Village beneath a castle",
      width: 1536, height: 1024, mimeType: "image/webp",
      focalPoint: { x: 0.52, y: 0.63, kind: "normalized-map" },
    };
    const previous = {
      ...worldLocationPayload("location", { name: "Village", kind: "settlement" }),
      image, mapScene: { orientation },
    };
    const discoveries = [{ id: "new-discovery", kind: "truth" as const, statement: "The castle is inhabited." }];
    for (const submittedImage of [undefined, image]) {
      const saved = worldLocationPayload("location", {
        name: "Village", kind: "settlement", image: submittedImage, discoveries,
      }, previous);
      expect(saved.discoveries).toEqual(discoveries);
      expect(saved.image).toEqual({ ...image, orientation: orientation === "overhead" || orientation === "side-on" ? orientation : "scenic" });
      expect(canonicalWorldRecordIssue("locations", "location", saved)).toBeUndefined();
    }
    const newImage = worldLocationPayload("location", {
      name: "Village", kind: "settlement", image: { ...image, assetId: "replacement" }, discoveries,
    }, previous);
    expect(canonicalWorldRecordIssue("locations", "location", newImage)).toContain("orientation");
  },
);
