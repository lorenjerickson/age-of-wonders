import type {
  CharacterDraft,
  CharacterOptions,
  CharacterSelections,
} from "./characterCreationModel";
import type { CreateInvitationRequest } from "./campaignParticipationModel";
import type {
  ApplyCampaignInstanceMigrationRequest,
  ApplyCampaignInstanceRestoreRequest,
  CampaignInstanceContinuationProjection,
  CampaignInstanceCreatureEmbodimentListProjection,
  CampaignInstanceDetailProjection,
  CampaignInstanceLifecycleRequest,
  CampaignInstanceLifecycleResult,
  CampaignInstanceListItemProjection,
  CampaignInstanceListProjection,
  CampaignInstanceMigrationPreviewProjection,
  CampaignInstanceMigrationResult,
  CampaignInstanceMutationResult,
  CampaignInstancePlacementCommandRequest,
  CampaignInstancePlacementListProjection,
  CampaignInstancePlotListProjection,
  CampaignInstancePreparationProjection,
  CampaignInstanceReadinessProjection,
  CampaignInstanceRestorePreviewRequest,
  CampaignInstanceRosterProjection,
  CampaignInstanceSessionListProjection,
  CampaignInstanceVersionListProjection,
  CampaignInstanceAgentCommandResult,
  CampaignInstanceAvailableAgentListProjection,
  CampaignInstanceInvitationActionResult,
  CampaignInstanceInvitationCommandResult,
  ConfigureCampaignInstanceAgentRequest,
  CreateCampaignInstanceInvitationRequest,
  CreateCampaignInstanceRequest,
  UpdateCampaignInstancePlotRequest,
  UpdateCampaignInstancePreparationRequest,
  UpdateCampaignInstanceAgentStatusRequest,
} from "@aow/common";

const apiUrl = "/api";

