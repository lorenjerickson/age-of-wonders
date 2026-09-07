import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_USER_REQUESTS_PER_WINDOW = 3;
const MAX_ADDRESS_REQUESTS_PER_WINDOW = 30;
const CACHE_MS = 10 * 60 * 1000;
const MAX_COMPLETED_REQUESTS = 200;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const OPERATION_KIND_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export interface PaidAiRequestGateRequest {
  readonly operationKind: string;
  readonly userId: string;
  readonly clientAddress: string;
  readonly idempotencyKey?: string;
  readonly requestFingerprint: string;
}

interface RateWindow {
  readonly count: number;
  readonly startedAt: number;
}

interface InFlightRequest {
  readonly fingerprint: string;
  readonly promise: Promise<unknown>;
}

interface CompletedRequest {
  readonly fingerprint: string;
  readonly expiresAt: number;
  readonly value: unknown;
  finalized: boolean;
  finalizing?: Promise<void>;
}

/** Bounded process-local protection for paid AI work in the hosted API process. */
@Injectable()
export class PaidAiRequestGate {
  private readonly rates = new Map<string, RateWindow>();
  private readonly inFlightByUser = new Map<string, InFlightRequest>();
  private readonly completed = new Map<string, CompletedRequest>();

  async execute<T>(
    request: PaidAiRequestGateRequest,
    work: () => Promise<T>,
    afterSuccess?: (value: T) => Promise<void>,
  ): Promise<T> {
    return this.executePrepared(
      request,
      () => Promise.resolve(undefined),
      work,
      afterSuccess,
    );
  }

  async executePrepared<Prepared, T>(
    request: PaidAiRequestGateRequest,
    prepare: () => Promise<Prepared>,
    work: (prepared: Prepared) => Promise<T>,
    afterSuccess?: (value: T) => Promise<void>,
  ): Promise<T> {
    const operationKind = request.operationKind.trim();
    if (!OPERATION_KIND_PATTERN.test(operationKind)) {
      throw new BadRequestException(
        "AI operation kind must be a bounded lowercase hyphenated key.",
      );
    }
    if (!FINGERPRINT_PATTERN.test(request.requestFingerprint)) {
      throw new BadRequestException(
        "AI request fingerprint must be a SHA-256 hexadecimal digest.",
      );
    }

    const now = Date.now();
    this.prune(now);
    const idempotencyKey = this.normalizedKey(request);
    const cacheKey = `${request.userId}\0${operationKind}\0${idempotencyKey}`;
    const requestIdentity = `${operationKind}\0${idempotencyKey}\0${request.requestFingerprint}`;
    const prior = this.completed.get(cacheKey);
    if (prior) {
      this.assertSameRequest(prior.fingerprint, request.requestFingerprint);
      await this.finalize(
        prior as CompletedRequest & { value: T },
        afterSuccess,
      );
      return prior.value as T;
    }
    const active = this.inFlightByUser.get(request.userId);
    if (active) {
      if (active.fingerprint === requestIdentity) {
        return active.promise as Promise<T>;
      }
      throw new HttpException(
        "An AI request is already being prepared for this user.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const prepared = await prepare();
    const preparedAt = Date.now();
    this.prune(preparedAt);
    const priorAfterPrepare = this.completed.get(cacheKey);
    if (priorAfterPrepare) {
      this.assertSameRequest(
        priorAfterPrepare.fingerprint,
        request.requestFingerprint,
      );
      await this.finalize(
        priorAfterPrepare as CompletedRequest & { value: T },
        afterSuccess,
      );
      return priorAfterPrepare.value as T;
    }
    const activeAfterPrepare = this.inFlightByUser.get(request.userId);
    if (activeAfterPrepare) {
      if (activeAfterPrepare.fingerprint === requestIdentity) {
        return activeAfterPrepare.promise as Promise<T>;
      }
      throw new HttpException(
        "An AI request is already being prepared for this user.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.consume(
      [
        { key: `user:${request.userId}`, limit: MAX_USER_REQUESTS_PER_WINDOW },
        {
          key: `ip:${this.normalizedAddress(request.clientAddress)}`,
          limit: MAX_ADDRESS_REQUESTS_PER_WINDOW,
        },
      ],
      preparedAt,
    );
    const promise = Promise.resolve().then(async () => {
      const value = await work(prepared);
      const completed: CompletedRequest & { value: T } = {
        fingerprint: request.requestFingerprint,
        expiresAt: Date.now() + CACHE_MS,
        value,
        finalized: false,
      };
      // Retain paid provider success before optional persistence/audit work. A
      // failed post-success action can then be retried without paying twice.
      this.completed.set(cacheKey, completed);
      this.prune(Date.now());
      await this.finalize(completed, afterSuccess);
      return value;
    });
    this.inFlightByUser.set(request.userId, {
      fingerprint: requestIdentity,
      promise,
    });
    try {
      return await promise;
    } finally {
      const current = this.inFlightByUser.get(request.userId);
      if (current?.promise === promise)
        this.inFlightByUser.delete(request.userId);
    }
  }

  private async finalize<T>(
    completed: CompletedRequest & { value: T },
    afterSuccess: ((value: T) => Promise<void>) | undefined,
  ): Promise<void> {
    if (!afterSuccess || completed.finalized) return;
    if (completed.finalizing) return completed.finalizing;
    const finalizing = Promise.resolve().then(() =>
      afterSuccess(completed.value),
    );
    completed.finalizing = finalizing;
    try {
      await finalizing;
      completed.finalized = true;
    } finally {
      if (completed.finalizing === finalizing) completed.finalizing = undefined;
    }
  }

  private normalizedKey(request: PaidAiRequestGateRequest): string {
    if (!request.idempotencyKey) return `auto:${request.requestFingerprint}`;
    const key = request.idempotencyKey.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        "Idempotency-Key must contain 8 to 128 letters, numbers, periods, underscores, colons, or hyphens.",
      );
    }
    return key;
  }

  private normalizedAddress(value: string): string {
    return value.trim().slice(0, 128) || "unknown";
  }

  private consume(
    limits: readonly { key: string; limit: number }[],
    now: number,
  ): void {
    const windows = limits.map(({ key, limit }) => {
      const prior = this.rates.get(key);
      return {
        key,
        limit,
        value:
          prior && now - prior.startedAt < WINDOW_MS
            ? prior
            : { count: 0, startedAt: now },
      };
    });
    if (windows.some(({ value, limit }) => value.count >= limit)) {
      throw new HttpException(
        "Too many AI requests. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    for (const { key, value } of windows) {
      this.rates.set(key, { ...value, count: value.count + 1 });
    }
  }

  private assertSameRequest(prior: string, current: string): void {
    if (prior !== current) {
      throw new ConflictException(
        "That idempotency key was already used for a different AI request.",
      );
    }
  }

  private prune(now: number): void {
    for (const [key, value] of this.completed) {
      if (value.expiresAt <= now) this.completed.delete(key);
    }
    if (this.completed.size > MAX_COMPLETED_REQUESTS) {
      const excess = this.completed.size - MAX_COMPLETED_REQUESTS;
      for (const key of [...this.completed.keys()].slice(0, excess)) {
        this.completed.delete(key);
      }
    }
    for (const [key, value] of this.rates) {
      if (now - value.startedAt >= WINDOW_MS) this.rates.delete(key);
    }
  }
}
