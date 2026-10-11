import { ConflictException, NotFoundException } from "@nestjs/common";
import { PaidAiRequestGate } from "../ai/paid-ai-request-gate";
import { CampaignCharacterArtworkController } from "./campaign-character-artwork.controller";

function harness() {
  const prisma = {
    campaignInstance: {
      findFirst: jest.fn().mockResolvedValue({ id: "instance" }),
    },
  };
  const drafts = {
    get: jest.fn().mockResolvedValue({
      revision: 1,
      status: "in-progress",
      name: "Vex",
      biography: "An investigator",
    }),
  };
  const provider = {
    generateImage: jest.fn().mockResolvedValue({
      buffer: Buffer.from("mock image"),
      mimeType: "image/webp",
      responseId: "response",
    }),
  };
  const storage = { upload: jest.fn().mockResolvedValue({ id: "upload" }) };
  const media = { create: jest.fn().mockResolvedValue({ id: "portrait" }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const controller = new CampaignCharacterArtworkController(
    prisma as never,
    drafts as never,
    provider as never,
    new PaidAiRequestGate(),
    media as never,
    storage as never,
    audit as never,
  );
  const generate = (
    role: "portrait" | "overheadToken" | "paperDollToken" = "portrait",
  ) =>
    controller.generate(
      "definition",
      "instance",
      "character",
      { user: { id: "gm" }, ip: "127.0.0.1" } as never,
      `request-${role}-1`,
      {
        expectedRevision: 1,
        direction:
          "Blacksmith at an anvil beside a forge with sparks and tools",
        role,
      },
    );
  return { prisma, drafts, provider, storage, media, audit, generate };
}

describe("GM Character artwork generation", () => {
  it("uses distinct provider settings and prompts for all three roles", async () => {
    const h = harness();
    await h.generate("portrait");
    await h.generate("overheadToken");
    await h.generate("paperDollToken");
    for (const index of [1, 2]) {
      const prompt = (h.provider.generateImage.mock.calls as unknown as [string, unknown][])[index][0];
      expect(
        prompt.indexOf("must not include an anvil, forge"),
      ).toBeGreaterThan(prompt.indexOf("Blacksmith at an anvil"));
      expect(prompt).toContain(
        "Every pixel outside the character and permitted worn or held equipment must be transparent",
      );
    }

    expect(h.provider.generateImage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("player-facing portrait"),
      expect.objectContaining({ size: "1024x1536", background: "opaque" }),
    );
    expect(h.provider.generateImage).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("directly overhead"),
      expect.objectContaining({ size: "1024x1024", background: "transparent" }),
    );
    expect(h.provider.generateImage).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("side-view"),
      expect.objectContaining({ size: "1024x1024", background: "transparent" }),
    );
  });
  it("rejects foreign Campaigns and stale drafts before paid work", async () => {
    const h = harness();
    h.prisma.campaignInstance.findFirst.mockResolvedValueOnce(null);
    await expect(h.generate()).rejects.toBeInstanceOf(NotFoundException);
    h.drafts.get.mockResolvedValue({ revision: 2, status: "in-progress" });
    await expect(h.generate()).rejects.toBeInstanceOf(ConflictException);
    h.drafts.get.mockResolvedValue({ revision: 1, status: "ready-for-review" });
    await expect(h.generate()).rejects.toBeInstanceOf(ConflictException);
    expect(h.provider.generateImage).not.toHaveBeenCalled();
  });

  it("stores a scoped preview once on retries and rechecks access", async () => {
    const h = harness();
    await expect(h.generate()).resolves.toEqual({
      assetId: "portrait",
      responseId: "response",
    });
    await h.generate();
    expect(h.provider.generateImage).toHaveBeenCalledTimes(1);
    expect(h.media.create).toHaveBeenCalledWith(
      { id: "upload" },
      ["ai-generated", "character-portrait"],
      { userId: "gm", scopeType: "character-draft", scopeId: "character" },
    );
    expect(h.audit.record).toHaveBeenCalledTimes(1);
    h.prisma.campaignInstance.findFirst.mockResolvedValueOnce(null);
    await expect(h.generate()).rejects.toBeInstanceOf(NotFoundException);
  });
});
