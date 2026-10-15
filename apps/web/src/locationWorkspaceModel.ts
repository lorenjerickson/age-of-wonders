import { WorldDefinition } from "@aow/domain";
import { LocationDefinition } from "@aow/domain";
import type { WorldDraftRecord, JsonValue } from "./api";
import { recordPayload, recordName } from "./worldAuthoringModel";
import { presentationFields } from "./locationPresentationModel";
export const LOCATION_SECTIONS = [
  "Description",
  "Map",
  "Discoveries",
  "Creatures",
  "Items",
  "Hierarchy",
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
  // Preserve this workspace's retained placement-parent projection while the
  // owner applies the hierarchy decision to canonical read-only input.
  const hierarchy = records.map((record) => {
    const placement = recordPayload(record).placement;
    const parentLocationId =
      placement &&
      typeof placement === "object" &&
      !Array.isArray(placement) &&
      "parentLocationId" in placement
        ? placement.parentLocationId
        : undefined;
    return {
      ...record,
      payload: { placement: { kind: "within-parent", parentLocationId } },
    };
  });
  return records
    .filter(
      (record) =>
        record.resourceType === "locations" &&
        !WorldDefinition.hierarchyPlacementIssue(
          {},
          hierarchy,
          locationId,
          record.sourceId,
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
  previous?: WorldDraftRecord,
): import("@aow/common").CreateWorldLocationDraftRequest {
  const payload = recordPayload(record);
  const profile = (payload.profile ?? {}) as {
    summary?: string;
    tags?: string[];
  };
  const scene = (payload.mapScene ?? {}) as {
    notes?: string;
    orientation?: import("@aow/common").LocationMapOrientation;
    grid?: import("@aow/common").CreateWorldLocationDraftRequest["mapSceneGrid"];
  };
  const placement = (payload.placement ?? {}) as { parentLocationId?: string };
  return {
    expectedStorageRevision,
    ...presentationFields(
      payload.weather as JsonValue | undefined,
      payload.audiovisualEffects as JsonValue | undefined,
      previous ? recordPayload(previous) : undefined,
    ),
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
    mapSceneGrid: scene.grid,
    map: payload.map as import("@aow/common").CreateWorldLocationDraftRequest["map"],
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

/** An orientation change selects the matching map representation before persistence. */
export function locationMapForSave(
  previousMap: unknown,
  image: import("@aow/common").LocationImage | undefined,
  orientation: import("@aow/common").LocationMapOrientation,
): import("@aow/common").LocationMap {
  return LocationDefinition.authoringMap(previousMap, image, orientation);
}

type ObjectValue = Record<string, JsonValue>;
function object(value: unknown): value is ObjectValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function locationClaims(
  record: WorldDraftRecord,
): ObjectValue[] | undefined {
  const value = recordPayload(record).discoveries;
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (v) =>
        !object(v) ||
        typeof v.id !== "string" ||
        !v.id ||
        typeof v.statement !== "string" ||
        !["truth", "rumor", "belief"].includes(String(v.kind)),
    )
  )
    return undefined;
  const claims = value as ObjectValue[];
  return new Set(claims.map((v) => v.id)).size === claims.length
    ? claims
    : undefined;
}
