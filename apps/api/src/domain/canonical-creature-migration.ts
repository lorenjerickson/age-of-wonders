/**
 * Compare a preserved legacy Creature with its exact canonical successor.
 * This is a migration comparison view only: source snapshots and identifiers stay
 * untouched, and no arbitrary cross-resource replacement is admitted.
 */
export function canonicalCreatureMigrationSources<
  T extends {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  },
>(
  source: readonly T[],
  target: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[],
): T[] {
  const sourceKeys = new Set(
    source.map((record) => `${record.resourceType}\0${record.sourceId}`),
  );
  const targetByKey = new Map(
    target.map((record) => [
      `${record.resourceType}\0${record.sourceId}`,
      record,
    ]),
  );
  return source.map((record) => {
    if (
      record.resourceType !== "creatures" ||
      sourceKeys.has(`definitions\0${record.sourceId}`) ||
      targetByKey.has(`creatures\0${record.sourceId}`)
    )
      return record;
    const successor = targetByKey.get(`definitions\0${record.sourceId}`);
    if (
      !successor ||
      !isObject(successor.payload) ||
      successor.payload.kind !== "creature" ||
      !isObject(record.payload)
    )
      return record;
    return {
      ...record,
      resourceType: "definitions",
      payload: { ...record.payload, kind: "creature" },
    };
  });
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
