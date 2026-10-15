import { DefinitionLineage } from "./definition-lineage";
import type { CampaignDraftRecord } from "./campaign-definition-policy";
import type { CompiledModelElement } from "./model-schema";

export interface CampaignMigrationManifest {
  readonly formatVersion: number;
  readonly contentHash: string;
  readonly records: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly sourceRevision?: number;
    readonly contentHash: string;
    readonly payload: unknown;
  }[];
}
export interface CampaignMigrationWorld {
  readonly id: string;
  readonly worldDefinitionId: string;
  readonly worldDefinitionRevisionId: string;
  readonly manifest: unknown;
  readonly contentHash: string;
  readonly worldDefinitionRevision: {
    readonly predecessorRevisionId: string | null;
    readonly name: string;
    readonly revisionNumber: number;
    readonly publishedAt: string;
    readonly worldDefinition: { readonly name: string };
    readonly modelSchemaSelections: readonly {
      readonly modelSchemaReleaseId: string;
      readonly modelSchemaRelease: {
        readonly name: string;
        readonly revisionNumber: number;
        readonly registry: { readonly name: string };
      };
    }[];
  };
}
export interface CampaignMigrationDraft {
  readonly campaignDefinitionId: string;
  readonly storageRevision: number;
  readonly content: unknown;
  readonly snapshotRecords: unknown;
  readonly capturedWorldSnapshot: CampaignMigrationWorld;
}
export interface CampaignMigrationPorts {
  readonly contentHash: (value: unknown) => string;
  readonly isCanonicalManifest: (
    value: unknown,
  ) => value is CampaignMigrationManifest;
  readonly utf8Bytes: (value: string) => number;
}
export const MAX_MIGRATION_CONFLICTS = 50;
export const MAX_MIGRATION_CANDIDATES_PER_CONFLICT = 12;
export const MAX_MIGRATION_CHANGES_PER_KIND = 50;
export const MAX_MIGRATION_PREVIEW_BYTES = 128 * 1024;

type ManifestRecord = CampaignMigrationManifest["records"][number];
export interface MigrationConflict {
  code: string;
  subject: string;
  detail: string;
  source?: { resourceType: string; id: string };
  sourceLabel?: string;
  candidates?: { id: string; label: string; typeLabel: string }[];
  candidateSummary?: {
    total: number;
    returned: number;
    offset: number;
    truncated: boolean;
  };
}

export interface ModelMigrationAssessment {
  readonly targetReleaseIds: readonly string[];
  readonly compatible: boolean;
  readonly candidates: readonly {
    id: string;
    label: string;
    typeLabel: string;
  }[];
}

