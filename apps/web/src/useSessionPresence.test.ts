import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionPresenceLease } from "./useSessionPresence";

afterEach(() => {
  vi.useRealTimers();
});

function fixture() {
  const api = {
    join: vi.fn().mockResolvedValue({}),
    heartbeat: vi.fn().mockResolvedValue({}),
    leave: vi.fn().mockResolvedValue({}),
  };
  return {
    api,
    lease: createSessionPresenceLease(api),
    listener: vi.fn(),
    refresh: vi.fn(),
    disposed: vi.fn(),
  };
}

describe("Session presence lease", () => {
  it("renews joined presence every 45 seconds without implicit joining", async () => {
    vi.useFakeTimers();
    const { api, lease, listener, refresh, disposed } = fixture();
    const detach = lease.attach(listener, refresh, false, disposed);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(api.join).not.toHaveBeenCalled();
    expect(api.heartbeat).not.toHaveBeenCalled();
    await lease.join();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
    detach();
    await vi.runOnlyPendingTimersAsync();
    expect(api.leave).toHaveBeenCalledTimes(1);
  });

  it("restores a stored connection by heartbeat and retains it across immediate navigation", async () => {
    vi.useFakeTimers();
    const { api, lease, listener, refresh, disposed } = fixture();
    const detach = lease.attach(listener, refresh, true, disposed);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
    expect(api.join).not.toHaveBeenCalled();
    detach();
    const finalDetach = lease.attach(vi.fn(), refresh, true, disposed);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.leave).not.toHaveBeenCalled();
    expect(disposed).not.toHaveBeenCalled();
    finalDetach();
    await vi.runOnlyPendingTimersAsync();
    expect(api.leave).toHaveBeenCalledTimes(1);
  });

  it("serializes leave after a pending heartbeat and ignores refresh failure", async () => {
    vi.useFakeTimers();
    const { api, lease, listener, disposed } = fixture();
    const detach = lease.attach(
      listener,
      () => Promise.reject(new Error("refresh failed")),
      false,
      disposed,
    );
    await lease.join();
    let resolveHeartbeat!: () => void;
    api.heartbeat.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHeartbeat = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(45_000);
    const leaving = lease.leave();
    expect(api.leave).not.toHaveBeenCalled();
    resolveHeartbeat();
    await leaving;
    expect(listener).toHaveBeenLastCalledWith({ present: false, error: "" });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
    detach();
    await vi.runOnlyPendingTimersAsync();
  });
});
