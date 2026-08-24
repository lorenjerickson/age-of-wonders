import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type IteratorCallback = (
  error: Error | null,
  values: unknown[],
) => void;

interface IteratorOptions {
  gte?: string;
  gt?: string;
  lte?: string;
  lt?: string;
  reverse?: boolean;
  limit?: number;
  valueEncoding?: string;
}

interface GraphBatchOperation {
  type: "put" | "del";
  key: string;
  value?: string;
}

/**
 * The small subset of the AbstractLevel API used by LevelGraph 4.
 * LevelGraph still owns its hexastore encoding and query planning; this class
 * only maps ordered key/value operations onto PostgreSQL through Prisma.
 */
export class PostgresLevelAdapter {
  constructor(private readonly prisma: PrismaService) {}

  batch(
    operations: readonly GraphBatchOperation[],
    options: Readonly<Record<string, unknown>>,
    callback: (error?: Error | null) => void,
  ): void;
  batch(
    operations: readonly GraphBatchOperation[],
    callback: (error?: Error | null) => void,
  ): void;
  batch(
    operations: readonly GraphBatchOperation[],
    optionsOrCallback:
      | Readonly<Record<string, unknown>>
      | ((error?: Error | null) => void),
    possibleCallback?: (error?: Error | null) => void,
  ): void {
    const callback: ((error?: Error | null) => void) | undefined =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : possibleCallback;

    if (!callback) return;

    const queries: Prisma.PrismaPromise<unknown>[] = operations.map(
      (operation) => {
        if (operation.type === "del") {
          return this.prisma.graphEntry.deleteMany({
            where: { key: operation.key },
          });
        }
        return this.prisma.graphEntry.upsert({
          where: { key: operation.key },
          create: { key: operation.key, value: operation.value ?? "null" },
          update: { value: operation.value ?? "null" },
        });
      },
    );

    void this.prisma
      .$transaction(queries)
      .then(() => callback(null))
      .catch((error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
      );
  }

  values(options: IteratorOptions): PostgresValueIterator {
    return new PostgresValueIterator(this, this.prisma, options);
  }

  isOpen(): boolean {
    return true;
  }

  close(callback?: (error?: Error | null) => void): void {
    callback?.(null);
  }
}

class PostgresValueIterator {
  readonly db: PostgresLevelAdapter;
  private offset = 0;
  private closed = false;

  constructor(
    adapter: PostgresLevelAdapter,
    private readonly prisma: PrismaService,
    private readonly options: IteratorOptions,
  ) {
    this.db = adapter;
  }

  nextv(size: number, callback: IteratorCallback): void {
    if (this.closed) {
      callback(new Error("Graph iterator is closed"), []);
      return;
    }

    const configuredLimit = this.options.limit ?? -1;
    const remaining =
      configuredLimit < 0 ? size : Math.max(configuredLimit - this.offset, 0);
    const take = Math.min(size, remaining);
    if (take === 0) {
      callback(null, []);
      return;
    }

    const key: Prisma.StringFilter = {
      gte: this.options.gte,
      gt: this.options.gt,
      lte: this.options.lte,
      lt: this.options.lt,
    };

    void this.prisma.graphEntry
      .findMany({
        where: { key },
        orderBy: { key: this.options.reverse ? "desc" : "asc" },
        skip: this.offset,
        take,
        select: { value: true },
      })
      .then((entries) => {
        this.offset += entries.length;
        const values: unknown[] = entries.map(({ value }) => {
          if (this.options.valueEncoding !== "json") return value;
          return JSON.parse(value) as unknown;
        });
        callback(null, values);
      })
      .catch((error: unknown) =>
        callback(
          error instanceof Error ? error : new Error(String(error)),
          [],
        ),
      );
  }

  close(callback: (error?: Error | null) => void): void {
    this.closed = true;
    callback(null);
  }
}
