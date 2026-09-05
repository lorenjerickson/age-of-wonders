import type { CampaignDefinitionSummary, CampaignInstanceSummary } from "./api";

export interface CampaignLibraryCard {
  readonly key: string;
  readonly href: string;
  readonly name: string;
  readonly description?: string;
  readonly statusLabel: string;
  readonly primaryMetadata: string;
  readonly secondaryMetadata: string;
  readonly contextLabels: readonly string[];
  readonly actionLabel: "Open Definition" | "Manage Instance";
}

const humanName = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

export const statusLabel = (value?: string) =>
  (value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") || "Unspecified";

export function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function campaignDefinitionCard(
  definition: CampaignDefinitionSummary,
): CampaignLibraryCard {
  const revision = definition.currentRevision;
  return {
    key: definition.id,
    href: `/campaigns/definitions/${encodeURIComponent(definition.id)}`,
    name: humanName(definition.name, "Unnamed Campaign Definition"),
    description: definition.description?.trim() || undefined,
    statusLabel: statusLabel(definition.status),
    primaryMetadata: revision
      ? `Campaign revision ${revision.revisionNumber}`
      : "No published Campaign revision",
    secondaryMetadata: revision
      ? `${humanName(revision.capturedWorld.worldName ?? revision.capturedWorld.name, "Unnamed World")} · World revision ${revision.capturedWorld.revisionNumber}`
      : "World capture pending",
    contextLabels: [
      ...(definition.draft
        ? [
            `Working draft · ${humanName(definition.draft.revisionName, "Unpublished changes")}`,
          ]
        : []),
      ...(definition.availableWorldMigration
        ? [
            `World update available · ${humanName(definition.availableWorldMigration.worldName, "Unnamed World")} revision ${definition.availableWorldMigration.revisionNumber}`,
          ]
        : []),
    ],
    actionLabel: "Open Definition",
  };
}

export function campaignInstanceCard(
  instance: CampaignInstanceSummary,
): CampaignLibraryCard {
  const snapshot = instance.currentSnapshot;
  return {
    key: instance.id,
    href: `/campaigns/instances/${encodeURIComponent(instance.id)}`,
    name: humanName(instance.name, "Unnamed Campaign Instance"),
    statusLabel: statusLabel(instance.status),
    primaryMetadata: snapshot
      ? `${humanName(snapshot.campaignDefinition.name, "Unnamed Campaign Definition")} · Campaign revision ${snapshot.campaignDefinition.revisionNumber}`
      : "Campaign capture pending",
    secondaryMetadata: snapshot
      ? `${humanName(snapshot.worldDefinition.name, "Unnamed World")} · World revision ${snapshot.worldDefinition.revisionNumber}`
      : "World capture pending",
    contextLabels: [],
    actionLabel: "Manage Instance",
  };
}
