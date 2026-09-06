import { NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignAuthoringController } from "./campaign-authoring.controller";

const request = {
  user: { id: "gm-1", displayName: "Game Master" },
} as Request & AuthenticatedRequest;

describe("CampaignAuthoringController", () => {
  it("bounds the canonical Campaign Definition library", async () => {
    const campaigns = {
      list: jest.fn().mockResolvedValue({
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
        total: 3,
      }),
    };
    const subject = new CampaignAuthoringController(campaigns as never);

    await expect(subject.list(request, "2", "1")).resolves.toEqual({
      items: [{ name: "B" }, { name: "C" }],
      total: 3,
      limit: 2,
      offset: 1,
    });
    expect(campaigns.list).toHaveBeenCalledWith("gm-1");
  });

  it("scopes Plot reads to the selected Campaign Definition draft", async () => {
    const campaigns = {
      getDraft: jest.fn().mockResolvedValue({
        records: [
          {
            resourceType: "plots",
            sourceId: "plot-1",
            payload: { name: "The Bells" },
          },
        ],
      }),
    };
    const subject = new CampaignAuthoringController(campaigns as never);

    await expect(
      subject.plot("campaign-1", "plot-1", request),
    ).resolves.toEqual(expect.objectContaining({ sourceId: "plot-1" }));
    expect(campaigns.getDraft).toHaveBeenCalledWith("campaign-1", "gm-1");
  });

  it("does not return a child from a different Campaign Definition", async () => {
    const campaigns = {
      getDraft: jest.fn().mockResolvedValue({ records: [] }),
    };
    const subject = new CampaignAuthoringController(campaigns as never);

    await expect(
      subject.plot("campaign-other", "plot-1", request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