/** Domain migration planning; access, snapshot integrity and hashing are supplied by adapters. */
export function createCampaignWorldMigrationPlanner(
  ports: CampaignMigrationPorts,
) {
  const canonicalJsonHash = ports.contentHash;
  const isCanonicalSnapshotManifest = ports.isCanonicalManifest;
  function buildCampaignWorldMigrationPlan(
    draft: CampaignMigrationDraft,
    target: CampaignMigrationWorld,
    suppliedMappings: readonly {
      resourceType: string;
      sourceId: string;
      targetId: string;
    }[],
    projection: {
      readonly conflictOffset?: number;
      readonly candidateOffset?: number;
      readonly impactOffset?: number;
      readonly changeOffset?: number;
      readonly modelMigration?: ModelMigrationAssessment;
      readonly presentationPageSize?: number;
      readonly internal?: boolean;
    } = {},
  ) {
    const source = draft.capturedWorldSnapshot;
    const presentationPageSize = Math.max(
      1,
      Math.min(
        MAX_MIGRATION_CHANGES_PER_KIND,
        projection.presentationPageSize ?? MAX_MIGRATION_CHANGES_PER_KIND,
      ),
    );
    const successorIssue = DefinitionLineage.successorIssue(source, {
      worldDefinitionId: target.worldDefinitionId,
      predecessorRevisionId:
        target.worldDefinitionRevision.predecessorRevisionId,
    });
    if (successorIssue) throw new TypeError(successorIssue);
    if (
      !isCanonicalSnapshotManifest(source.manifest) ||
      !isCanonicalSnapshotManifest(target.manifest)
    )
      throw new TypeError(
        "A selected World snapshot failed its integrity check.",
      );

    const targetRecords = keyed(
      target.manifest.records.filter(
        (r) => r.resourceType !== "world-definition-revision",
      ),
    );
    const sourceRecords = keyed(
      canonicalCreatureMigrationSources(
        source.manifest.records.filter(
          (r) => r.resourceType !== "world-definition-revision",
        ),
        [...targetRecords.values()],
      ),
    );
    const normalizedMappings = [...suppliedMappings]
      .map((item) => ({
        resourceType: item.resourceType.trim(),
        sourceId: item.sourceId.trim(),
        targetId: item.targetId.trim(),
      }))
      .sort((left, right) =>
        `${left.resourceType}\0${left.sourceId}`.localeCompare(
          `${right.resourceType}\0${right.sourceId}`,
          "en",
        ),
      );
    const targetCandidates = indexCandidates(targetRecords);
    const mapping = new Map<string, string>();
    const conflictSeeds: MigrationConflictSeed[] = [];
    let conflictCount = 0;
    const addConflict = (conflict: MigrationConflictSeed) => {
      conflictCount += 1;
      conflictSeeds.push(conflict);
    };
    if (projection.modelMigration && !projection.modelMigration.compatible) {
      addConflict({
        code: "model-schema-incompatible",
        subject: "Campaign Model conformance",
        detail:
          "The successor World changes a governed concept or field required by this Campaign. Publish a direct World successor that retains compatible concepts and fields, then preview migration again.",
        sourceLabel: "Campaign Model conformance",
        candidates: projection.modelMigration.candidates.slice(
          0,
          MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
        ),
        candidateSummary: {
          total: projection.modelMigration.candidates.length,
          returned: Math.min(
            projection.modelMigration.candidates.length,
            MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
          ),
          offset: 0,
          truncated:
            projection.modelMigration.candidates.length >
            MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
        },
      });
    }
    for (const supplied of normalizedMappings) {
      const key = `${supplied.resourceType.trim()}\0${supplied.sourceId.trim()}`;
      const targetKey = `${supplied.resourceType.trim()}\0${supplied.targetId.trim()}`;
      const sourceRecord = sourceRecords.get(key);
      const targetRecord = targetRecords.get(targetKey);
      if (
        mapping.has(key) ||
        !sourceRecord ||
        !targetRecord ||
        semanticRecordKind(sourceRecord) !== semanticRecordKind(targetRecord)
      ) {
        addConflict({
          code: "mapping-invalid",
          subject: label(sourceRecords.get(key), "World content"),
          detail:
            "A migration mapping is duplicated or does not resolve to compatible target content.",
        });
      } else mapping.set(key, supplied.targetId.trim());
    }
    const added: ReturnType<typeof changeItem>[] = [];
    const removed: ReturnType<typeof changeItem>[] = [];
    const changed: ReturnType<typeof changeItem>[] = [];
    for (const [key, record] of targetRecords) {
      const before = sourceRecords.get(key);
      if (!before) added.push(changeItem(record));
      else if (before.contentHash !== record.contentHash)
        changed.push(changeItem(record));
    }
    for (const [key, record] of sourceRecords)
      if (!targetRecords.has(key)) removed.push(changeItem(record));

    const authoredReferences = collectStrings({
      content: draft.content,
      records: draft.snapshotRecords,
    });
    const impact = buildMigrationImpact(
      draft,
      source,
      target,
      sourceRecords,
      targetRecords,
      changed,
      removed,
      authoredReferences,
      projection.impactOffset ?? 0,
      presentationPageSize,
    );
    for (const item of removed) {
      if (
        authoredReferences.has(item.id) &&
        !mapping.has(`${item.resourceType}\0${item.id}`)
      )
        addConflict({
          code: "referenced-content-removed",
          subject: item.name,
          detail: `${item.typeLabel} is referenced by Campaign content but is absent from the target World revision.`,
          source: { resourceType: item.resourceType, id: item.id },
          sourceLabel: item.name,
          candidateResourceType: candidateIndexKey(
            sourceRecords.get(`${item.resourceType}\0${item.id}`),
          ),
        });
    }
    const decorations = readRecords(draft.snapshotRecords).filter(
      (r) =>
        r.resourceType === "campaign-placements" &&
        isObject(r.payload) &&
        r.payload.kind === "world-decoration" &&
        typeof r.payload.capturedWorldPlacementId === "string",
    );
    for (const decoration of decorations) {
      const placementId = (decoration.payload as Record<string, unknown>)
        .capturedWorldPlacementId as string;
      const key = `world-placements\0${placementId}`;
      const before = sourceRecords.get(key),
        after = targetRecords.get(key);
      if (
        (!after || before?.contentHash !== after.contentHash) &&
        !mapping.has(key)
      )
        addConflict({
          code: after
            ? "decorated-placement-changed"
            : "decorated-placement-removed",
          subject: label(before, "World placement"),
          detail:
            "A decorated World placement changed and requires an explicit mapping acknowledgement.",
          source: { resourceType: "world-placements", id: placementId },
          sourceLabel: label(before, "World placement"),
          candidateResourceType: candidateIndexKey(before),
        });
    }
    conflictSeeds.sort(
      (a, b) =>
        a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject),
    );
    const conflictOffset = Math.max(0, projection.conflictOffset ?? 0);
    const candidateOffset = Math.max(0, projection.candidateOffset ?? 0);
    const conflicts: MigrationConflict[] = conflictSeeds
      .slice(conflictOffset, conflictOffset + MAX_MIGRATION_CONFLICTS)
      .map(({ candidateResourceType, ...conflict }) => {
        if (!candidateResourceType) return conflict;
        const allCandidates = targetCandidates.get(candidateResourceType) ?? [];
        const candidates = allCandidates.slice(
          candidateOffset,
          candidateOffset + MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
        );
        return {
          ...conflict,
          candidates,
          candidateSummary: {
            total: allCandidates.length,
            returned: candidates.length,
            offset: candidateOffset,
            truncated:
              candidateOffset > 0 ||
              candidateOffset + candidates.length < allCandidates.length,
          },
        };
      });
    const changeOffset = Math.max(0, projection.changeOffset ?? 0);
    const changePage = <T>(items: readonly T[]) =>
      projection.internal
        ? items
        : items.slice(changeOffset, changeOffset + presentationPageSize);
    const changeSummary = {
      added: added.length,
      changed: changed.length,
      removed: removed.length,
      returned: {
        added: changePage(added).length,
        changed: changePage(changed).length,
        removed: changePage(removed).length,
      },
      offset: changeOffset,
      nextOffset:
        Math.max(added.length, changed.length, removed.length) >
        changeOffset + presentationPageSize
          ? changeOffset + presentationPageSize
          : undefined,
      truncated:
        changeOffset > 0 ||
        Math.max(added.length, changed.length, removed.length) >
          changeOffset + presentationPageSize,
    };
    const conflictSummary = {
      total: conflictCount,
      returned: conflicts.length,
      offset: conflictOffset,
      nextOffset:
        conflictOffset + conflicts.length < conflictCount
          ? conflictOffset + conflicts.length
          : undefined,
      truncated:
        conflictOffset > 0 || conflictOffset + conflicts.length < conflictCount,
    };
    const changes = {
      added: changePage(added),
      changed: changePage(changed),
      removed: changePage(removed),
    };
    const semanticBasis = {
      formatVersion: 1,
      campaignDefinitionId: draft.campaignDefinitionId,
      expectedStorageRevision: draft.storageRevision,
      sourceWorldSnapshotId: source.id,
      targetWorldSnapshotId: target.id,
      sourceWorldContentHash: source.contentHash,
      targetWorldContentHash: target.contentHash,
      mappings: normalizedMappings,
      targetModelReleaseIds: projection.modelMigration?.targetReleaseIds ?? [],
      changeHash: canonicalJsonHash({ added, changed, removed }),
      conflictCount,
    };
    const planHash = canonicalJsonHash(semanticBasis);
    const result = {
      formatVersion: 1,
      campaignDefinitionId: draft.campaignDefinitionId,
      expectedStorageRevision: draft.storageRevision,
      sourceWorldSnapshotId: source.id,
      targetWorldSnapshotId: target.id,
      sourceWorldContentHash: source.contentHash,
      targetWorldContentHash: target.contentHash,
      mappings: projection.internal ? normalizedMappings : [],
      changes,
      changeSummary,
      conflicts,
      conflictSummary,
      impact,
      planHash,
      presentationTruncated:
        changeSummary.truncated ||
        impact.presentationTruncated ||
        conflictSummary.truncated,
      ready: conflictCount === 0,
      sourceWorld: worldSummary(source),
      targetWorld: worldSummary(target),
    };
    if (projection.internal) return result;
    if (
      ports.utf8Bytes(JSON.stringify(result)) <= MAX_MIGRATION_PREVIEW_BYTES
    ) {
      return result;
    }
    if (presentationPageSize > 1) {
      return buildCampaignWorldMigrationPlan(draft, target, suppliedMappings, {
        ...projection,
        presentationPageSize: Math.max(1, Math.floor(presentationPageSize / 2)),
      });
    }
    const semanticallyReady = conflictCount === 0;
    const compactBase = {
      ...result,
      mappings: [],
      impact: { ...result.impact, presentationTruncated: true },
      conflicts: semanticallyReady
        ? []
        : ([
            {
              code: "migration-preview-size-limit",
              subject: "Migration review",
              detail:
                "The migration has more detail than can be reviewed safely in one response.",
            },
          ] as MigrationConflict[]),
      conflictSummary: {
        total: conflictCount,
        returned: semanticallyReady ? 0 : 1,
        offset: conflictOffset,
        nextOffset: undefined,
        truncated: conflictCount > 0,
      },
      presentationTruncated: true,
      ready: semanticallyReady,
    };
    return compactBase;
  }

  function rewriteModelConformance(
    value: unknown,
    targetReleaseIds: readonly string[] | undefined,
  ): unknown {
    if (!targetReleaseIds || !isObject(value) || !isObject(value.conformance))
      return value;
    return {
      ...value,
      conformance: {
        ...value.conformance,
        modelSchemaReleaseIds: [...targetReleaseIds],
      },
    };
  }

  function modelConceptCandidates(
    elements: readonly CompiledModelElement[],
  ): { id: string; label: string; typeLabel: string }[] {
    return elements
      .filter(
        (element) =>
          element.lineage.kind === "concept" &&
          (element.lineage.semanticRole === "aow:plot" ||
            element.lineage.semanticRole === "aow:campaign-placement"),
      )
      .map((element) => ({
        id: element.lineage.id,
        label: element.revision.presentation.label.slice(0, 160),
        typeLabel:
          element.lineage.semanticRole === "aow:plot"
            ? "Plot concept"
            : "Campaign placement concept",
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "en"));
  }

  function buildMigrationImpact(
    draft: CampaignMigrationDraft,
    source: CampaignMigrationWorld,
    target: CampaignMigrationWorld,
    sourceRecords: ReadonlyMap<string, ManifestRecord>,
    targetRecords: ReadonlyMap<string, ManifestRecord>,
    changed: readonly ReturnType<typeof changeItem>[],
    removed: readonly ReturnType<typeof changeItem>[],
    authoredReferences: ReadonlySet<string>,
    requestedOffset: number,
    pageSize: number,
  ) {
    const offset = Math.max(0, requestedOffset);
    const locationMoves = changed.flatMap((item) => {
      if (item.resourceType !== "locations") return [];
      const before = sourceRecords.get(`locations\0${item.id}`);
      const after = targetRecords.get(`locations\0${item.id}`);
      const fromParentId = placementParent(before);
      const toParentId = placementParent(after);
      if (fromParentId === toParentId) return [];
      return [
        {
          locationName: item.name,
          fromParentName: fromParentId
            ? label(
                sourceRecords.get(`locations\0${fromParentId}`),
                "Former parent Location",
              )
            : "World root",
          toParentName: toParentId
            ? label(
                targetRecords.get(`locations\0${toParentId}`),
                "New parent Location",
              )
            : "World root",
        },
      ];
    });
    const affectedItems = [...changed, ...removed].filter((item) =>
      authoredReferences.has(item.id),
    );
    const affectedReferences = affectedItems.map((item) => ({
      name: item.name,
      typeLabel: item.typeLabel,
      change: removed.includes(item)
        ? ("removed" as const)
        : ("changed" as const),
    }));
    const affectedIds = new Set(affectedItems.map(({ id }) => id));
    const affectedPlots = readRecords(draft.snapshotRecords).flatMap(
      (record) => {
        if (record.resourceType !== "plots" || !isObject(record.payload))
          return [];
        const references = collectStrings(record.payload);
        const reasons = affectedItems
          .filter(({ id }) => references.has(id))
          .slice(0, 5)
          .map(({ name, typeLabel }) => `${typeLabel}: ${name}`);
        if (![...references].some((id) => affectedIds.has(id))) return [];
        return [{ plotName: label(record as ManifestRecord, "Plot"), reasons }];
      },
    );
    const sourceReleaseIds = revisionModelReleaseIds(source);
    const targetReleaseIds = revisionModelReleaseIds(target);
    const modelAdded = [...targetReleaseIds].filter(
      (id) => !sourceReleaseIds.has(id),
    );
    const modelRemoved = [...sourceReleaseIds].filter(
      (id) => !targetReleaseIds.has(id),
    );
    const releaseLabel = (id: string, row: CampaignMigrationWorld) => {
      const release = row.worldDefinitionRevision.modelSchemaSelections.find(
        (selection) => selection.modelSchemaReleaseId === id,
      )?.modelSchemaRelease;
      return release
        ? `${release.registry.name}: ${release.name} (revision ${release.revisionNumber})`
        : "Selected Model release";
    };
    const page = <T>(items: readonly T[]) =>
      items.slice(offset, offset + pageSize);
    return {
      offset,
      nextOffset:
        Math.max(
          locationMoves.length,
          affectedPlots.length,
          affectedReferences.length,
          modelAdded.length,
          modelRemoved.length,
        ) >
        offset + pageSize
          ? offset + pageSize
          : undefined,
      presentationTruncated: false,
      summary: {
        locationMoves: locationMoves.length,
        affectedPlots: affectedPlots.length,
        affectedReferences: affectedReferences.length,
        modelReleasesAdded: modelAdded.length,
        modelReleasesRemoved: modelRemoved.length,
      },
      locationMoves: page(locationMoves),
      affectedPlots: page(affectedPlots),
      affectedReferences: page(affectedReferences),
      modelReleases: {
        added: page(modelAdded).map((id) => ({
          name: releaseLabel(id, target),
        })),
        removed: page(modelRemoved).map((id) => ({
          name: releaseLabel(id, source),
        })),
      },
    };
  }

  function placementParent(
    record: ManifestRecord | undefined,
  ): string | undefined {
    if (
      !record ||
      !isObject(record.payload) ||
      !isObject(record.payload.placement)
    )
      return undefined;
    return typeof record.payload.placement.parentLocationId === "string"
      ? record.payload.placement.parentLocationId
      : undefined;
  }

  function revisionModelReleaseIds(
    row: CampaignMigrationWorld,
  ): ReadonlySet<string> {
    if (row.worldDefinitionRevision.modelSchemaSelections.length > 0) {
      return new Set(
        row.worldDefinitionRevision.modelSchemaSelections.map(
          ({ modelSchemaReleaseId }) => modelSchemaReleaseId,
        ),
      );
    }
    const revision = isCanonicalSnapshotManifest(row.manifest)
      ? row.manifest.records.find(
          (record) => record.resourceType === "world-definition-revision",
        )
      : undefined;
    if (
      !revision ||
      !isObject(revision.payload) ||
      !Array.isArray(revision.payload.modelSchemaReleaseIds)
    ) {
      return new Set();
    }
    return new Set(
      revision.payload.modelSchemaReleaseIds.filter(
        (id): id is string => typeof id === "string",
      ),
    );
  }
  type MigrationConflictSeed = MigrationConflict & {
    candidateResourceType?: string;
  };
  function keyed(records: readonly ManifestRecord[]) {
    return new Map(records.map((r) => [`${r.resourceType}\0${r.sourceId}`, r]));
  }
  function label(record: ManifestRecord | undefined, fallback: string) {
    if (!record || !isObject(record.payload)) return fallback;
    const identity = isObject(record.payload.identity)
      ? record.payload.identity
      : {};
    const name =
      typeof record.payload.name === "string"
        ? record.payload.name
        : identity.name;
    return typeof name === "string" && name.trim()
      ? name.trim().slice(0, 160)
      : fallback;
  }
  function changeItem(record: ManifestRecord) {
    return {
      id: record.sourceId,
      name: label(record, humanResourceType(record.resourceType)),
      resourceType: record.resourceType,
      typeLabel: humanResourceType(record.resourceType),
    };
  }
  function indexCandidates(records: ReadonlyMap<string, ManifestRecord>) {
    const result = new Map<
      string,
      { id: string; label: string; typeLabel: string }[]
    >();
    for (const record of records.values()) {
      const key = candidateIndexKey(record);
      const candidates = result.get(key) ?? [];
      candidates.push({
        id: record.sourceId,
        label: label(record, humanResourceType(record.resourceType)),
        typeLabel: humanResourceType(record.resourceType),
      });
      result.set(key, candidates);
    }
    for (const [resourceType, candidates] of result) {
      candidates.sort(
        (left, right) =>
          left.label.localeCompare(right.label, "en") ||
          left.id.localeCompare(right.id, "en"),
      );
      result.set(resourceType, candidates);
    }
    return result;
  }
  function candidateIndexKey(record: ManifestRecord | undefined): string {
    return record
      ? `${record.resourceType}\0${semanticRecordKind(record)}`
      : "unavailable";
  }
  function semanticRecordKind(record: ManifestRecord): string {
    if (!isObject(record.payload) || typeof record.payload.kind !== "string") {
      return record.resourceType;
    }
    if (record.resourceType === "world-placements") {
      const source = isObject(record.payload.source)
        ? record.payload.source
        : {};
      const sourceKind =
        typeof source.kind === "string" ? source.kind : "unknown";
      return `${record.resourceType}:${sourceKind}`;
    }
    return `${record.resourceType}:${record.payload.kind}`;
  }
  function collectStrings(value: unknown): Set<string> {
    const result = new Set<string>();
    const pending: unknown[] = [value];
    while (pending.length > 0) {
      const current = pending.pop();
      if (typeof current === "string") result.add(current);
      else if (Array.isArray(current)) {
        for (const child of current as unknown[]) pending.push(child);
      } else if (isObject(current)) {
        for (const child of Object.values(current)) pending.push(child);
      }
    }
    return result;
  }
  function humanResourceType(value: string) {
    const known: Record<string, string> = {
      locations: "Location",
      creatures: "Creature",
      definitions: "World content",
      "world-placements": "World placement",
    };
    return known[value] ?? "World content";
  }

  function worldSummary(
    row: CampaignMigrationWorld,
    includeContentHash = false,
  ) {
    return {
      snapshotId: row.id,
      worldDefinitionId: row.worldDefinitionId,
      worldDefinitionRevisionId: row.worldDefinitionRevisionId,
      worldName: row.worldDefinitionRevision.worldDefinition.name,
      revisionName: row.worldDefinitionRevision.name,
      revisionNumber: row.worldDefinitionRevision.revisionNumber,
      publishedAt: row.worldDefinitionRevision.publishedAt,
      ...(includeContentHash ? { snapshotContentHash: row.contentHash } : {}),
    };
  }

  function normalizeRecords(
    records: readonly CampaignDraftRecord[],
  ): CampaignDraftRecord[] {
    return records
      .map((record) => ({
        resourceType: record.resourceType.trim(),
        sourceId: record.sourceId.trim(),
        ...(record.sourceRevision === undefined
          ? {}
          : { sourceRevision: record.sourceRevision }),
        payload: record.payload,
      }))
      .sort((a, b) =>
        `${a.resourceType}\0${a.sourceId}`.localeCompare(
          `${b.resourceType}\0${b.sourceId}`,
          "en",
        ),
      );
  }

  function readRecords(value: unknown): CampaignDraftRecord[] {
    if (!Array.isArray(value))
      throw new TypeError("Campaign draft records are malformed.");
    const records: CampaignDraftRecord[] = value.map((record) => {
      if (
        !isObject(record) ||
        typeof record.resourceType !== "string" ||
        typeof record.sourceId !== "string" ||
        !("payload" in record)
      )
        throw new TypeError("Campaign draft records are malformed.");
      if (
        record.sourceRevision !== undefined &&
        (!Number.isInteger(record.sourceRevision) ||
          Number(record.sourceRevision) < 1)
      )
        throw new TypeError("Campaign draft records are malformed.");
      return {
        resourceType: record.resourceType,
        sourceId: record.sourceId,
        ...(typeof record.sourceRevision === "number"
          ? { sourceRevision: record.sourceRevision }
          : {}),
        payload: record.payload,
      };
    });
    return normalizeRecords(records);
  }

  return {
    buildPlan: buildCampaignWorldMigrationPlan,
    revisionModelReleaseIds,
    rewriteModelConformance,
    modelConceptCandidates,
  };
}

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
