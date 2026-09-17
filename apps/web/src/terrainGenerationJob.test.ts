import { expect, it, vi } from "vitest";
import { startTerrainGenerationJob } from "./terrainGenerationJob";
function fixture(throwPost = false) {
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn(() => {
      if (throwPost) throw new Error("clone failed");
    }),
  } as unknown as Worker;
  const onResult = vi.fn(),
    onError = vi.fn();
  const options = {
    createWorker: () => worker,
    request: { seed: 42 },
    onResult,
    onError,
  };
  return { worker, onResult, onError, options };
}
it("recovers from construction failure and permits a fresh successful retry", () => {
  const f = fixture();
  startTerrainGenerationJob({
    ...f.options,
    createWorker: () => {
      throw new Error("blocked");
    },
  });
  expect(f.onError).toHaveBeenCalledOnce();
  startTerrainGenerationJob(f.options);
  f.worker.onmessage?.call(f.worker, {
    data: { preview: true },
  } as MessageEvent);
  expect(f.onResult).toHaveBeenCalledWith({ preview: true });
  expect(f.worker.terminate).toHaveBeenCalledOnce();
});
it("terminates on synchronous post failure without accepting late work", () => {
  const f = fixture(true);
  startTerrainGenerationJob(f.options);
  expect(f.onError).toHaveBeenCalledOnce();
  expect(f.worker.terminate).toHaveBeenCalledOnce();
  expect(f.worker.onmessage).toBeNull();
  expect(f.onResult).not.toHaveBeenCalled();
});
it.each(["onerror", "onmessageerror"] as const)(
  "settles %s only once and ignores queued results",
  (kind) => {
    const f = fixture();
    startTerrainGenerationJob(f.options);
    const late = f.worker.onmessage!;
    const handler = f.worker[kind]!;
    handler.call(f.worker, { preventDefault: vi.fn() } as never);
    late.call(f.worker, { data: { preview: true } } as MessageEvent);
    expect(f.onError).toHaveBeenCalledOnce();
    expect(f.onResult).not.toHaveBeenCalled();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  },
);
it("cancels silently even if a result was already queued", () => {
  const f = fixture();
  const job = startTerrainGenerationJob(f.options);
  const late = f.worker.onmessage!;
  job.cancel();
  job.cancel();
  late.call(f.worker, { data: { preview: true } } as MessageEvent);
  expect(f.worker.terminate).toHaveBeenCalledOnce();
  expect(f.onError).not.toHaveBeenCalled();
  expect(f.onResult).not.toHaveBeenCalled();
});
it("reports a generator validation error without creating a candidate", () => {
  const f = fixture();
  startTerrainGenerationJob(f.options);
  f.worker.onmessage?.call(f.worker, {
    data: { error: "Choose a valid seed" },
  } as MessageEvent);
  expect(f.onError).toHaveBeenCalledWith("Choose a valid seed");
  expect(f.onResult).not.toHaveBeenCalled();
});
