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
  it("creates and revises a server-owned Location identity", () => {
    const created = worldLocationPayload("location-1", {
      name: "Glass Harbor",
      kind: "settlement",
      parentLocationId: "world-root",
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
