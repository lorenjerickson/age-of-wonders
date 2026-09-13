import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CampaignSessionMovementService } from "./campaign-session-movement.service";

const scope = {
  definitionId: "campaign",
  instanceId: "instance",
  sessionId: "session",
  userId: "owner",
};
const request = {
  actorId: "actor",
  destination: { x: 1, y: 1, z: 1 },
  expectedRuntimeRevision: 1,
  idempotencyKey: "valid-request-key",
};

describe("movement transaction error boundary", () => {
  it("turns serialization failures during preview and decisions into actionable conflicts", async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("write conflict", {
          code: "P2034",
          clientVersion: "test",
        }),
      );
    const service = new CampaignSessionMovementService({
      $transaction: transaction,
    } as never);
    await expect(service.preview(scope, request)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.decide(scope, "proposal", "approved", "decision-key"),
    ).rejects.toThrow("Refresh and build a new movement preview");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it("preserves unexpected failures instead of disguising storage errors as conflicts", async () => {
    const failure = new Error("storage unavailable");
    const service = new CampaignSessionMovementService({
      $transaction: jest.fn().mockRejectedValue(failure),
    } as never);
    await expect(service.preview(scope, request)).rejects.toBe(failure);
  });
});
