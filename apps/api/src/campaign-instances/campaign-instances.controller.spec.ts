import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignInstancesController } from "./campaign-instances.controller";

describe("CampaignInstancesController", () => {
  it("delegates list and explicitly selected Instance reads", async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      get: jest.fn().mockResolvedValue({ name: "Tuesday Glasswake" }),
      create: jest.fn().mockResolvedValue({ name: "Wednesday Glasswake" }),
    };
    const controller = new CampaignInstancesController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = {
      headers: {},
      user: { id: "gm-1", displayName: "GM", role: UserRole.GM },
    } as Request & AuthenticatedRequest;

    await expect(controller.list(request)).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(controller.get("instance-1", request)).resolves.toEqual({
      name: "Tuesday Glasswake",
    });
    expect(service.list).toHaveBeenCalledWith("gm-1");
    expect(service.get).toHaveBeenCalledWith("instance-1", "gm-1");
    await expect(
      controller.create(request, {
        idempotencyKey: "create-wednesday-glasswake-1",
        name: "Wednesday Glasswake",
        campaignDefinitionSnapshotId: "campaign-snapshot-3",
      }),
    ).resolves.toEqual({ name: "Wednesday Glasswake" });
    expect(service.create).toHaveBeenCalledWith(
      {
        idempotencyKey: "create-wednesday-glasswake-1",
        name: "Wednesday Glasswake",
        campaignDefinitionSnapshotId: "campaign-snapshot-3",
      },
      "gm-1",
      "GM",
    );
  });

  it("requires the GM guard for every endpoint", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignInstancesController),
    ).toContain(GmGuard);
  });
});
