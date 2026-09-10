import type { WorldDraftRecord, JsonValue } from "./api";
import { recordPayload, recordName } from "./worldAuthoringModel";
export const LOCATION_SECTIONS = [
  "Description",
  "Map",
  "Discoveries",
  "Creatures",
  "Items",
  "Connections",
] as const;
export type LocationSection = Lowercase<(typeof LOCATION_SECTIONS)[number]>;
export function locationHref(worldId: string, locationId: string) {
  return `/worlds/${encodeURIComponent(worldId)}/atlas/locations/${encodeURIComponent(locationId)}`;
}
export function locationAncestry(
  records: readonly WorldDraftRecord[],
  locationId: string,
): WorldDraftRecord[] {
  const locations = new Map(
    records
      .filter((record) => record.resourceType === "locations")
      .map((record) => [record.sourceId, record]),
  );
  const path: WorldDraftRecord[] = [];
  const seen = new Set<string>();
  let current = locations.get(locationId);
  while (current && !seen.has(current.sourceId)) {
    seen.add(current.sourceId);
    path.unshift(current);
    const placement = recordPayload(current).placement as
      { parentLocationId?: string } | undefined;
    current = placement?.parentLocationId
      ? locations.get(placement.parentLocationId)
      : undefined;
  }
  return path;
}
export function locationSectionHref(
  worldId: string,
  locationId: string,
  section: LocationSection,
) {
  return (
    locationHref(worldId, locationId) +
    (section === "description" ? "" : `/${section}`)
  );
}
export function locationParentOptions(
  records: readonly WorldDraftRecord[],
  locationId: string,
) {
  return records
    .filter(
      (record) =>
        record.resourceType === "locations" &&
        !locationAncestry(records, record.sourceId).some(
          (ancestor) => ancestor.sourceId === locationId,
        ),
    )
    .map((record) => ({
      id: record.sourceId,
      name: recordName(record, "Unnamed Location"),
    }));
}
export function updateLocationFields(
  record: WorldDraftRecord,
  fields: Record<string, JsonValue>,
): WorldDraftRecord {
  return {
    ...record,
    payload: { ...recordPayload(record), ...fields } as JsonValue,
  };
}

export function locationMutationInput(
  record: WorldDraftRecord,
  expectedStorageRevision: number,
): import("@aow/common").CreateWorldLocationDraftRequest {
  const payload = recordPayload(record);
  const profile = (payload.profile ?? {}) as {
    summary?: string;
    tags?: string[];
  };
  const scene = (payload.mapScene ?? {}) as {
    notes?: string;
    orientation?: "scenic" | "overhead" | "side-on";
  };
  const placement = (payload.placement ?? {}) as { parentLocationId?: string };
  return {
    expectedStorageRevision,
    name: String(payload.name ?? recordName(record, "Unnamed Location")),
    description:
      typeof payload.description === "string" ? payload.description : undefined,
    gmDescription: payload.gmDescription as string | undefined,
    discoveries: payload.discoveries as
      import("@aow/common").DiscoveryClaim[] | undefined,
    image: payload.image as import("@aow/common").LocationImage | undefined,
    kind: String(payload.kind ?? "region"),
    parentLocationId: placement.parentLocationId as never,
    profileSummary: profile.summary,
    profileTags: profile.tags ?? [],
    mapSceneNotes: scene.notes ?? "",
    mapOrientation: scene.orientation,
  };
}

export function locationGmNotes(record: WorldDraftRecord): string {
  const payload = recordPayload(record);
  if (typeof payload.gmDescription === "string") return payload.gmDescription;
  const extensions = payload.extensions as Record<string, unknown> | undefined;
  const legacy = extensions?.["aow:gm-secrets"] as
    { secrets?: unknown } | undefined;
  return Array.isArray(legacy?.secrets)
    ? legacy.secrets
        .filter((value): value is string => typeof value === "string")
        .join("\n\n")
    : "";
}
