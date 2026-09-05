import type {
  EffectiveWorldModelResponse,
  EffectiveWorldModels,
  WorldDefinitionDraft,
  WorldDefinitionSummary,
  WorldDraftRecord,
  WorldModelOption,
} from "./api";

export function projectEffectiveModels(
  response: EffectiveWorldModelResponse,
): EffectiveWorldModels {
  const project = (
    element: EffectiveWorldModelResponse["elements"][number],
  ) => {
    const presentation = element.currentRevision?.presentation;
    const label =
      typeof presentation?.label === "string" ? presentation.label.trim() : "";
    return {
      key: element.key,
      name: label || "Unnamed model option",
      description:
        typeof presentation?.description === "string"
          ? presentation.description
          : undefined,
      elementId: element.id,
      registryId: element.registryId,
      semanticRole: element.semanticRole,
      sourceReleaseId: element.sourceReleaseId,
      payload: element.currentRevision?.payload,
    };
  };
  return {
    attributes: response.attributes
      .filter((element) => element.kind === "vocabulary-option")
      .map(project),
    equipmentSlots: response.equipmentSlots
      .filter((element) => element.kind === "vocabulary-option")
      .map(project),
    itemFamilies: response.elements
      .filter(
        (element) =>
          element.kind === "vocabulary-option" &&
          element.semanticRole === "aow:item-family",
      )
      .map(project),
    elements: response.elements.map(project),
    releases: response.releases.map(
      ({ id, registryId, name, registryName, revisionNumber }) => ({
        id,
        registryId,
        name,
        registryName,
        revisionNumber,
      }),
    ),
  };
}

export function recordKey(
  record: Pick<WorldDraftRecord, "resourceType" | "sourceId">,
) {
  return `${record.resourceType}\u0000${record.sourceId}`;
}

export function recordPayload(
  record: WorldDraftRecord,
): Record<string, unknown> {
  return typeof record.payload === "object" &&
    record.payload !== null &&
    !Array.isArray(record.payload)
    ? (record.payload as Record<string, unknown>)
    : {};
}

