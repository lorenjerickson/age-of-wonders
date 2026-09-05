import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignDefinitionsController } from "./campaign-definitions.controller";

describe("CampaignDefinitionsController", () => {
  it("delegates compact list and explicitly selected lineage reads", async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      get: jest.fn().mockResolvedValue({ name: "Ashes at Dawn" }),
      create: jest.fn().mockResolvedValue({ name: "New Campaign" }),
      publishRevision: jest.fn().mockResolvedValue({ name: "Revised" }),
    };
    const controller = new CampaignDefinitionsController(service);
    const request = {
      headers: {},
      user: { id: "gm-1", displayName: "GM", role: UserRole.GM },
    } as Request & AuthenticatedRequest;

    await expect(controller.list(request)).resolves.toEqual({ items: [], total: 0 });
    await expect(
      controller.get("campaign-definition-1", request),
    ).resolves.toEqual({
      name: "Ashes at Dawn",
    });
    expect(service.list).toHaveBeenCalledWith("gm-1");
    expect(service.get).toHaveBeenCalledWith("campaign-definition-1", "gm-1");
    const createDto = {
      name: "New Campaign",
      worldDefinitionSnapshotId: "world-snapshot-1",
      content: {},
      snapshotManifest: {
        formatVersion: 1,
        records: [
          { resourceType: "campaign-content", sourceId: "draft", payload: {} },
        ],
      },
    };
    await controller.create(request, createDto);
    expect(service.create).toHaveBeenCalledWith(createDto, "gm-1");
    const revisionDto = {
      predecessorRevisionId: "revision-1",
      worldDefinitionSnapshotId: "world-snapshot-2",
      name: "Revised",
      content: {},
      snapshotManifest: {
        formatVersion: 1,
        records: [
          { resourceType: "campaign-content", sourceId: "draft", payload: {} },
        ],
      },
    };
    await controller.publishRevision(
      "campaign-definition-1",
      request,
      revisionDto,
    );
    expect(service.publishRevision).toHaveBeenCalledWith(
      "campaign-definition-1",
      revisionDto,
      "gm-1",
    );
  });

  it("requires the GM guard for every endpoint", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignDefinitionsController),
    ).toContain(GmGuard);
  });
});