interface ApiError {
  message?: string | string[];
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type DomainResource =
  | "definitions"
  | "locations"
  | "campaigns"
  | "sessions"
  | "creatures"
  | "items"
  | "systems";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DomainRecord {
  resource: DomainResource;
  id: string;
  kind: string | null;
  name: string | null;
  revision: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DomainList {
  items: DomainRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface CapturedWorldSummary {
  snapshotId: string;
  worldDefinitionId: string;
  worldDefinitionRevisionId: string;
  revisionNumber: number;
  name?: string;
  worldName?: string;
  revisionName?: string;
  publishedAt?: string;
}

export interface WorldDefinitionRevisionSummary {
  id: string;
  revisionNumber: number;
  name: string;
  contentHash: string;
  publishedAt: string;
  snapshotId?: string;
}

export interface WorldDefinitionSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  archivedAt?: string;
  updatedAt: string;
  currentRevision?: WorldDefinitionRevisionSummary;
  draft?: {
    storageRevision: number;
    revisionName: string;
    validationStatus: string;
    validatedStorageRevision?: number;
    isCurrentBase: boolean;
    hasUnpublishedChanges?: boolean;
  };
  downstreamCampaignCount?: number;
  metadataRevision?: number;
}

export interface WorldDraftRecord {
  resourceType: string;
  sourceId: string;
  sourceRevision?: number;
  payload: JsonValue;
}

export interface WorldModelOption {
  key: string;
  name: string;
  description?: string;
  sourceLabel?: string;
  elementId?: string;
  registryId?: string;
  semanticRole?: string;
  sourceReleaseId?: string;
  payload?: Record<string, JsonValue>;
}

export interface EffectiveModelElementResponse {
  id: string;
  registryId: string;
  key: string;
  kind: string;
  semanticRole: string;
  status: string;
  sourceReleaseId?: string;
  currentRevision?: {
    presentation?: Record<string, JsonValue>;
    payload?: Record<string, JsonValue>;
  };
}

export interface EffectiveWorldModelResponse {
  releases: Array<{
    id: string;
    registryId: string;
    name: string;
    registryName: string;
    revisionNumber: number;
    contentHash: string;
  }>;
  attributes: EffectiveModelElementResponse[];
  equipmentSlots: EffectiveModelElementResponse[];
  elements: EffectiveModelElementResponse[];
}

export interface EffectiveWorldModels {
  attributes: WorldModelOption[];
  equipmentSlots: WorldModelOption[];
  itemFamilies: WorldModelOption[];
  selectedReleaseNames?: string[];
  elements?: WorldModelOption[];
  releases?: Array<{
    id: string;
    registryId: string;
    name: string;
    registryName: string;
    revisionNumber: number;
  }>;
}

export interface ModelRegistrySummary {
  identity: { id: string; version: { revision: number; updatedAt: string } };
  key: string;
  name: string;
  description?: string;
  provenance: { kind: string; [key: string]: JsonValue | undefined };
}

export interface ModelRegistryDetail extends ModelRegistrySummary {
  releases: Array<{
    identity: {
      id: string;
      lineageId: string;
      revisionNumber: number;
      predecessorRevisionId?: string;
      publishedAt: string;
    };
    name: string;
    dependencies?: Array<{ releaseId: string }>;
  }>;
}

export interface WorldDefinitionDraft {
  id?: string;
  worldDefinitionId?: string;
  storageRevision: number;
  revisionName: string;
  baseRevisionId?: string;
  baseRevisionNumber?: number;
  status?: "current" | "stale";
  validationStatus?: string;
  validatedStorageRevision?: number;
  content: Record<string, JsonValue>;
  records: WorldDraftRecord[];
  effectiveModels?: EffectiveWorldModels;
  updatedAt?: string;
}

export interface WorldDraftImpact {
  draftStorageRevision: number;
  changes: { added: number; changed: number; removed: number };
  downstreamCampaigns: Array<{
    name: string;
    eligibility: "eligible-after-publication" | "not-direct-successor";
  }>;
}

export interface WorldDefinitionList {
  items: WorldDefinitionSummary[];
  total: number;
}

export interface WorldDefinitionDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  currentRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  metadataRevision?: number;
  revisions: Array<
    WorldDefinitionRevisionSummary & {
      predecessorRevisionId?: string;
      content: JsonValue;
      createdAt: string;
      snapshots: Array<{
        id: string;
        manifest: JsonValue;
        contentHash: string;
        capturedAt: string;
      }>;
    }
  >;
}

export interface CampaignDefinitionSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  archivedAt?: string;
  updatedAt: string;
  currentRevision?: {
    id: string;
    revisionNumber: number;
    name: string;
    contentHash: string;
    publishedAt: string;
    capturedWorld: CapturedWorldSummary;
  };
  draft?: {
    storageRevision: number;
    revisionName: string;
    validationStatus: string;
    validatedStorageRevision?: number;
    hasUnpublishedChanges: boolean;
  };
  availableWorldMigration?: {
    worldName: string;
    revisionNumber: number;
  };
  metadataRevision?: number;
}

export interface CampaignDefinitionList {
  items: CampaignDefinitionSummary[];
  total: number;
}

export interface CampaignDefinitionDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  currentRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  revisions?: Array<
    NonNullable<CampaignDefinitionSummary["currentRevision"]> & {
      predecessorRevisionId?: string;
      reason?: string;
      createdAt?: string;
      snapshot?: { id: string; contentHash: string; capturedAt: string };
    }
  >;
  metadataRevision?: number;
}

export interface CampaignDefinitionDraft {
  id?: string;
  campaignDefinitionId?: string;
  baseRevisionId?: string;
  baseSnapshotId?: string;
  capturedWorldSnapshotId?: string;
  capturedWorld: CapturedWorldSummary;
  capturedWorldContent?: {
    locations: Array<{
      id: string;
      name: string;
      kind?: string;
      parentLocationId?: string;
    }>;
    creatures: Array<{ id: string; name: string; kind?: string }>;
    items: Array<{ id: string; name: string; kind?: string }>;
    placements: Array<{
      id: string;
      name: string;
      kind?: string;
      locationId?: string;
    }>;
  };
  revisionName: string;
  content: Record<string, JsonValue>;
  records: Array<{
    resourceType: string;
    sourceId: string;
    sourceRevision?: number;
    payload: JsonValue;
  }>;
  storageRevision: number;
  validationStatus: string;
  validatedStorageRevision?: number;
  validationReport?: JsonValue;
  createdAt?: string;
  updatedAt?: string;
  status?: "current" | "stale";
}

