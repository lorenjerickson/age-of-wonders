import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignDefinitionsController } from "./campaign-definitions.controller";

describe("CampaignDefinitionsController", () => {
  it("exposes draft-first writes and no direct revision publication method", async () => {
    const service = Object.fromEntries(["list", "get", "create", "getDraft", "startDraft", "save", "resetDraft", "validate", "publish", "impact", "archive", "restore", "fork", "previewWorldMigration", "applyWorldMigration"].map((name) => [name, jest.fn().mockResolvedValue({ name })])) as never;
    const controller = new CampaignDefinitionsController(service);
    const request = { headers: {}, user: { id: "gm-1", displayName: "GM", role: UserRole.GM } } as Request & AuthenticatedRequest;
    await controller.create(request, { name: "Ashes", worldDefinitionSnapshotId: "world-snapshot" });
    await controller.publishDraft("campaign", request, { expectedStorageRevision: 2 });
    await controller.resetDraft("campaign", request, { expectedStorageRevision: 3 });
    expect((service as Record<string, jest.Mock>).create).toHaveBeenCalledWith(expect.anything(), "gm-1");
    expect((service as Record<string, jest.Mock>).publish).toHaveBeenCalledWith("campaign", { expectedStorageRevision: 2 }, "gm-1");
    expect((service as Record<string, jest.Mock>).resetDraft).toHaveBeenCalledWith("campaign", { expectedStorageRevision: 3 }, "gm-1");
    expect("publishRevision" in controller).toBe(false);
  });
  it("requires the GM guard", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CampaignDefinitionsController)).toContain(GmGuard);
  });
});
