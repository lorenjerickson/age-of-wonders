import type { AuthenticatedRequest } from "../auth/auth.types";
import type { Request } from "express";
import { AiController } from "./ai.controller";
import { PaidAiRequestGate } from "./paid-ai-request-gate";

describe("AiController Campaign proposal security", () => {
  function controller(
    overrides: {
      createDraftProposal?: jest.Mock;
      auditRecord?: jest.Mock;
      auditList?: jest.Mock;
      worldProposal?: jest.Mock;
      worldPrepare?: jest.Mock;
      paidRequests?: PaidAiRequestGate;
    } = {},
  ) {
    const campaignGeneration = {
      createDraftProposal: overrides.createDraftProposal ?? jest.fn(),
    };
    const audit = {
      record: overrides.auditRecord ?? jest.fn(),
      listForOwner: overrides.auditList ?? jest.fn(),
    };
    const worldDraftProposals = {
      prepare:
        overrides.worldPrepare ??
        jest
          .fn()
          .mockImplementation(
            (_kind: string, _worldId: string, _userId: string, dto: unknown) =>
              dto,
          ),
      proposePrepared: overrides.worldProposal ?? jest.fn(),
    };
    return {
      instance: new AiController(
        campaignGeneration as never,
        overrides.paidRequests ?? new PaidAiRequestGate(),
        audit as never,
        worldDraftProposals as never,
      ),
      audit,
      worldDraftProposals,
      paidRequests: overrides.paidRequests,
    };
  }

  const request = {
    user: { id: "gm-1", displayName: "GM", role: "GM" },
    ip: "127.0.0.1",
    socket: {},
  } as unknown as Request & AuthenticatedRequest;

  it("owns proposal audit and omits raw prompts, output, and provider IDs", async () => {
    const createDraftProposal = jest.fn().mockResolvedValue({
      draftProposal: { name: "Ashes" },
      combinedPrompt: "secret combined prompt",
      output: "x".repeat(900),
      responseId: "provider-response",
      model: "test-model",
    });
    const auditRecord = jest.fn().mockResolvedValue({ id: "generation-1" });
    const { instance } = controller({ createDraftProposal, auditRecord });

    const response = await instance.createCampaign(
      "world-snapshot",
      request,
      "request-key-123",
      { prompt: "A city in peril" },
    );

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "gm-1",
        contextType: "world-definition-snapshot",
        contextId: "world-snapshot",
      }),
    );
    expect(response).toMatchObject({
      draftProposal: { name: "Ashes" },
      model: "test-model",
    });
    expect(response).not.toHaveProperty("output");
    expect(response).not.toHaveProperty("outputPreview");
    expect(response).not.toHaveProperty("responseId");
    expect(response).not.toHaveProperty("generationId");
    expect(JSON.stringify(response)).not.toContain("secret combined prompt");
  });

  it("scopes history to the requester and returns only bounded previews", async () => {
    const auditList = jest.fn().mockResolvedValue([
      {
        kind: "campaign-definition-proposal",
        model: "test-model",
        createdAt: new Date("2026-09-05T12:00:00Z"),
        contentRetained: false,
      },
    ]);
    const { instance } = controller({ auditList });

    const response = await instance.listGenerations(request);

    expect(auditList).toHaveBeenCalledWith("gm-1");
    expect(response[0]).toMatchObject({ contentRetained: false });
  });

  it("coalesces an idempotent World proposal and records a private audit once", async () => {
    const worldProposal = jest.fn().mockResolvedValue({
      proposal: {
        expectedStorageRevision: 4,
        name: "Glass Marsh",
        kind: "region",
      },
      provider: {
        output: '{"name":"Glass Marsh"}',
        responseId: "provider-response",
        model: "test-model",
      },
      combinedPrompt: "private world context",
    });
    const auditRecord = jest.fn().mockResolvedValue({ id: "private-audit" });
    const dto = {
      expectedStorageRevision: 4,
      direction: "A flooded glass plain",
      parentLocationId: "parent-location",
    };
    const { instance } = controller({ worldProposal, auditRecord });

    const first = instance.createLocationProposal(
      "owned-world",
      request,
      "proposal-request-1",
      dto,
    );
    const retry = instance.createLocationProposal(
      "owned-world",
      request,
      "proposal-request-1",
      dto,
    );

    await expect(first).resolves.toMatchObject({
      proposal: { name: "Glass Marsh" },
      model: "test-model",
    });
    await expect(retry).resolves.toMatchObject({
      proposal: { name: "Glass Marsh" },
    });
    expect(worldProposal).toHaveBeenCalledTimes(1);
    expect(worldProposal).toHaveBeenCalledWith(dto);
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await first)).not.toContain("private world context");
    expect(JSON.stringify(await first)).not.toContain("provider-response");
  });

  it("retries a failed audit from the completed result before a now-stale World preflight", async () => {
    const worldProposal = jest.fn().mockResolvedValue({
      proposal: {
        expectedStorageRevision: 4,
        name: "Glass Marsh",
        kind: "region",
      },
      provider: {
        output: '{"name":"Glass Marsh"}',
        responseId: "provider-response",
        model: "test-model",
      },
      combinedPrompt: "private world context",
    });
    const auditRecord = jest
      .fn()
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValueOnce({ id: "private-audit" });
    const dto = {
      expectedStorageRevision: 4,
      direction: "A flooded glass plain",
      parentLocationId: "parent-location",
    };
    const worldPrepare = jest
      .fn()
      .mockResolvedValueOnce(dto)
      .mockRejectedValueOnce(
        new Error("This World draft changed; refresh before requesting."),
      );
    const { instance } = controller({
      worldProposal,
      auditRecord,
      worldPrepare,
    });

    await expect(
      instance.createLocationProposal(
        "owned-world",
        request,
        "proposal-request-audit-failure",
        dto,
      ),
    ).rejects.toThrow(
      "The AI proposal was prepared, but its private audit could not be recorded.",
    );
    await expect(
      instance.createLocationProposal(
        "owned-world",
        request,
        "proposal-request-audit-failure",
        dto,
      ),
    ).resolves.toMatchObject({
      proposal: { name: "Glass Marsh", expectedStorageRevision: 4 },
    });

    expect(worldProposal).toHaveBeenCalledTimes(1);
    expect(worldPrepare).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledTimes(2);
  });

  it("does not begin paid work when World Model preflight fails", async () => {
    const worldPrepare = jest
      .fn()
      .mockRejectedValue(
        new Error("The effective Item concept is unavailable."),
      );
    const worldProposal = jest.fn();
    const { instance } = controller({ worldPrepare, worldProposal });

    await expect(
      instance.createItemProposal(
        "owned-world",
        request,
        "proposal-request-preflight",
        { expectedStorageRevision: 4, direction: "A useful tool" },
      ),
    ).rejects.toThrow("The effective Item concept is unavailable.");

    expect(worldProposal).not.toHaveBeenCalled();
  });
});
