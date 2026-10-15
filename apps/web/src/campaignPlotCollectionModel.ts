import { Discovery } from "@aow/domain";
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
  return Discovery.authoringClaims(discovery) as ChildRecord[];
}

/** Stores an edited claim list back into canonical truth/belief/rumor facets. */
export function putDiscoveryClaims(
  discovery: ChildRecord,
  claims: ChildRecord[],
): ChildRecord {
  return Discovery.withAuthoredClaims(discovery, claims) as ChildRecord;
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
  return Discovery.authoringClaimReferences(
    childRecords(plot.discoveries),
    removedIds,
  ).map(
    ({ discovery, claim }) =>
      `${childText(discovery.name as JsonValue) || "Discovery"}: ${childText(claim.statement as JsonValue) || "Claim"}`,
  );
}
