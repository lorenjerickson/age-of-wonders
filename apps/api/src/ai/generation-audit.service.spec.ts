import { GenerationAuditService } from "./generation-audit.service";

describe("GenerationAuditService", () => {
  it("persists an owner-scoped audit without raw prompt or output content", async () => {
    const create = jest
      .fn<Promise<{ id: string }>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue({ id: "generation-1" });
    const service = new GenerationAuditService({
      generation: { create },
    } as never);

    await expect(
      service.record({
        kind: "campaign-definition-proposal",
        ownerUserId: "gm-1",
        contextType: "world-definition-snapshot",
        contextId: "snapshot-1",
        model: "gpt-test",
        providerResponseId: "provider-response",
      }),
    ).resolves.toEqual({ id: "generation-1" });

    const data = create.mock.calls[0]?.[0].data ?? {};
    expect(data).toMatchObject({
      createdByUserId: "gm-1",
      prompt: "[content not retained]",
      output: "[content not retained]",
    });
    expect(data).not.toHaveProperty("combinedPrompt");
    expect(data).not.toHaveProperty("providerOutput");
  });

  it("returns bounded owner-scoped metadata without content or provider IDs", async () => {
    const findMany = jest
      .fn<
        Promise<
          Array<{
            kind: string;
            model: string;
            contextType: string;
            createdAt: Date;
          }>
        >,
        [{ select: Record<string, boolean>; where: unknown; take: number }]
      >()
      .mockResolvedValue([
        {
          kind: "campaign-definition-proposal",
          model: "gpt-test",
          contextType: "world-definition-snapshot",
          createdAt: new Date("2026-09-07T12:00:00Z"),
        },
      ]);
    const service = new GenerationAuditService({
      generation: { findMany },
    } as never);

    const result = await service.listForOwner("gm-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdByUserId: "gm-1" },
        take: 20,
      }),
    );
    const select = findMany.mock.calls[0]?.[0].select ?? {};
    expect(select).not.toHaveProperty("prompt");
    expect(select).not.toHaveProperty("output");
    expect(select).not.toHaveProperty("responseId");
    expect(select).not.toHaveProperty("id");
    expect(result[0]).toMatchObject({ contentRetained: false });
  });
});