export interface CampaignMigrationPreview {
  planHash: string;
  sourceWorld: CapturedWorldSummary;
  targetWorld: CapturedWorldSummary;
  changes: {
    added: Array<{ name: string; resourceType: string; typeLabel: string }>;
    changed: Array<{ name: string; resourceType: string; typeLabel: string }>;
    removed: Array<{ name: string; resourceType: string; typeLabel: string }>;
  };
  changeSummary: {
    added: number;
    changed: number;
    removed: number;
    returned: { added: number; changed: number; removed: number };
    offset: number;
    nextOffset?: number;
    truncated: boolean;
  };
  conflicts: Array<{
    code: string;
    subject: string;
    detail: string;
    source?: { resourceType: string; id: string };
    sourceLabel?: string;
    candidates?: Array<{ id: string; label: string; typeLabel: string }>;
    candidateSummary?: {
      total: number;
      returned: number;
      offset: number;
      truncated: boolean;
    };
  }>;
  conflictSummary?: {
    total: number;
    returned: number;
    offset: number;
    nextOffset?: number;
    truncated: boolean;
  };
  impact: {
    offset: number;
    nextOffset?: number;
    presentationTruncated: boolean;
    summary: {
      locationMoves: number;
      affectedPlots: number;
      affectedReferences: number;
      modelReleasesAdded: number;
      modelReleasesRemoved: number;
    };
    locationMoves: Array<{
      locationName: string;
      fromParentName: string;
      toParentName: string;
    }>;
    affectedPlots: Array<{ plotName: string; reasons: string[] }>;
    affectedReferences: Array<{
      name: string;
      typeLabel: string;
      change: "changed" | "removed";
    }>;
    modelReleases: {
      added: Array<{ name: string }>;
      removed: Array<{ name: string }>;
    };
  };
  presentationTruncated?: boolean;
  ready: boolean;
}

export interface CampaignDraftImpact {
  draftStorageRevision: number;
  changes: { added: number; changed: number; removed: number };
  downstreamInstances: Array<{ name: string; status: string }>;
}

export interface CapturedDefinitionSummary {
  revisionNumber: number;
  name: string;
}

export type CampaignInstanceSummary = CampaignInstanceListItemProjection;
export type CampaignInstanceList = CampaignInstanceListProjection;
export type CampaignInstanceDetail = CampaignInstanceDetailProjection;
export type CampaignInstanceReadiness = CampaignInstanceReadinessProjection;
export type CampaignInstanceContinuation = CampaignInstanceContinuationProjection;

export type CampaignInstancePreparation = CampaignInstancePreparationProjection;
export type CampaignInstancePlotProjection = CampaignInstancePlotListProjection;
export type CampaignInstancePlacementProjection = CampaignInstancePlacementListProjection;
export type CampaignInstanceRoster = CampaignInstanceRosterProjection;
export type CampaignInstanceAvailableAgents = CampaignInstanceAvailableAgentListProjection;
export type CampaignInstanceSessions = CampaignInstanceSessionListProjection;

export type CampaignInstanceVersions = CampaignInstanceVersionListProjection;
export type CampaignInstanceMigrationPreview = CampaignInstanceMigrationPreviewProjection;

export interface MediaAsset {
  id: string;
  originalName: string;
  mimeType: string;
  mediaType: string;
  purpose: string;
  size: number;
  tags: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new ApiRequestError(
      message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface CurrentUser {
  displayName: string;
  role: "gm" | "player" | "spectator";
}

export interface CampaignParticipant {
  id: string;
  displayName: string;
  role: "gm" | "player" | "spectator";
  status: string;
}

export interface InvitationDelivery {
  channel: "email" | "sms";
  destinationLabel?: string;
  status: string;
}

export interface CampaignInvitation {
  id: string;
  displayName: string;
  role: "player" | "spectator";
  status: string;
  deliveries: InvitationDelivery[];
  expiresAt?: string;
}

export interface PublicCampaignInvitation {
  campaignName: string;
  role: "player" | "spectator";
  invitedName?: string;
  displayName?: string;
  status?: "pending" | "accepted" | string;
  playerIntroduction?: string;
}

export function loginAsGm(token: string) {
  return request<{ user: CurrentUser }>("/auth/gm-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function getCurrentUser() {
  return request<{ user: CurrentUser }>("/auth/me");
}

export function listWorldDefinitions() {
  return request<WorldDefinitionList>("/world-definitions");
}

export function getWorldDefinition(worldDefinitionId: string) {
  return request<WorldDefinitionDetail>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}`,
  );
}

export function createWorldDefinitionDraft(input: {
  name: string;
  description?: string;
  content?: Record<string, JsonValue>;
  records?: WorldDraftRecord[];
}) {
  return request<WorldDefinitionSummary & { draft: WorldDefinitionDraft }>(
    "/world-definitions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getWorldDefinitionDraft(worldDefinitionId: string) {
  return request<WorldDefinitionDraft>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft`,
  );
}

export function startWorldDefinitionDraft(
  worldDefinitionId: string,
  baseRevisionId: string,
) {
  return request<WorldDefinitionDraft>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevisionId }),
    },
  );
}

