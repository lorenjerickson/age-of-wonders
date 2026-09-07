import { BadRequestException } from "@nestjs/common";
import { QuickStartService } from "./quick-start.service";

describe("Quick Start guidance", () => {
  it("derives World completion from the selected authoritative World", async () => {
    const progress = {
      id: "progress-1",
      userId: "gm-1",
      activityKey: "choose-world",
      activityRevision: 2,
      currentStepKey: null,
      collapsed: false,
      selfConfirmedStepKeys: [],
      targetContext: { worldDefinitionId: "world-1" },
      lastCanonicalRoute: "/worlds/world-1/atlas",
    };
    const prisma = {
      quickStartProgress: {
        findUnique: jest.fn().mockResolvedValue(progress),
        update: jest.fn().mockResolvedValue(progress),
      },
      worldDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          name: "Glasswake",
          currentRevisionId: "revision-1",
          currentRevision: {
            content: { rootLocationId: "root", locationIds: ["root"] },
          },
          draft: null,
        }),
      },
    };
    const service = new QuickStartService(prisma as never, {} as never);

    await expect(service.activity("gm-1", "choose-world")).resolves.toEqual(
      expect.objectContaining({
        complete: true,
        completedStepCount: 3,
        targetLabels: ["Glasswake"],
      }),
    );
  });

  it("persists only a target resolved through the current GM", async () => {
    const stored = {
      id: "progress-1",
      userId: "gm-1",
      activityKey: "choose-world",
      activityRevision: 2,
      currentStepKey: null,
      collapsed: false,
      selfConfirmedStepKeys: [],
      targetContext: { worldDefinitionId: "world-1" },
      lastCanonicalRoute: "/worlds/world-1",
    };
    const prisma = {
      quickStartProgress: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(stored),
        upsert: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockResolvedValue(stored),
      },
      worldDefinition: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "world-1" })
          .mockResolvedValueOnce({
            name: "Glasswake",
            currentRevisionId: null,
            currentRevision: null,
            draft: { content: {}, snapshotRecords: [] },
          }),
      },
    };
    const service = new QuickStartService(prisma as never, {} as never);

    const result = await service.update("gm-1", "choose-world", {
      lastCanonicalRoute: "/worlds/world-1/atlas",
    });

    expect(prisma.quickStartProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.worldDefinition.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: "world-1", ownerUserId: "gm-1" },
      select: { id: true },
    });
    expect(result.targetLabels).toEqual(["Glasswake"]);
    expect(result.complete).toBe(false);
  });

  it("rejects navigation outside an activity's canonical route scope", async () => {
    const prisma = {
      quickStartProgress: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new QuickStartService(prisma as never, {} as never);

    await expect(
      service.update("gm-1", "choose-world", {
        lastCanonicalRoute: "/settings/system",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
