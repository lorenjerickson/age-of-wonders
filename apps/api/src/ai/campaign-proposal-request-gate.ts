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

export interface CampaignProposalGateRequest {
  readonly userId: string;
  readonly clientAddress: string;
  readonly idempotencyKey?: string;
  readonly requestFingerprint: string;
}

interface RateWindow {
  count: number;
  startedAt: number;
}

interface InFlightRequest {
  fingerprint: string;
  promise: Promise<unknown>;
}

interface CompletedRequest {
  fingerprint: string;
  expiresAt: number;
  value: unknown;
}

/** Process-local protection for the single hosted API process's paid proposal call. */
@Injectable()
export class CampaignProposalRequestGate {
  private readonly rates = new Map<string, RateWindow>();
  private readonly inFlightByUser = new Map<string, InFlightRequest>();
  private readonly completed = new Map<string, CompletedRequest>();

  async execute<T>(
    request: CampaignProposalGateRequest,
    work: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    this.prune(now);
    const idempotencyKey = this.normalizedKey(request);
    const cacheKey = `${request.userId}\0${idempotencyKey}`;
    const prior = this.completed.get(cacheKey);
    if (prior) {
      this.assertSameRequest(prior.fingerprint, request.requestFingerprint);
      return prior.value as T;
    }

    const active = this.inFlightByUser.get(request.userId);
    if (active) {
      if (active.fingerprint === `${idempotencyKey}\0${request.requestFingerprint}`) {
        return active.promise as Promise<T>;
      }
      throw new HttpException(
        "A Campaign proposal is already being prepared for this user.",
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
      now,
    );
    const promise = work();
    this.inFlightByUser.set(request.userId, {
      fingerprint: `${idempotencyKey}\0${request.requestFingerprint}`,
      promise,
    });
    try {
      const value = await promise;
      this.completed.set(cacheKey, {
        fingerprint: request.requestFingerprint,
        expiresAt: now + CACHE_MS,
        value,
      });
      return value;
    } finally {
      const current = this.inFlightByUser.get(request.userId);
      if (current?.promise === promise) this.inFlightByUser.delete(request.userId);
    }
  }

  private normalizedKey(request: CampaignProposalGateRequest): string {
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
        "Too many Campaign proposal requests. Try again later.",
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
        "That idempotency key was already used for a different Campaign proposal.",
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