export function getEffectiveWorldModels(worldDefinitionId: string) {
  return request<EffectiveWorldModelResponse>(
    `/model-registries/effective?worldDefinitionId=${encodeURIComponent(worldDefinitionId)}`,
  );
}

export function listModelRegistries() {
  return request<{ items: ModelRegistrySummary[]; total: number }>(
    "/model-registries",
  );
}

export function createModelRegistry(input: {
  key: string;
  name: string;
  description?: string;
}) {
  return request<ModelRegistrySummary>("/model-registries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getModelRegistry(registryId: string) {
  return request<ModelRegistryDetail>(
    `/model-registries/${encodeURIComponent(registryId)}`,
  );
}

export function extendModelRegistryRelease(
  registryId: string,
  input: {
    name: string;
    predecessorRevisionId?: string;
    elements: Array<{
      key: string;
      kind: "vocabulary-option";
      semanticRole: string;
      applicability: Record<string, JsonValue>;
      payload: Record<string, JsonValue>;
      presentation: Record<string, JsonValue>;
    }>;
  },
) {
  return request<{
    release: {
      identity: {
        id: string;
        lineageId: string;
        revisionNumber: number;
        predecessorRevisionId?: string;
      };
      name: string;
      dependencies?: Array<{ releaseId: string }>;
    };
    addedElements: Array<{ id: string; key: string }>;
  }>(`/model-registries/${encodeURIComponent(registryId)}/releases/extend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function saveWorldDefinitionDraft(
  worldDefinitionId: string,
  draft: Pick<
    WorldDefinitionDraft,
    "storageRevision" | "revisionName" | "content" | "records"
  >,
) {
  return request<WorldDefinitionDraft>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedStorageRevision: draft.storageRevision,
        revisionName: draft.revisionName,
        content: draft.content,
        records: draft.records,
      }),
    },
  );
}

export function getWorldDraftImpact(worldDefinitionId: string) {
  return request<WorldDraftImpact>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft/impact`,
  );
}

export function validateWorldDefinitionDraft(
  worldDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<{
    valid: boolean;
    issues: Array<{ code: string; subject: string; detail: string }>;
  }>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

export function publishWorldDefinitionDraft(
  worldDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<
    WorldDefinitionRevisionSummary & {
      snapshot?: { id: string; capturedAt: string };
    }
  >(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/draft/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

function worldLifecycleAction(
  worldDefinitionId: string,
  action: "archive" | "restore",
  expectedMetadataRevision: number,
) {
  return request<WorldDefinitionSummary>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedMetadataRevision }),
    },
  );
}

export const archiveWorldDefinition = (
  worldDefinitionId: string,
  expectedMetadataRevision: number,
) =>
  worldLifecycleAction(worldDefinitionId, "archive", expectedMetadataRevision);
export const restoreWorldDefinition = (
  worldDefinitionId: string,
  expectedMetadataRevision: number,
) =>
  worldLifecycleAction(worldDefinitionId, "restore", expectedMetadataRevision);
export function forkWorldDefinition(
  worldDefinitionId: string,
  input: { sourceSnapshotId: string; name: string; description?: string },
) {
  return request<WorldDefinitionSummary & { draft: WorldDefinitionDraft }>(
    `/world-definitions/${encodeURIComponent(worldDefinitionId)}/forks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function listCampaignDefinitions() {
  return request<CampaignDefinitionList>("/campaign-definitions");
}

export function getCampaignDefinition(campaignDefinitionId: string) {
  return request<CampaignDefinitionDetail>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}`,
  );
}