export function recordName(record: WorldDraftRecord, fallback: string) {
  const name = recordPayload(record).name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

export function worldCreationInput(name: string, description: string) {
  return {
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
  };
}

export function modelExtensionKey(
  kind: "attributes" | "equipment-slots",
  name: string,
) {
  const slug =
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "option";
  return `custom:${kind === "attributes" ? "attribute" : "equipment-slot"}-${slug}`;
}

export function contentAdoptingModelRelease(
  content: Record<string, import("./api").JsonValue>,
  replacedReleaseId: string,
  replacementReleaseId: string,
) {
  const current = stringList(content.modelSchemaReleaseIds);
  if (!current.includes(replacedReleaseId)) return undefined;
  return {
    ...content,
    modelSchemaReleaseIds: current.map((id) =>
      id === replacedReleaseId ? replacementReleaseId : id,
    ),
  };
}

export function contentAdoptingRegistryRelease(
  content: Record<string, import("./api").JsonValue>,
  roots: readonly { id: string; registryId: string }[],
  release: {
    id: string;
    registryId: string;
    predecessorRevisionId?: string;
    dependencyReleaseIds: readonly string[];
  },
) {
  const selected = stringList(content.modelSchemaReleaseIds);
  const lineageRoot = roots.find(
    (root) => root.registryId === release.registryId,
  );
  if (lineageRoot) {
    if (
      release.predecessorRevisionId !== lineageRoot.id ||
      !selected.includes(lineageRoot.id)
    )
      return undefined;
    return {
      ...content,
      modelSchemaReleaseIds: selected.map((id) =>
        id === lineageRoot.id ? release.id : id,
      ),
    };
  }
  const exactDependency = release.dependencyReleaseIds.find((id) =>
    selected.includes(id),
  );
  return {
    ...content,
    modelSchemaReleaseIds: exactDependency
      ? selected.map((id) => (id === exactDependency ? release.id : id))
      : [...selected, release.id],
  };
}

export function draftAdoptingRegistryRelease(
  draft: WorldDefinitionDraft,
  roots: readonly { id: string; registryId: string }[],
  release: Parameters<typeof contentAdoptingRegistryRelease>[2],
) {
  const content = contentAdoptingRegistryRelease(draft.content, roots, release);
  if (!content) return undefined;
  const selected = stringList(content.modelSchemaReleaseIds);
  return {
    ...draft,
    content,
    records: draft.records.map((record) => {
      if (record.resourceType !== "definitions") return record;
      const payload = recordPayload(record);
      const existingConformance =
        typeof payload.conformance === "object" &&
        payload.conformance !== null &&
        !Array.isArray(payload.conformance)
          ? payload.conformance
          : undefined;
      const governedDefinition =
        payload.kind === "creature" ||
        payload.kind === "item" ||
        (payload.kind === undefined &&
          (payload.definitionType === "creature" ||
            payload.definitionType === "item"));
      if (!existingConformance && !governedDefinition) return record;
      return {
        ...record,
        payload: {
          ...payload,
          conformance: {
            ...(existingConformance ?? {}),
            modelSchemaReleaseIds: selected,
          },
        },
      };
    }),
  } satisfies WorldDefinitionDraft;
}

export function recoverableRegistryRelease(
  content: Record<string, import("./api").JsonValue>,
  roots: readonly { id: string; registryId: string }[],
  registryId: string,
  releases: readonly {
    identity: {
      id: string;
      lineageId: string;
      predecessorRevisionId?: string;
    };
    name: string;
    dependencies?: readonly { releaseId: string }[];
  }[],
) {
  const selected = stringList(content.modelSchemaReleaseIds);
  const lineageRoot = roots.find((root) => root.registryId === registryId);
  return releases.find((release) => {
    if (selected.includes(release.identity.id)) return false;
    if (lineageRoot) {
      return release.identity.predecessorRevisionId === lineageRoot.id;
    }
    return (release.dependencies ?? []).some((dependency) =>
      selected.includes(dependency.releaseId),
    );
  });
}

export function savedNavigationAllowanceForRoute(
  previousSourceId: string | undefined,
  nextSourceId: string | undefined,
  allowed: boolean,
) {
  return previousSourceId === nextSourceId ? allowed : false;
}

export function definitionConformance(
  draft: WorldDefinitionDraft,
  definitionType: "creature" | "item",
) {
  const semanticRole =
    definitionType === "creature" ? "aow:creature" : "aow:item";
  const concept = draft.effectiveModels?.elements?.find(
    (element) => element.semanticRole === semanticRole,
  );
  if (!concept?.elementId) return undefined;
  return {
    modelSchemaReleaseIds: stringList(draft.content.modelSchemaReleaseIds),
    conceptId: concept.elementId,
  };
}

function locationParentId(record: WorldDraftRecord) {
  const payload = recordPayload(record);
  const placement = payload.placement;
  const placementRecord = placement as Record<string, unknown>;
  if (
    typeof placement === "object" &&
    placement !== null &&
    !Array.isArray(placement) &&
    placementRecord.kind === "within-parent" &&
    typeof placementRecord.parentLocationId === "string"
  ) {
    return placementRecord.parentLocationId;
  }
  return typeof payload.parentId === "string" ? payload.parentId : undefined;
}

export function recordsForLibrary(
  records: readonly WorldDraftRecord[],
  library: "locations" | "creatures" | "items",
) {
  if (library === "locations") {
    return records.filter((record) => record.resourceType === "locations");
  }
  const definitionType = library === "creatures" ? "creature" : "item";
  return records.filter((record) => {
    if (record.resourceType === library) return true;
    if (record.resourceType !== "definitions") return false;
    const payload = recordPayload(record);
    return (
      payload.kind === definitionType ||
      (payload.kind === undefined && payload.definitionType === definitionType)
    );
  });
}

export function upsertDraftRecord(
  records: readonly WorldDraftRecord[],
  next: WorldDraftRecord,
) {
  const key = recordKey(next);
  const index = records.findIndex((record) => recordKey(record) === key);
  if (index < 0) return [...records, next];
  return records.map((record, candidate) =>
    candidate === index ? next : record,
  );
}

export function mergeSavedDraft(
  saved: WorldDefinitionDraft,
  previous: WorldDefinitionDraft,
): WorldDefinitionDraft {
  return {
    ...saved,
    status: "current",
    effectiveModels: previous.effectiveModels,
  };
}

export function draftWithIndexedRecord(
  draft: WorldDefinitionDraft,
  record: WorldDraftRecord,
): WorldDefinitionDraft {
  const content = { ...draft.content };
  if (record.resourceType === "locations") {
    const locationIds = stringList(content.locationIds);
    content.locationIds = [...new Set([...locationIds, record.sourceId])];
    const placement = recordPayload(record).placement;
    const placementRecord = placement as Record<string, unknown>;
    if (
      typeof placement === "object" &&
      placement !== null &&
      !Array.isArray(placement) &&
      placementRecord.kind === "root"
    ) {
      content.rootLocationId = record.sourceId;
    }
  }
  if (record.resourceType === "definitions") {
    content.definitionIds = [
      ...new Set([...stringList(content.definitionIds), record.sourceId]),
    ];
  }
  return {
    ...draft,
    content,
    records: upsertDraftRecord(draft.records, record),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export interface HierarchyRow {
  record: WorldDraftRecord;
  name: string;
  depth: number;
  issue?: string;
}

export function hierarchyRows(
  records: readonly WorldDraftRecord[],
): HierarchyRow[] {
  const locations = recordsForLibrary(records, "locations");
  const byId = new Map(locations.map((record) => [record.sourceId, record]));
  const children = new Map<string | undefined, WorldDraftRecord[]>();
  const orphans: WorldDraftRecord[] = [];
  for (const location of locations) {
    const parent = locationParentId(location);
    const parentId = typeof parent === "string" && parent ? parent : undefined;
    if (parentId && !byId.has(parentId)) {
      orphans.push(location);
      continue;
    }
    children.set(parentId, [...(children.get(parentId) ?? []), location]);
  }
  const rows: HierarchyRow[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | undefined, depth: number) => {
    const values = [...(children.get(parentId) ?? [])].sort((a, b) =>
      recordName(a, "Unnamed Location").localeCompare(
        recordName(b, "Unnamed Location"),
      ),
    );
    for (const value of values) {
      if (seen.has(value.sourceId)) continue;
      seen.add(value.sourceId);
      rows.push({
        record: value,
        name: recordName(value, "Unnamed Location"),
        depth,
      });
      visit(value.sourceId, depth + 1);
    }
  };
  visit(undefined, 0);
  for (const orphan of orphans.sort((a, b) =>
    recordName(a, "").localeCompare(recordName(b, "")),
  )) {
    rows.push({
      record: orphan,
      name: recordName(orphan, "Unnamed Location"),
      depth: 0,
      issue: "Parent unavailable",
    });
  }
  for (const location of locations) {
    if (!seen.has(location.sourceId) && !orphans.includes(location)) {
      rows.push({
        record: location,
        name: recordName(location, "Unnamed Location"),
        depth: 0,
        issue: "Hierarchy cycle",
      });
    }
  }
  return rows;
}

export function locationParentOptions(
  records: readonly WorldDraftRecord[],
  editedSourceId?: string,
) {
  const locations = recordsForLibrary(records, "locations");
  if (!editedSourceId) return locations;
  const unavailable = new Set([editedSourceId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const location of locations) {
      const parentId = locationParentId(location);
      if (
        typeof parentId === "string" &&
        unavailable.has(parentId) &&
        !unavailable.has(location.sourceId)
      ) {
        unavailable.add(location.sourceId);
        changed = true;
      }
    }
  }
  return locations.filter((location) => !unavailable.has(location.sourceId));
}

export function effectiveModelOptions(models: EffectiveWorldModels) {
  return {
    attributes: models.attributes.map(({ name }) => name),
    equipmentSlots: models.equipmentSlots.map(({ name }) => name),
  };
}

export function attributeNumberConfig(option: WorldModelOption) {
  const metadata = option.payload?.valueMetadata;
  const values =
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
      ? metadata
      : {};
  const number = (key: string, fallback: number) =>
    typeof values[key] === "number" ? values[key] : fallback;
  const minimum = number("aow:minimum", 0);
  const maximum = number("aow:maximum", 100);
  const defaultValue = Math.min(
    maximum,
    Math.max(minimum, number("aow:default", minimum)),
  );
  return { minimum, maximum, defaultValue };
}

export function draftContextLabel(draft: WorldDefinitionDraft) {
  if (draft.status === "stale") return "Draft needs rebase";
  return draft.baseRevisionNumber
    ? `Draft based on revision ${draft.baseRevisionNumber}`
    : "Initial unpublished draft";
}

export function worldDraftStartLabel(revision: {
  revisionNumber: number;
  name: string;
}) {
  const name = revision.name.trim() || "Unnamed revision";
  return `Revision ${revision.revisionNumber} · ${name}`;
}

export function filterWorlds(
  worlds: readonly WorldDefinitionSummary[],
  query: string,
  status: "all" | "active" | "archived",
) {
  const needle = query.trim().toLocaleLowerCase();
  return worlds.filter((world) => {
    const matchesStatus =
      status === "all" || world.status.toLocaleLowerCase() === status;
    const haystack =
      `${world.name} ${world.description ?? ""}`.toLocaleLowerCase();
    return matchesStatus && (!needle || haystack.includes(needle));
  });
}

export function worldDraftLabel(world: WorldDefinitionSummary) {
  if (!world.draft) return "No working draft";
  if (!world.draft.isCurrentBase)
    return "Working draft needs migration to the current World revision";
  if (world.draft.hasUnpublishedChanges) {
    return world.draft.validationStatus === "valid"
      ? "Validated unpublished changes"
      : "Unpublished changes need review";
  }
  return "Working draft matches the published revision";
}
