import { ConflictException, HttpStatus } from "@nestjs/common";
import { PaidAiRequestGate } from "./paid-ai-request-gate";

describe("PaidAiRequestGate", () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date("2026-09-07T12:00:00Z")),
  );
  afterEach(() => jest.useRealTimers());

  const request = {
    operationKind: "campaign-definition-proposal",
    userId: "gm-1",
    clientAddress: "127.0.0.1",
    idempotencyKey: "retry-key-1",
    requestFingerprint: "a".repeat(64),
  } as const;

  it("coalesces identical work per operation and rejects key reuse", async () => {
    const gate = new PaidAiRequestGate();
    let release!: (value: { id: string }) => void;
    const work = jest.fn(
      () => new Promise<{ id: string }>((resolve) => (release = resolve)),
    );

    const first = gate.execute(request, work);
    const retry = gate.execute(request, work);
    await Promise.resolve();
    await Promise.resolve();
    release({ id: "one" });

    await expect(first).resolves.toEqual({ id: "one" });
    await expect(retry).resolves.toEqual({ id: "one" });
    await expect(gate.execute(request, work)).resolves.toEqual({ id: "one" });
    expect(work).toHaveBeenCalledTimes(1);
    await expect(
      gate.execute({ ...request, requestFingerprint: "b".repeat(64) }, work),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("retains paid work before retrying a failed post-success action", async () => {
    const gate = new PaidAiRequestGate();
    const work = jest.fn().mockResolvedValue({ id: "paid-result" });
    const postSuccess = jest
      .fn()
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(gate.execute(request, work, postSuccess)).rejects.toThrow(
      "audit unavailable",
    );
    await expect(gate.execute(request, work, postSuccess)).resolves.toEqual({
      id: "paid-result",
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(postSuccess).toHaveBeenCalledTimes(2);
  });

  it("keeps idempotency namespaces separate for future World proposal kinds", async () => {
    const gate = new PaidAiRequestGate();
    const work = jest.fn().mockResolvedValue({ ok: true });

    await gate.execute(request, work);
    await gate.execute(
      { ...request, operationKind: "world-location-proposal" },
      work,
    );

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("isolates completed results by owner and evicts the oldest beyond the bound", async () => {
    const gate = new PaidAiRequestGate();
    const work = jest.fn(() => Promise.resolve({ ok: true }));

    for (let index = 0; index <= 200; index += 1) {
      await gate.execute(
        {
          ...request,
          userId: `gm-${index}`,
          clientAddress: `address-${index}`,
        },
        work,
      );
    }
    await gate.execute(
      { ...request, userId: "gm-200", clientAddress: "address-200" },
      work,
    );
    expect(work).toHaveBeenCalledTimes(201);

    await gate.execute(
      { ...request, userId: "gm-0", clientAddress: "address-0" },
      work,
    );
    expect(work).toHaveBeenCalledTimes(202);
  });

  it("rejects unbounded identifiers and rate limits by user and address", async () => {
    const gate = new PaidAiRequestGate();
    await expect(
      gate.execute({ ...request, operationKind: "not valid" }, () =>
        Promise.resolve(null),
      ),
    ).rejects.toThrow("operation kind");
    await expect(
      gate.execute({ ...request, requestFingerprint: "short" }, () =>
        Promise.resolve(null),
      ),
    ).rejects.toThrow("fingerprint");

    for (let index = 0; index < 3; index += 1) {
      await gate.execute(
        {
          ...request,
          idempotencyKey: `request-key-${index}`,
          requestFingerprint: String(index).padStart(64, "0"),
        },
        () => Promise.resolve(index),
      );
    }
    await expect(
      gate.execute(
        {
          ...request,
          idempotencyKey: "request-key-4",
          requestFingerprint: "4".repeat(64),
        },
        () => Promise.resolve(4),
      ),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