export function createCampaignDefinition(input: {
  name: string;
  description?: string;
  worldDefinitionSnapshotId: string;
}) {
  return request<{
    id: string;
    name: string;
    description?: string;
    metadataRevision: number;
    draft: CampaignDefinitionDraft;
  }>("/campaign-definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getCampaignDefinitionDraft(campaignDefinitionId: string) {
  return request<CampaignDefinitionDraft>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft`,
  );
}

export function startCampaignDefinitionDraft(
  campaignDefinitionId: string,
  baseRevisionId: string,
) {
  return request<CampaignDefinitionDraft>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevisionId }),
    },
  );
}

export function saveCampaignDefinitionDraft(
  campaignDefinitionId: string,
  draft: Pick<
    CampaignDefinitionDraft,
    "storageRevision" | "revisionName" | "content" | "records"
  >,
) {
  return request<CampaignDefinitionDraft>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedStorageRevision: draft.storageRevision,
        revisionName: draft.revisionName,
        content: draft.content,
        records: draft.records,
      }),
    },
  );
}

export function resetCampaignDefinitionDraft(
  campaignDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<CampaignDefinitionDraft>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft/reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

export function getCampaignDefinitionDraftImpact(campaignDefinitionId: string) {
  return request<CampaignDraftImpact>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft/impact`,
  );
}

export function forkCampaignDefinition(
  campaignDefinitionId: string,
  input: { sourceSnapshotId: string; name: string; description?: string },
) {
  return request<{
    id: string;
    name: string;
    description?: string;
    metadataRevision: number;
    draft: CampaignDefinitionDraft;
    forkedFrom?: { revisionName: string };
  }>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/forks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function validateCampaignDefinitionDraft(
  campaignDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<{
    valid: boolean;
    issues: Array<{ code: string; subject: string; detail: string }>;
  }>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

export function publishCampaignDefinitionDraft(
  campaignDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<NonNullable<CampaignDefinitionSummary["currentRevision"]>>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/draft/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

function campaignLifecycleAction(
  campaignDefinitionId: string,
  action: "archive" | "restore",
  expectedMetadataRevision: number,
) {
  return request<CampaignDefinitionSummary>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedMetadataRevision }),
    },
  );
}

export const archiveCampaignDefinition = (
  campaignDefinitionId: string,
  expectedMetadataRevision: number,
) =>
  campaignLifecycleAction(
    campaignDefinitionId,
    "archive",
    expectedMetadataRevision,
  );

export const restoreCampaignDefinition = (
  campaignDefinitionId: string,
  expectedMetadataRevision: number,
) =>
  campaignLifecycleAction(
    campaignDefinitionId,
    "restore",
    expectedMetadataRevision,
  );

