import type { AuthenticatedRequest } from "../auth/auth.types";
import type { Request } from "express";
import { AiController } from "./ai.controller";
import { CampaignProposalRequestGate } from "./campaign-proposal-request-gate";

describe("AiController Campaign proposal security", () => {
  function controller(
    overrides: {
      createDraftProposal?: jest.Mock;
      generationCreate?: jest.Mock;
      generationFindMany?: jest.Mock;
    } = {},
  ) {
    const openAi = { model: "test-model" };
    const campaignGeneration = {
      createDraftProposal: overrides.createDraftProposal ?? jest.fn(),
    };
    const prisma = {
      generation: {
        create: overrides.generationCreate ?? jest.fn(),
        findMany: overrides.generationFindMany ?? jest.fn(),
      },
    };
    return {
      instance: new AiController(
        openAi as never,
        campaignGeneration as never,
        new CampaignProposalRequestGate(),
        prisma as never,
      ),
      prisma,
    };
  }

  const request = {
    user: { id: "gm-1", displayName: "GM", role: "GM" },
    ip: "127.0.0.1",
    socket: {},
  } as unknown as Request & AuthenticatedRequest;

  it("owns proposal persistence and omits raw prompts, output, and provider IDs", async () => {
    const createDraftProposal = jest.fn().mockResolvedValue({
      draftProposal: { name: "Ashes" },
      combinedPrompt: "secret combined prompt",
      output: "x".repeat(900),
      responseId: "provider-response",
    });
    const generationCreate = jest
      .fn()
      .mockResolvedValue({ id: "generation-1" });
    const { instance } = controller({ createDraftProposal, generationCreate });

    const response = await instance.createCampaign(
      "world-snapshot",
      request,
      "request-key-123",
      { prompt: "A city in peril" },
    );

    const createCalls = generationCreate.mock.calls as unknown as Array<
      [{ data: { createdByUserId: string } }]
    >;
    expect(createCalls[0]?.[0].data.createdByUserId).toBe("gm-1");
    expect(response).toMatchObject({
      draftProposal: { name: "Ashes" },
      outputTruncated: true,
    });
    expect(response.outputPreview).toHaveLength(600);
    expect(response).not.toHaveProperty("output");
    expect(response).not.toHaveProperty("responseId");
    expect(JSON.stringify(response)).not.toContain("secret combined prompt");
  });

  it("scopes history to the requester and returns only bounded previews", async () => {
    const generationFindMany = jest.fn().mockResolvedValue([
      {
        id: "generation-1",
        kind: "create-campaign",
        output: "o".repeat(700),
        model: "test-model",
        createdAt: new Date("2026-09-05T12:00:00Z"),
      },
    ]);
    const { instance } = controller({ generationFindMany });

    const response = await instance.listGenerations(request);

    const findCalls = generationFindMany.mock.calls as unknown as Array<
      [
        {
          where: { createdByUserId: string };
          take: number;
          select: Record<string, boolean>;
        },
      ]
    >;
    expect(findCalls[0]?.[0].where).toEqual({ createdByUserId: "gm-1" });
    expect(findCalls[0]?.[0].take).toBe(20);
    expect(findCalls[0]?.[0].select).not.toHaveProperty("prompt");
    expect(findCalls[0]?.[0].select).not.toHaveProperty("responseId");
    expect(response[0]).toMatchObject({ outputTruncated: true });
    expect(response[0]?.outputPreview).toHaveLength(600);
    expect(response[0]).not.toHaveProperty("output");
  });
});
