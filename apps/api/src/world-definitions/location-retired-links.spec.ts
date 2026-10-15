import { ConflictException } from "@nestjs/common";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";

const now = new Date("2026-10-11T00:00:00.000Z");
const location = (id: string, parent?: string) => ({
  resourceType: "locations",
  sourceId: id,
  payload: {
    identity: { id, version: { revision: 1, updatedAt: now.toISOString() } },
    name: id === "root" ? "World" : "Harbor",
    kind: parent ? "region" : "world",
    placement: parent
      ? { kind: "within-parent", parentLocationId: parent }
      : { kind: "root" },
    profile: { tags: [] },
    map: { kind: "image" },
    image: {
      assetId: "map-artwork",
      altText: "Coastal map",
      width: 1024,
      height: 768,
      mimeType: "image/png",
      orientation: "overhead",
    },
  },
});

function harness(
  records: { resourceType: string; sourceId: string; payload: unknown }[],
) {
  const draft = {
    id: "draft",
    worldDefinitionId: "world",
    revisionName: "First light",
    baseRevisionId: null,
    baseSnapshotId: null,
    baseSnapshot: null,
    storageRevision: 3,
    validationStatus: "NOT_VALIDATED",
    validatedStorageRevision: null,
    validationReport: null,
    createdAt: now,
    updatedAt: now,
    content: {
      rootLocationId: "root",
      locationIds: records
        .filter((record) => record.resourceType === "locations")
        .map((record) => record.sourceId),
      definitionIds: [],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: [],
      modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
    },
    snapshotRecords: records,
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const service = new WorldDefinitionAuthoringService(
    {
      worldDefinition: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "world", status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
    } as never,
    {} as never,
  );
  return { service, updateMany };
}
const expected = { expectedDraftId: "draft", expectedStorageRevision: 3 };

describe("Location deletion after travel-link retirement", () => {
  it.each(["connectedLocationIds", "adjacentLocationIds"])(
    "ignores retired %s references without erasing captured data",
    async (field) => {
      const root = location("root");
      const captured = {
        ...root,
        payload: { ...root.payload, [field]: ["leaf"] },
      };
      const { service, updateMany } = harness([
        captured,
        location("leaf", "root"),
      ]);
      await service.deleteAuthoredRecord(
        "world",
        "gm",
        "locations",
        "leaf",
        expected,
      );
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany.mock.calls[0][0].data.snapshotRecords).toEqual([
        captured,
      ]);
      expect(updateMany.mock.calls[0][0].data.content.locationIds).toEqual([
        "root",
      ]);
    },
  );

  it("ignores retained retired connection records when removing an unused leaf", async () => {
    const root = location("root");
    const connection = {
      resourceType: "location-connections",
      sourceId: "old-route",
      payload: { fromLocationId: "root", toLocationId: "leaf", kind: "road" },
    };
    const { service, updateMany } = harness([
      root,
      location("leaf", "root"),
      connection,
    ]);
    await service.deleteAuthoredRecord(
      "world",
      "gm",
      "locations",
      "leaf",
      expected,
    );
    expect(updateMany.mock.calls[0][0].data.snapshotRecords).toEqual([
      root,
      connection,
    ]);
  });

  it("still prevents deleting a Location that contains another Location", async () => {
    const { service, updateMany } = harness([
      location("root"),
      location("leaf", "root"),
      location("child", "leaf"),
    ]);
    await expect(
      service.deleteAuthoredRecord(
        "world",
        "gm",
        "locations",
        "leaf",
        expected,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