export function previewCampaignWorldMigration(
  campaignDefinitionId: string,
  input: {
    expectedStorageRevision: number;
    targetWorldDefinitionSnapshotId: string;
    mappings?: Array<{
      resourceType: string;
      sourceId: string;
      targetId: string;
    }>;
    conflictOffset?: number;
    candidateOffset?: number;
    impactOffset?: number;
    changeOffset?: number;
  },
) {
  return request<CampaignMigrationPreview>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/world-migrations/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function applyCampaignWorldMigration(
  campaignDefinitionId: string,
  input: Parameters<typeof previewCampaignWorldMigration>[1] & {
    expectedPlanHash: string;
  },
) {
  return request<NonNullable<CampaignDefinitionSummary["currentRevision"]>>(
    `/campaign-definitions/${encodeURIComponent(campaignDefinitionId)}/world-migrations/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function listCampaignInstances() {
  return request<CampaignInstanceList>("/campaign-instances");
}

export function getCampaignInstance(campaignInstanceId: string) {
  return request<CampaignInstanceDetail>(
    `/campaign-instances/${encodeURIComponent(campaignInstanceId)}`,
  );
}

export function createCampaignInstance(input: CreateCampaignInstanceRequest) {
  return request<CampaignInstanceDetail>("/campaign-instances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      name: input.name,
      campaignDefinitionSnapshotId: input.campaignDefinitionSnapshotId,
      idempotencyKey: input.idempotencyKey,
    }),
  });
}

const instancePath = (campaignInstanceId: string, suffix: string) =>
  `/campaign-instances/${encodeURIComponent(campaignInstanceId)}${suffix}`;

export function validateCampaignInstance(campaignInstanceId: string) {
  return request<CampaignInstanceReadiness>(
    instancePath(campaignInstanceId, "/validate"),
    {
      method: "POST",
    },
  );
}

export function updateCampaignInstanceLifecycle(
  campaignInstanceId: string,
  input: CampaignInstanceLifecycleRequest,
) {
  return request<CampaignInstanceLifecycleResult>(
    instancePath(campaignInstanceId, "/lifecycle"),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstancePreparation(campaignInstanceId: string) {
  return request<CampaignInstancePreparation>(
    instancePath(campaignInstanceId, "/preparation"),
  );
}

export function saveCampaignInstancePreparation(
  campaignInstanceId: string,
  input: UpdateCampaignInstancePreparationRequest,
) {
  return request<CampaignInstancePreparation>(
    instancePath(campaignInstanceId, "/preparation"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstancePlots(campaignInstanceId: string) {
  return request<CampaignInstancePlotProjection>(
    instancePath(campaignInstanceId, "/plots"),
  );
}

export function updateCampaignInstancePlot(
  campaignInstanceId: string,
  plotDefinitionId: string,
  input: UpdateCampaignInstancePlotRequest,
) {
  return request<CampaignInstanceMutationResult>(
    instancePath(
      campaignInstanceId,
      `/plots/${encodeURIComponent(plotDefinitionId)}`,
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstancePlacements(campaignInstanceId: string) {
  return request<CampaignInstancePlacementProjection>(
    instancePath(campaignInstanceId, "/placements"),
  );
}

export function getCampaignInstanceEmbodiments(campaignInstanceId: string) {
  return request<CampaignInstanceCreatureEmbodimentListProjection>(
    instancePath(campaignInstanceId, "/embodiments"),
  );
}

export function decideCampaignInstancePlacement(
  campaignInstanceId: string,
  realizationId: string,
  input: CampaignInstancePlacementCommandRequest,
) {
  return request<CampaignInstanceMutationResult>(
    instancePath(
      campaignInstanceId,
      `/placements/${encodeURIComponent(realizationId)}/${input.action}`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstanceRoster(campaignInstanceId: string) {
  return request<CampaignInstanceRoster>(
    instancePath(campaignInstanceId, "/roster"),
  );
}

export function getCampaignInstanceAvailableAgents(campaignInstanceId: string) {
  return request<CampaignInstanceAvailableAgents>(
    instancePath(campaignInstanceId, "/available-agents"),
  );
}

export function createCampaignInstanceInvitation(
  campaignInstanceId: string,
  input: CreateCampaignInstanceInvitationRequest,
) {
  return request<CampaignInstanceInvitationCommandResult>(
    instancePath(campaignInstanceId, "/invitations"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function updateCampaignInstanceInvitation(
  campaignInstanceId: string,
  invitationId: string,
  action: "retry" | "revoke",
) {
  return request<CampaignInstanceInvitationActionResult>(
    instancePath(campaignInstanceId, `/invitations/${encodeURIComponent(invitationId)}${action === "retry" ? "/retry" : ""}`),
    { method: action === "retry" ? "POST" : "DELETE" },
  );
}

export function configureCampaignInstanceAgent(
  campaignInstanceId: string,
  input: ConfigureCampaignInstanceAgentRequest,
) {
  return request<CampaignInstanceAgentCommandResult>(
    instancePath(campaignInstanceId, "/agents"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function updateCampaignInstanceAgent(
  campaignInstanceId: string,
  agentParticipationId: string,
  input: UpdateCampaignInstanceAgentStatusRequest,
) {
  return request<CampaignInstanceAgentCommandResult>(
    instancePath(
      campaignInstanceId,
      `/agents/${encodeURIComponent(agentParticipationId)}`,
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstanceSessions(campaignInstanceId: string) {
  return request<CampaignInstanceSessions>(
    instancePath(campaignInstanceId, "/sessions"),
  );
}

export function getCampaignInstanceContinuation(campaignInstanceId: string) {
  return request<CampaignInstanceContinuation>(
    instancePath(campaignInstanceId, "/continuation"),
  );
}

export function getCampaignInstanceVersions(campaignInstanceId: string) {
  return request<CampaignInstanceVersions>(
    instancePath(campaignInstanceId, "/versions"),
  );
}

export function previewCampaignInstanceMigration(
  campaignInstanceId: string,
  input: import("@aow/common").CampaignInstanceMigrationPreviewRequest,
) {
  return request<CampaignInstanceMigrationPreview>(
    instancePath(campaignInstanceId, "/migrations/preview"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function applyCampaignInstanceMigration(
  campaignInstanceId: string,
  input: ApplyCampaignInstanceMigrationRequest,
) {
  return request<CampaignInstanceMigrationResult>(
    instancePath(campaignInstanceId, "/migrations/apply"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function previewCampaignInstanceRestore(
  campaignInstanceId: string,
  input: CampaignInstanceRestorePreviewRequest,
) {
  return request<CampaignInstanceMigrationPreview>(
    instancePath(campaignInstanceId, "/restores/preview"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function applyCampaignInstanceRestore(
  campaignInstanceId: string,
  input: ApplyCampaignInstanceRestoreRequest,
) {
  return request<CampaignInstanceMigrationResult>(
    instancePath(campaignInstanceId, "/restores/apply"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function listCampaignParticipants(campaignId: string) {
  return request<{ participants: CampaignParticipant[] }>(
    `/campaigns/${encodeURIComponent(campaignId)}/participants`,
  );
}

export function listCampaignInvitations(campaignId: string) {
  return request<CampaignInvitation[]>(
    `/campaigns/${encodeURIComponent(campaignId)}/invitations`,
  );
}

export function createCampaignInvitation(
  campaignId: string,
  invitation: CreateInvitationRequest,
) {
  return request<{
    invitation: CampaignInvitation;
    developmentJoinUrl?: string;
  }>(`/campaigns/${encodeURIComponent(campaignId)}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...invitation,
      role: invitation.role.toUpperCase(),
      channels: invitation.channels.map((channel) => channel.toUpperCase()),
    }),
  });
}

