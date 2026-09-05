import { ConflictException, HttpStatus } from "@nestjs/common";
import { CampaignProposalRequestGate } from "./campaign-proposal-request-gate";

describe("CampaignProposalRequestGate", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-09-05T12:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("coalesces an in-flight idempotent retry and caches its result", async () => {
    const gate = new CampaignProposalRequestGate();
    let release!: (value: { id: string }) => void;
    const work = jest.fn(() => new Promise<{ id: string }>((resolve) => { release = resolve; }));
    const request = { userId: "gm-1", clientAddress: "127.0.0.1", idempotencyKey: "retry-key-1", requestFingerprint: "same" };

    const first = gate.execute(request, work);
    const concurrentRetry = gate.execute(request, work);
    release({ id: "one" });

    await expect(first).resolves.toEqual({ id: "one" });
    await expect(concurrentRetry).resolves.toEqual({ id: "one" });
    await expect(gate.execute(request, work)).resolves.toEqual({ id: "one" });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("rejects key reuse for a different request and concurrent paid work per user", async () => {
    const gate = new CampaignProposalRequestGate();
    let release!: () => void;
    const pending = gate.execute(
      { userId: "gm-1", clientAddress: "one", idempotencyKey: "request-key", requestFingerprint: "first" },
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    await expect(gate.execute(
      { userId: "gm-1", clientAddress: "one", idempotencyKey: "other-key", requestFingerprint: "second" },
      () => Promise.resolve(undefined),
    )).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    release();
    await pending;
    await expect(gate.execute(
      { userId: "gm-1", clientAddress: "one", idempotencyKey: "request-key", requestFingerprint: "changed" },
      () => Promise.resolve(undefined),
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it("rate limits independently by authenticated user and client address", async () => {
    const gate = new CampaignProposalRequestGate();
    for (let index = 0; index < 30; index += 1) {
      await gate.execute(
        { userId: `gm-${index}`, clientAddress: "shared-ip", idempotencyKey: `request-key-${index}`, requestFingerprint: `request-${index}` },
        () => Promise.resolve(index),
      );
    }
    await expect(gate.execute(
      { userId: "gm-30", clientAddress: "shared-ip", idempotencyKey: "request-key-30", requestFingerprint: "request-30" },
      () => Promise.resolve(30),
    )).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    const userGate = new CampaignProposalRequestGate();
    for (let index = 0; index < 3; index += 1) {
      await userGate.execute(
        { userId: "same-gm", clientAddress: `ip-${index}`, idempotencyKey: `request-key-${index}`, requestFingerprint: `request-${index}` },
        () => Promise.resolve(index),
      );
    }
    await expect(userGate.execute(
      { userId: "same-gm", clientAddress: "ip-4", idempotencyKey: "request-key-4", requestFingerprint: "request-4" },
      () => Promise.resolve(4),
    )).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
