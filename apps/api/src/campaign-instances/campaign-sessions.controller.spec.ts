import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignSessionsController } from "./campaign-sessions.controller";

describe("CampaignSessionsController", () => {
  const request = {
    headers: {},
    user: { id: "gm-1", displayName: "GM", role: UserRole.GM },
  } as Request & AuthenticatedRequest;

  it("proves the Definition parent before reading Session children", async () => {
    const management = {
      sessions: jest.fn().mockResolvedValue({ items: [] }),
    };
    const sessions = {
      assertCampaignDefinitionParent: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CampaignSessionsController(
      management as never,
      sessions as never,
    );

    await expect(
      controller.list("definition-1", "instance-1", request),
    ).resolves.toEqual({ items: [] });
    expect(sessions.assertCampaignDefinitionParent).toHaveBeenCalledWith(
      "definition-1",
      "instance-1",
      "gm-1",
    );
    expect(management.sessions).toHaveBeenCalledWith("instance-1", "gm-1");
  });

  it("does not invoke a Session mutation when parent scoping fails", async () => {
    const unavailable = new Error("unavailable");
    const sessions = {
      assertCampaignDefinitionParent: jest.fn().mockRejectedValue(unavailable),
      create: jest.fn(),
    };
    const controller = new CampaignSessionsController(
      {} as never,
      sessions as never,
    );

    await expect(
      controller.create("wrong-definition", "instance-1", request, {
        idempotencyKey: "plan-session-1",
        name: "Storm Warning",
      }),
    ).rejects.toBe(unavailable);
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
