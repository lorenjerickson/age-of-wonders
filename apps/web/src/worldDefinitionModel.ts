import type {
  WorldDefinitionDetail,
  WorldDefinitionSummary,
} from "./api";

export function humanWorldName(value: string | undefined) {
  return value?.trim() || "Unnamed World Definition";
}

export function currentWorldRevision(definition: WorldDefinitionDetail) {
  if (!definition.currentRevisionId) return undefined;
  return definition.revisions.find(
    (revision) => revision.id === definition.currentRevisionId,
  );
}

export function worldRevisionLabel(
  definition: Pick<WorldDefinitionSummary, "currentRevision">,
) {
  return definition.currentRevision
    ? `Revision ${definition.currentRevision.revisionNumber}`
    : "No published revision";
}

export function safeDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
