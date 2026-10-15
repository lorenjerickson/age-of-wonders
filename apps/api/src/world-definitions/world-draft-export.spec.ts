import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { WorldAuthoringController } from "./world-authoring.controller";
import { WorldAccessGuard } from "./world-access.guard";
import { GUARDS_METADATA } from "@nestjs/common/constants";

const records = [
  { resourceType: "locations", sourceId: "place", payload: { name: "Harbor" } },
  {
    resourceType: "location-terrain-chunks",
    sourceId: "chunk-hash",
    payload: { cells: [1, 2, 3] },
  },
  {
    resourceType: "world-character-templates",
    sourceId: "npc",
    payload: { name: "Keeper" },
  },
  {
    resourceType: "world-conditions",
    sourceId: "condition",
    payload: { name: "Alert" },
  },
  {
    resourceType: "world-effects",
    sourceId: "effect",
    payload: { name: "Keen eyes" },
  },
];

function fixture(found = true) {
  const findUnique = jest.fn().mockResolvedValue(
    found
      ? {
          id: "world",
          status: "ACTIVE",
          draft: {
            revisionName: "Harbor at dusk",
            storageRevision: 4,
            content: { name: "The Coast" },
            snapshotRecords: records,
            updatedByUserId: "private-user",
            validationReport: { private: true },
          },
        }
      : null,
  );
  const service = new WorldDefinitionAuthoringService(
    { worldDefinition: { findUnique } } as never,
    {} as never,
  );
  return { service, findUnique };
}

describe("complete World draft export", () => {
  it("retains terrain and all Codex records while excluding editor and identity metadata", async () => {
    const { service } = fixture();
    const result = await service.exportDraft("world", "viewer");
    expect(result).toEqual({
      revisionName: "Harbor at dusk",
      storageRevision: 4,
      content: { name: "The Coast" },
      records,
    });
    expect(JSON.stringify(result)).not.toContain("private-user");
    expect(result).not.toHaveProperty("validationReport");
  });

  it("authorizes a read against the specific world and active shared identity", async () => {
    const { service, findUnique } = fixture();
    await service.exportDraft("world", "viewer");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: "world",
          OR: [
            { ownerUserId: "viewer" },
            {
              accessEntries: {
                some: { player: { userId: "viewer", standing: "ACTIVE" } },
              },
            },
          ],
        }),
      }),
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, WorldAuthoringController),
    ).toContain(WorldAccessGuard);
  });

  it("does not export an unavailable or unauthorized draft", async () => {
    const { service } = fixture(false);
    await expect(
      service.exportDraft("unshared-world", "viewer"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
