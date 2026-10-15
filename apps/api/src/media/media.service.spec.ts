import { worldAccessWhere } from "../world-definitions/world-access";
import { NotFoundException } from "@nestjs/common";
import { MediaService } from "./media.service";

const upload = {
  id: "asset-1",
  bucket: "media",
  objectKey: "maps/asset-1.png",
  filename: "asset-1.png",
  originalName: "map.png",
  mimeType: "image/png",
  mediaType: "images" as const,
  purpose: "maps",
  size: 120,
};

describe("MediaService provenance", () => {
  it("records creator and World scope after validating ownership", async () => {
    const prisma = {
      worldDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: "world-1" }),
      },
      mediaAsset: { create: jest.fn(({ data }) => Promise.resolve(data)) },
    };
    const storage = { delete: jest.fn() };
    const service = new MediaService(prisma as never, storage as never);

    await service.createForWorld("world-1", "gm-1", upload, ["map"]);

    expect(prisma.worldDefinition.findFirst).toHaveBeenCalledWith({
      where: {
        id: "world-1",
        status: "ACTIVE",
        ...worldAccessWhere("gm-1", true),
      },
      select: { id: true },
    });
    const createCalls = prisma.mediaAsset.create.mock.calls as unknown as Array<
      [
        {
          data: {
            createdByUserId: string;
            scopeType: string;
            scopeId: string;
          };
        },
      ]
    >;
    expect(createCalls[0]?.[0].data).toMatchObject({
      createdByUserId: "gm-1",
      scopeType: "world-definition",
      scopeId: "world-1",
    });
  });

  it("removes the uploaded object when the World scope is unavailable", async () => {
    const prisma = {
      worldDefinition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };
    const service = new MediaService(prisma as never, storage as never);

    await expect(
      service.createForWorld("world-1", "gm-1", upload, []),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.delete).toHaveBeenCalledWith(upload.objectKey);
  });
});

describe("shared World artwork", () => {
  it("authorizes a viewer download through the asset's World without granting deletion", async () => {
    const asset = {
      ...upload,
      scopeType: "world-definition",
      scopeId: "world",
    };
    const prisma = {
      mediaAsset: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(asset)
          .mockResolvedValue(null),
        delete: jest.fn(),
      },
      worldDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: "world" }),
      },
    };
    const storage = {
      signedDownloadUrl: jest.fn().mockResolvedValue("signed-url"),
      delete: jest.fn(),
    };
    const service = new MediaService(prisma as never, storage as never);
    await expect(service.download("asset-1", "viewer")).resolves.toEqual({
      url: "signed-url",
      expiresIn: 900,
    });
    expect(prisma.worldDefinition.findFirst).toHaveBeenCalledWith({
      where: { id: "world", ...worldAccessWhere("viewer") },
      select: { id: true },
    });
    await expect(service.remove("asset-1", "viewer")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("rejects a download after World membership has been revoked", async () => {
    const prisma = {
      mediaAsset: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...upload, scopeId: "world" }),
      },
      worldDefinition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MediaService(prisma as never, {} as never);
    await expect(
      service.download("asset-1", "former-member"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
