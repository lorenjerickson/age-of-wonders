export const CAMPAIGN_PLOT_COLLECTIONS = [
  { key: "objectives", label: "Objectives", singular: "Objective" },
  { key: "pressures", label: "Pressures", singular: "Pressure" },
  { key: "resistances", label: "Resistances", singular: "Resistance" },
  { key: "discoveries", label: "Discoveries", singular: "Discovery" },
  { key: "subplots", label: "Subplots", singular: "Subplot" },
  { key: "locations", label: "Locations", singular: "Location context" },
  { key: "prerequisites", label: "Prerequisites", singular: "Prerequisite" },
  { key: "dependencies", label: "Dependencies", singular: "Dependency" },
] as const;
export type CampaignPlotCollection =
  (typeof CAMPAIGN_PLOT_COLLECTIONS)[number]["key"];
type RecordData = { sourceId: string; resourceType: string; payload: unknown };
export function plotObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function plotLabel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
export function campaignPlotNavigation(
  pathname: string,
  records: readonly RecordData[] = [],
) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (
    parts[0] !== "campaigns" ||
    parts[1] !== "definitions" ||
    parts[3] !== "plots" ||
    !parts[4] ||
    parts[4] === "new"
  )
    return undefined;
  const plot = records.find(
    (record) => record.resourceType === "plots" && record.sourceId === parts[4],
  );
  const href = `/${parts.slice(0, 5).map(encodeURIComponent).join("/")}`;
  return {
    label: plotLabel(plotObject(plot?.payload).name, "Plot"),
    href,
    links: [
      { label: "Plot overview", href },
      ...CAMPAIGN_PLOT_COLLECTIONS.map((collection) => ({
        label: collection.label,
        href: `${href}/${collection.key}`,
      })),
    ],
  };
}
