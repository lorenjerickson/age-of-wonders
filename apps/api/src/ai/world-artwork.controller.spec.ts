import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  WorldArtworkController,
  GenerateWorldArtworkDto,
} from "./world-artwork.controller";
import { PaidAiRequestGate } from "./paid-ai-request-gate";

const dto: GenerateWorldArtworkDto = {
  expectedStorageRevision: 2,
  role: "overheadToken",
  name: "Keeper",
  description: "A cloaked watchkeeper",
  direction: "Dark blue wool",
};
const request = { user: { id: "gm" }, ip: "local" } as Request &
  AuthenticatedRequest;
function setup() {
  const getActiveDraft = jest.fn().mockResolvedValue({ storageRevision: 2 });
  const generateImage = jest
    .fn()
    .mockResolvedValue({
      buffer: Buffer.from("image"),
      mimeType: "image/webp",
      width: 1024,
      height: 1024,
      responseId: "response",
    });
  const upload = jest.fn().mockResolvedValue({ key: "upload" });
  const createForWorld = jest.fn().mockResolvedValue({ id: "asset" });
  const record = jest.fn().mockResolvedValue({ id: "audit" });
  return {
    getActiveDraft,
    generateImage,
    createForWorld,
    record,
    controller: new WorldArtworkController(
      { getActiveDraft } as never,
      { generateImage } as never,
      { upload } as never,
      { createForWorld } as never,
      new PaidAiRequestGate(),
      { record } as never,
    ),
  };
}
it("generates exactly one strictly overhead image, owns it, and reuses paid retries", async () => {
  const s = setup();
  const result = await s.controller.generate(
    "world",
    request,
    "artwork-test-1",
    dto,
  );
  expect(
    await s.controller.generate("world", request, "artwork-test-1", dto),
  ).toEqual(result);
  expect(s.generateImage).toHaveBeenCalledTimes(1);
  expect(s.generateImage).toHaveBeenCalledWith(
    expect.stringMatching(/90 degrees.*zero tilt/),
    expect.objectContaining({ size: "1024x1024", background: "transparent" }),
  );
  expect(s.createForWorld).toHaveBeenCalledWith(
    "world",
    "gm",
    expect.anything(),
    expect.anything(),
  );
  expect(result.image).toMatchObject({
    assetId: "asset",
    altText: "Overhead token of Keeper",
  });
  expect(s.record).toHaveBeenCalledTimes(1);
});
it.each(["portrait", "paperDollToken", "item"] as const)(
  "supports independent %s previews",
  async (role) => {
    const s = setup();
    await s.controller.generate("world", request, `artwork-${role}`, {
      ...dto,
      role,
    });
    expect(s.generateImage).toHaveBeenCalledTimes(1);
    expect(s.generateImage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        size: role === "portrait" ? "1024x1536" : "1024x1024",
      }),
    );
  },
);
it("rejects stale and inaccessible Worlds before paid generation", async () => {
  const s = setup();
  s.getActiveDraft.mockResolvedValue({ storageRevision: 3 });
  await expect(
    s.controller.generate("world", request, "artwork-stale", dto),
  ).rejects.toBeInstanceOf(ConflictException);
  s.getActiveDraft.mockRejectedValue(new NotFoundException());
  await expect(
    s.controller.generate("foreign", request, "artwork-foreign", dto),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(s.generateImage).not.toHaveBeenCalled();
});