export function retryCampaignInvitation(
  campaignId: string,
  invitationId: string,
) {
  return request<{
    invitation: CampaignInvitation;
    developmentJoinUrl?: string;
  }>(
    `/campaigns/${encodeURIComponent(campaignId)}/invitations/${encodeURIComponent(invitationId)}/reissue`,
    { method: "POST" },
  );
}

export function revokeCampaignInvitation(
  campaignId: string,
  invitationId: string,
) {
  return request<void>(
    `/campaigns/${encodeURIComponent(campaignId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export function exchangeCampaignInvitation(token: string) {
  return request<PublicCampaignInvitation>("/campaign-invitations/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function acceptCampaignInvitation(token: string) {
  return request<{ draftId?: string }>("/campaign-invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function listPlayerCharacters() {
  return request<RawCharacterDraft[]>("/character-drafts").then(
    (characters) => ({ characters: characters.map(characterDraftFromApi) }),
  );
}

export function createPlayerCharacter(name: string) {
  return request<RawCharacterDraft>("/character-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((character) => ({ character: characterDraftFromApi(character) }));
}

export function getPlayerCharacter(characterId: string) {
  return request<RawCharacterDraft>(
    `/character-drafts/${encodeURIComponent(characterId)}`,
  ).then((character) => ({ character: characterDraftFromApi(character) }));
}

export function getCharacterOptions(characterId: string) {
  return request<CharacterOptions>(
    `/character-drafts/${encodeURIComponent(characterId)}/options`,
  );
}

export function updatePlayerCharacterSelections(
  character: CharacterDraft,
  selections: CharacterSelections,
  name?: string,
) {
  return request<RawCharacterDraft>(
    `/character-drafts/${encodeURIComponent(character.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        backgroundDefinitionId: selections.backgroundId,
        professionDefinitionId: selections.professionId,
        heritageDefinitionIds: selections.heritageIds,
        expectedRevision: character.revision,
      }),
    },
  ).then((updated) => ({ character: characterDraftFromApi(updated) }));
}

