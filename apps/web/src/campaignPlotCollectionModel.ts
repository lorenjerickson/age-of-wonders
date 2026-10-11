import type { JsonValue } from "./api";
export type PlotCollection =
  "objectives" | "pressures" | "resistances" | "discoveries";
export type ChildRecord = Record<string, JsonValue>;
export const childObject = (value: JsonValue | undefined): ChildRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const childText = (value: JsonValue | undefined): string =>
  typeof value === "string" ? value : "";
export const childRecords = (value: JsonValue | undefined): ChildRecord[] =>
  Array.isArray(value) ? value.map(childObject) : [];

/** Presents the canonical discovery facets as the legacy kind-shaped rows used by the editor. */
export function discoveryClaims(discovery: ChildRecord): ChildRecord[] {
  const truth = childObject(discovery.truth);
  if (discovery.truth || discovery.beliefs || discovery.rumors)
    return [
      ...(childText(truth.statement).trim()
        ? [{ ...truth, kind: "truth" }]
        : []),
      ...childRecords(discovery.beliefs).map((claim) => ({
        ...claim,
        kind: "belief",
      })),
      ...childRecords(discovery.rumors).map((claim) => ({
        ...claim,
        kind: "rumor",
      })),
    ];
  return childRecords(discovery.claims);
}

/** Stores an edited claim list back into canonical truth/belief/rumor facets. */
export function putDiscoveryClaims(
  discovery: ChildRecord,
  claims: ChildRecord[],
): ChildRecord {
  const truth = claims.find((claim) => childText(claim.kind) === "truth");
  const withoutLegacyClaims = { ...discovery };
  delete withoutLegacyClaims.claims;
  return {
    ...withoutLegacyClaims,
    truth: truth
      ? (() => {
          const value = { ...truth };
          delete value.kind;
          return value;
        })()
      : { id: childText(childObject(discovery.truth).id), statement: "" },
    beliefs: claims
      .filter((claim) => childText(claim.kind) === "belief")
      .map((claim) => {
        const value = { ...claim };
        delete value.kind;
        return value;
      }),
    rumors: claims
      .filter((claim) => childText(claim.kind) === "rumor")
      .map((claim) => {
        const value = { ...claim };
        delete value.kind;
        return value;
      }),
  };
}
/** Replace by stable identity without rebuilding untouched children or extension payloads. */
export function putPlotChild(children: ChildRecord[], child: ChildRecord) {
  return children.some((entry) => entry.id === child.id)
    ? children.map((entry) => (entry.id === child.id ? child : entry))
    : [...children, child];
}
export function plotClaimReferences(
  plot: ChildRecord,
  removedIds: Set<string>,
) {
  return childRecords(plot.discoveries).flatMap((discovery) =>
    discoveryClaims(discovery)
      .filter(
        (claim) =>
          !removedIds.has(childText(claim.id)) &&
          (removedIds.has(childText(claim.relatedTruthClaimId)) ||
            (Array.isArray(claim.conflictsWithClaimIds) &&
              claim.conflictsWithClaimIds.some((id) =>
                removedIds.has(childText(id)),
              ))),
      )
      .map(
        (claim) =>
          `${childText(discovery.name) || "Discovery"}: ${childText(claim.statement) || "Claim"}`,
      ),
  );
}
