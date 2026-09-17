/** One disposable worker request. Settled/cancelled jobs cannot deliver late results. */
export function startTerrainGenerationJob<Result>(options: {
  createWorker(): Worker;
  request: unknown;
  onResult(result: Result): void;
  onError(message: string): void;
}): { cancel(): void } {
  let worker: Worker | undefined;
  let settled = false;
  const cleanup = () => {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  };
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    options.onError(message);
  };
  try {
    worker = options.createWorker();
    worker.onmessage = (event: MessageEvent<Result & { error?: string }>) => {
      if (settled) return;
      if (event.data?.error) {
        fail(event.data.error);
        return;
      }
      settled = true;
      cleanup();
      options.onResult(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(
        "Terrain generation failed. Your map is unchanged. Try generating again.",
      );
    };
    worker.onmessageerror = () => {
      fail(
        "The terrain preview could not be received. Your map is unchanged. Try generating again.",
      );
    };
    worker.postMessage(options.request);
  } catch {
    fail(
      "Terrain generation could not start. Your map is unchanged. Try generating again.",
    );
  }
  return {
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
    },
  };
}
