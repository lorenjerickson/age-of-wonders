import { NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldAuthoringController } from "./world-authoring.controller";

const request = {
  user: { id: "gm-1", displayName: "Game Master" },
} as Request & AuthenticatedRequest;

describe("WorldAuthoringController", () => {
  it("delegates nested manual creation with authenticated ownership", async () => {
    const authoring = {
      createLocation: jest.fn().mockResolvedValue({ storageRevision: 2 }),
      createCreature: jest.fn().mockResolvedValue({ storageRevision: 3 }),
      createItem: jest.fn().mockResolvedValue({ storageRevision: 4 }),
    };
    const subject = new WorldAuthoringController(
      {} as never,
      authoring as never,
      {} as never,
    );
    await subject.createLocation("world-1", request, {
      expectedStorageRevision: 1,
      name: "Harbor",
      kind: "settlement",
      parentLocationId: "root",
    });
    await subject.createCreature("world-1", request, {
      expectedStorageRevision: 2,
      name: "Keeper",
      attributes: {},
      equipmentSlots: [],
      instanceEmbodimentPolicy: { strategy: "one-per-instance" },
    });
    await subject.createItem("world-1", request, {
      expectedStorageRevision: 3,
      name: "Key",
      itemFamilyKey: "aow:item-family-tool",
      category: "tool",
      quality: "standard",
      compatibleEquipmentSlotSets: [],
      image: {
        assetId: "asset-1",
        altText: "A brass key",
        width: 512,
        height: 512,
        mimeType: "image/png",
      },
    });
    expect(authoring.createLocation).toHaveBeenCalledWith(
      "world-1",
      expect.any(Object),
      "gm-1",
    );
    expect(authoring.createCreature).toHaveBeenCalledWith(
      "world-1",
      expect.any(Object),
      "gm-1",
    );
    expect(authoring.createItem).toHaveBeenCalledWith(
      "world-1",
      expect.any(Object),
      "gm-1",
    );
  });

  it("routes an explicit legacy Creature upgrade through authenticated World scope", async () => {
    const authoring = {
      upgradeLegacyCreature: jest
        .fn()
        .mockResolvedValue({ storageRevision: 4 }),
    };
    const subject = new WorldAuthoringController(
      {} as never,
      authoring as never,
      {} as never,
    );
    const dto = {
      expectedStorageRevision: 3,
      name: "Bell Keeper",
      attributes: {},
      equipmentSlots: [],
      instanceEmbodimentPolicy: { strategy: "one-per-instance" },
    };

    await subject.upgradeLegacyCreature(
      "world-1",
      "legacy-creature",
      request,
      dto,
    );

    expect(authoring.upgradeLegacyCreature).toHaveBeenCalledWith(
      "world-1",
      "legacy-creature",
      dto,
      "gm-1",
    );
  });

  it("bounds the canonical World library and preserves its deterministic order", async () => {
    const worlds = {
      list: jest.fn().mockResolvedValue({
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
        total: 3,
      }),
      get: jest.fn(),
    };
    const subject = new WorldAuthoringController(
      worlds,
      {} as never,
      {} as never,
    );

    await expect(subject.list(request, "1", "1")).resolves.toEqual({
      items: [{ name: "B" }],
      total: 3,
      limit: 1,
      offset: 1,
    });
    expect(worlds.list).toHaveBeenCalledWith("gm-1");
  });

  it("scopes revision and library records through the selected World", async () => {
    const worlds = {
      list: jest.fn(),
      get: jest.fn().mockResolvedValue({ revisions: [{ id: "revision-1" }] }),
    };
    const authoring = {
      getDraft: jest.fn().mockResolvedValue({
        records: [
          {
            resourceType: "definitions",
            sourceId: "creature-1",
            payload: { kind: "creature", name: "Bell Keeper" },
          },
        ],
      }),
    };
    const subject = new WorldAuthoringController(
      worlds,
      authoring as never,
      {} as never,
    );

    await expect(
      subject.revision("world-1", "revision-1", request),
    ).resolves.toEqual({ id: "revision-1" });
    await expect(
      subject.creature("world-1", "creature-1", request),
    ).resolves.toEqual(expect.objectContaining({ sourceId: "creature-1" }));
    expect(worlds.get).toHaveBeenCalledWith("world-1", "gm-1");
    expect(authoring.getDraft).toHaveBeenCalledWith("world-1", "gm-1");
  });

  it("keeps runtime Item instances out of the Item Compendium and detail route", async () => {
    const itemDefinition = (id: string) => ({
      resourceType: "definitions",
      sourceId: id,
      payload: { kind: "item", identity: { name: `Definition ${id}` } },
    });
    const itemInstance = {
      resourceType: "items",
      sourceId: "instance-1",
      payload: { name: "A carried instance" },
    };
    const authoring = {
      getDraft: jest.fn().mockResolvedValue({
        records: [
          itemDefinition("definition-1"),
          itemInstance,
          itemDefinition("definition-2"),
        ],
      }),
    };
    const subject = new WorldAuthoringController(
      {} as never,
      authoring as never,
      {} as never,
    );

    await expect(subject.items("world-1", request)).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ sourceId: "definition-1" }),
        expect.objectContaining({ sourceId: "definition-2" }),
      ],
    });
    await expect(
      subject.item("world-1", "instance-1", request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns a neutral miss when a real child is not in the selected World", async () => {
    const worlds = {
      list: jest.fn(),
      get: jest
        .fn()
        .mockResolvedValue({ revisions: [{ id: "revision-other" }] }),
    };
    const subject = new WorldAuthoringController(
      worlds,
      {} as never,
      {} as never,
    );

    await expect(
      subject.revision("world-1", "revision-1", request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolves model adoption beneath the owning World", async () => {
    const modelRegistries = { effective: jest.fn().mockResolvedValue({}) };
    const subject = new WorldAuthoringController(
      {} as never,
      {} as never,
      modelRegistries as never,
    );

    await subject.modelAdoptions("world-1", request);

    expect(modelRegistries.effective).toHaveBeenCalledWith("world-1", "gm-1");
  });
});