interface RawCharacterDraft {
  id: string;
  revision: number;
  name?: string | null;
  status: string;
  backgroundDefinitionId?: string | null;
  professionDefinitionId?: string | null;
  heritageDefinitionIds?: unknown;
  updatedAt?: string;
}

function characterDraftFromApi(draft: RawCharacterDraft): CharacterDraft {
  return {
    id: draft.id,
    name: draft.name ?? undefined,
    status: draft.status.toLowerCase().replaceAll("_", "-"),
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    selections: {
      backgroundId: draft.backgroundDefinitionId ?? undefined,
      professionId: draft.professionDefinitionId ?? undefined,
      heritageIds: Array.isArray(draft.heritageDefinitionIds)
        ? draft.heritageDefinitionIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    },
  };
}

export function checkHealth() {
  return request<{ status: string; database: string }>("/health");
}

export function listDomainRecords(
  resource: DomainResource,
  options: {
    kind?: string;
    worldId?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    order?: string;
  } = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return request<DomainList>(`/domain/${resource}?${query.toString()}`);
}

export function getDomainRecord(resource: DomainResource, id: string) {
  return request<DomainRecord>(`/domain/${resource}/${encodeURIComponent(id)}`);
}

export function replaceDomainRecord(record: DomainRecord, data: object) {
  return request<DomainRecord>(
    `/domain/${record.resource}/${encodeURIComponent(record.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, expectedRevision: record.revision }),
    },
  );
}

export function createDomainRecord(
  resource: DomainResource,
  data: Record<string, unknown>,
) {
  return request<DomainRecord>(`/domain/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
}

export function uploadMedia(file: File, purpose: string, tags: string[] = []) {
  const query = new URLSearchParams({ purpose });
  if (tags.length) query.set("tags", tags.join(","));
  const body = new FormData();
  body.append("file", file);
  return request<MediaAsset>(`/media?${query.toString()}`, {
    method: "POST",
    body,
  });
}

export function getMediaDownloadUrl(id: string) {
  return request<{ url: string; expiresIn: number }>(
    `/media/${encodeURIComponent(id)}/download`,
  );
}

export function deleteMedia(id: string) {
  return request<void>(`/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createWorldWithAi(prompt: string) {
  return request<{ world: DomainRecord }>("/ai/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export function createCampaignDefinitionDraftProposal(
  worldDefinitionSnapshotId: string,
  prompt: string,
) {
  return request<{
    draftProposal: {
      content: Record<string, JsonValue>;
      records: CampaignDefinitionDraft["records"];
    };
  }>(
    `/ai/world-definition-snapshots/${encodeURIComponent(worldDefinitionSnapshotId)}/campaign-definition-draft-proposals`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}

export function deleteWorld(id: string) {
  return request<void>(`/worlds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createLocationWithAi(
  parentId: string,
  prompt: string,
  mapPosition?: { x: number; y: number },
) {
  return request<{ location: DomainRecord }>(
    `/ai/locations/${encodeURIComponent(parentId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        ...(mapPosition ? { mapX: mapPosition.x, mapY: mapPosition.y } : {}),
      }),
    },
  );
}

export function createCreatureWithAi(worldId: string, prompt: string) {
  return request<{ creature: DomainRecord }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/creatures`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}

export function createItemWithAi(worldId: string, prompt: string) {
  return request<{ definition: DomainRecord }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}

export function createWeaponWithAi(worldId: string, prompt: string) {
  return request<{ definition: DomainRecord }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/weapons`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}

export function generateItemImageWithAi(worldId: string, itemId: string) {
  return request<{ definition: DomainRecord }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/items/${encodeURIComponent(itemId)}/image`,
    { method: "POST" },
  );
}

export function createArmorSetWithAi(
  worldId: string,
  creatureId: string,
  prompt = "",
) {
  return request<{
    creature: DomainRecord;
    definitions: DomainRecord[];
    items: DomainRecord[];
  }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/creatures/${encodeURIComponent(creatureId)}/armor-set`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}

export function generateLocationMap(locationId: string, prompt?: string) {
  return request<{ location: DomainRecord }>(
    `/ai/locations/${encodeURIComponent(locationId)}/map`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
}
