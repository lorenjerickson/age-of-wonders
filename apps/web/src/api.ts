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
  CampaignSessionDetailProjection,
  CampaignSessionReadinessProjection,
  CampaignSessionLifecycleRequest,
  CreateCampaignSessionRequest,
  UpdateCampaignSessionRequest,
  UpdateCampaignSessionParticipantsRequest,
  UpdateCampaignSessionSummaryRequest,
  CampaignSessionSummaryProjection,
  PlayerDetailProjection,
  PlayerDirectoryProjection,
  PlayerServerStanding,
  ChangeCampaignInstanceMembershipStatusRequest,
  CreateCampaignInstanceCharacterRequest,
  ChangeCampaignInstanceCharacterStatusRequest,
  SelectCampaignInstanceCharacterRequest,
  ImportCampaignInstanceCharacterRequest,
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
export type CampaignInstanceContinuation =
  CampaignInstanceContinuationProjection;

export type CampaignInstancePreparation = CampaignInstancePreparationProjection;
export type CampaignInstancePlotProjection = CampaignInstancePlotListProjection;
export type CampaignInstancePlacementProjection =
  CampaignInstancePlacementListProjection;
export type CampaignInstanceRoster = CampaignInstanceRosterProjection;
export type CampaignInstanceAvailableAgents =
  CampaignInstanceAvailableAgentListProjection;
export type CampaignInstanceSessions = CampaignInstanceSessionListProjection;
export type CampaignSessionDetail = CampaignSessionDetailProjection;
export type CampaignSessionReadiness = CampaignSessionReadinessProjection;
export type CampaignSessionSummary = CampaignSessionSummaryProjection;

export type CampaignInstanceVersions = CampaignInstanceVersionListProjection;
export type CampaignInstanceMigrationPreview =
  CampaignInstanceMigrationPreviewProjection;

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
  role: "gm" | "administrator" | "player" | "spectator";
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
  return request<{ user: CurrentUser }>("/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function getBootstrapStatus() {
  return request<{ setupRequired: boolean }>("/auth/bootstrap");
}

export function establishAdministrator(input: {
  token: string;
  displayName: string;
  email: string;
  phone: string;
  grantGameMaster: boolean;
}) {
  return request<{ user: CurrentUser }>("/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function listPlayers(
  options: {
    standing?: PlayerServerStanding;
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (options.standing) query.set("standing", options.standing);
  if (options.q) query.set("q", options.q);
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  return request<PlayerDirectoryProjection>(`/players?${query}`);
}

export function getPlayer(playerId: string) {
  return request<PlayerDetailProjection>(
    `/players/${encodeURIComponent(playerId)}`,
  );
}

export function changePlayerStanding(
  playerId: string,
  expectedStanding: PlayerServerStanding,
  targetStanding: PlayerServerStanding,
) {
  return request<{ displayName: string; standing: PlayerServerStanding }>(
    `/players/${encodeURIComponent(playerId)}/actions/change-standing`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStanding, targetStanding }),
    },
  );
}

export function getCurrentUser() {
  return request<{ user: CurrentUser }>("/auth/me");
}

export function listWorldDefinitions() {
  return request<WorldDefinitionList>("/worlds");
}

export function getWorldDefinition(worldDefinitionId: string) {
  return request<WorldDefinitionDetail>(
    `/worlds/${encodeURIComponent(worldDefinitionId)}`,
  );
}

export function createWorldDefinitionDraft(input: {
  name: string;
  description?: string;
  content?: Record<string, JsonValue>;
  records?: WorldDraftRecord[];
}) {
  return request<WorldDefinitionSummary & { draft: WorldDefinitionDraft }>(
    "/worlds",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getWorldDefinitionDraft(worldDefinitionId: string) {
  return request<WorldDefinitionDraft>(
    `/worlds/${encodeURIComponent(worldDefinitionId)}/draft`,
  );
}

export function startWorldDefinitionDraft(
  worldDefinitionId: string,
  baseRevisionId: string,
) {
  return request<WorldDefinitionDraft>(
    `/worlds/${encodeURIComponent(worldDefinitionId)}/draft`,
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
    `/worlds/${encodeURIComponent(worldDefinitionId)}/draft`,
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
    `/worlds/${encodeURIComponent(worldDefinitionId)}/draft/impact`,
  );
}

export function validateWorldDefinitionDraft(
  worldDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<{
    valid: boolean;
    issues: Array<{ code: string; subject: string; detail: string }>;
  }>(`/worlds/${encodeURIComponent(worldDefinitionId)}/draft/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedStorageRevision }),
  });
}

export function publishWorldDefinitionDraft(
  worldDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<
    WorldDefinitionRevisionSummary & {
      snapshot?: { id: string; capturedAt: string };
    }
  >(`/worlds/${encodeURIComponent(worldDefinitionId)}/draft/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedStorageRevision }),
  });
}

function worldLifecycleAction(
  worldDefinitionId: string,
  action: "archive" | "restore",
  expectedMetadataRevision: number,
) {
  return request<WorldDefinitionSummary>(
    `/worlds/${encodeURIComponent(worldDefinitionId)}/${action}`,
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
    `/worlds/${encodeURIComponent(worldDefinitionId)}/forks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function listCampaignDefinitions() {
  return request<CampaignDefinitionList>("/campaigns");
}

export function getCampaignDefinition(campaignDefinitionId: string) {
  return request<CampaignDefinitionDetail>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}`,
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
  }>("/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getCampaignDefinitionDraft(campaignDefinitionId: string) {
  return request<CampaignDefinitionDraft>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft`,
  );
}

export function startCampaignDefinitionDraft(
  campaignDefinitionId: string,
  baseRevisionId: string,
) {
  return request<CampaignDefinitionDraft>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft`,
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
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft`,
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
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft/reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedStorageRevision }),
    },
  );
}

export function getCampaignDefinitionDraftImpact(campaignDefinitionId: string) {
  return request<CampaignDraftImpact>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft/impact`,
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
  }>(`/campaigns/${encodeURIComponent(campaignDefinitionId)}/forks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function validateCampaignDefinitionDraft(
  campaignDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<{
    valid: boolean;
    issues: Array<{ code: string; subject: string; detail: string }>;
  }>(`/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedStorageRevision }),
  });
}

export function publishCampaignDefinitionDraft(
  campaignDefinitionId: string,
  expectedStorageRevision: number,
) {
  return request<NonNullable<CampaignDefinitionSummary["currentRevision"]>>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/draft/publish`,
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
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/${action}`,
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
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/world-migrations/preview`,
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
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/world-migrations/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function listCampaignInstances() {
  return request<CampaignInstanceList>("/me/campaign-instances");
}

export function getCampaignInstance(campaignInstanceId: string) {
  return request<CampaignInstanceDetail>(
    `/me/campaign-instances/${encodeURIComponent(campaignInstanceId)}`,
  );
}

export function createCampaignInstance(
  campaignDefinitionId: string,
  input: CreateCampaignInstanceRequest,
) {
  return request<CampaignInstanceDetail>(
    `/campaigns/${encodeURIComponent(campaignDefinitionId)}/instances`,
    {
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
    },
  );
}

const instancePath = (
  campaignDefinitionId: string,
  campaignInstanceId: string,
  suffix: string,
) =>
  `/campaigns/${encodeURIComponent(campaignDefinitionId)}/instances/${encodeURIComponent(campaignInstanceId)}${suffix}`;

export function validateCampaignInstance(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceReadiness>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/actions/validate"),
    {
      method: "POST",
    },
  );
}

export function updateCampaignInstanceLifecycle(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: CampaignInstanceLifecycleRequest,
) {
  return request<CampaignInstanceLifecycleResult>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/actions/change-status",
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstancePreparation(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstancePreparation>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/runtime/preparation",
    ),
  );
}

export function saveCampaignInstancePreparation(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: UpdateCampaignInstancePreparationRequest,
) {
  return request<CampaignInstancePreparation>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/runtime/preparation",
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstancePlots(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstancePlotProjection>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/plots"),
  );
}

export function updateCampaignInstancePlot(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  plotDefinitionId: string,
  input: UpdateCampaignInstancePlotRequest,
) {
  return request<CampaignInstanceMutationResult>(
    instancePath(
      campaignDefinitionId,
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

export function getCampaignInstancePlacements(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstancePlacementProjection>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/placements"),
  );
}

export function getCampaignInstanceEmbodiments(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceCreatureEmbodimentListProjection>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/creature-embodiments",
    ),
  );
}

export function decideCampaignInstancePlacement(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  realizationId: string,
  input: CampaignInstancePlacementCommandRequest,
) {
  return request<CampaignInstanceMutationResult>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      `/placements/${encodeURIComponent(realizationId)}/actions/${input.action}`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstanceRoster(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceRoster>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/roster"),
  );
}

export function changeCampaignInstanceMembershipStatus(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  membershipId: string,
  input: ChangeCampaignInstanceMembershipStatusRequest,
) {
  return request<{
    campaignInstanceName: string;
    membershipName: string;
    status: string;
  }>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      `/memberships/${encodeURIComponent(membershipId)}/actions/change-status`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function createCampaignInstanceCharacter(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: CreateCampaignInstanceCharacterRequest,
) {
  return request(
    instancePath(campaignDefinitionId, campaignInstanceId, "/characters"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function changeCampaignInstanceCharacterStatus(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  characterId: string,
  input: ChangeCampaignInstanceCharacterStatusRequest,
) {
  return request(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      `/characters/${encodeURIComponent(characterId)}/actions/change-status`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function selectCampaignInstanceCharacter(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  membershipId: string,
  input: SelectCampaignInstanceCharacterRequest,
) {
  return request(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      `/memberships/${encodeURIComponent(membershipId)}/actions/select-character`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function importCampaignInstanceCharacter(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: ImportCampaignInstanceCharacterRequest,
) {
  return request(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/character-imports",
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignInstanceAvailableAgents(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceAvailableAgents>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/agents/available"),
  );
}

export function createCampaignInstanceInvitation(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: CreateCampaignInstanceInvitationRequest,
) {
  return request<CampaignInstanceInvitationCommandResult>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/invitations"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function updateCampaignInstanceInvitation(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  invitationId: string,
  action: "retry" | "revoke",
) {
  return request<CampaignInstanceInvitationActionResult>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      `/invitations/${encodeURIComponent(invitationId)}${action === "retry" ? "/actions/retry" : ""}`,
    ),
    { method: action === "retry" ? "POST" : "DELETE" },
  );
}

export function configureCampaignInstanceAgent(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: ConfigureCampaignInstanceAgentRequest,
) {
  return request<CampaignInstanceAgentCommandResult>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/agents"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function updateCampaignInstanceAgent(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  agentParticipationId: string,
  input: UpdateCampaignInstanceAgentStatusRequest,
) {
  return request<CampaignInstanceAgentCommandResult>(
    instancePath(
      campaignDefinitionId,
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

const campaignSessionsPath = (
  campaignDefinitionId: string,
  campaignInstanceId: string,
  suffix = "",
) =>
  `/campaigns/${encodeURIComponent(campaignDefinitionId)}/instances/${encodeURIComponent(campaignInstanceId)}/sessions${suffix}`;

export function getCampaignInstanceSessions(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceSessions>(
    campaignSessionsPath(campaignDefinitionId, campaignInstanceId),
  );
}

export function createCampaignSession(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: CreateCampaignSessionRequest,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(campaignDefinitionId, campaignInstanceId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignSession(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}`,
    ),
  );
}

export function updateCampaignSession(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  input: UpdateCampaignSessionRequest,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}`,
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function updateCampaignSessionParticipants(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  input: UpdateCampaignSessionParticipantsRequest,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/participants`,
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function ejectCampaignSessionParticipant(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  participationId: string,
  expectedMetadataRevision: number,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participationId)}/actions/eject`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedMetadataRevision }),
    },
  );
}

export function getCampaignSessionReadiness(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
) {
  return request<CampaignSessionReadiness>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/readiness`,
    ),
  );
}

export function issueCampaignSessionInvitations(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
) {
  return request<{
    campaignInstanceName: string;
    sessionName: string;
    invitations: readonly {
      participantName: string;
      status: string;
      expiresAt: string;
    }[];
  }>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/invitations`,
    ),
    { method: "POST" },
  );
}

export function commandCampaignSession(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  command:
    | "open-lobby"
    | "close-lobby"
    | "start"
    | "pause"
    | "resume"
    | "conclude"
    | "cancel",
  input: CampaignSessionLifecycleRequest,
) {
  return request<CampaignSessionDetail>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/actions/${command}`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function joinCampaignSession(
  campaignInstanceId: string,
  sessionId: string,
  connectionKey: string,
) {
  return request<{
    sessionName: string;
    participantName: string;
    present: boolean;
    expiresAt: string;
  }>(
    `/me/campaign-instances/${encodeURIComponent(campaignInstanceId)}/sessions/${encodeURIComponent(sessionId)}/presence/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionKey }),
    },
  );
}

export interface PublicCampaignInstanceInvitation {
  campaignInstanceName: string;
  invitedName: string;
  role: "player" | "spectator";
  status: "pending";
  expiresAt: string;
}

export function resolveCampaignInstanceInvitation(token: string) {
  return request<PublicCampaignInstanceInvitation>(
    "/invitations/instance/resolve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    },
  );
}

export function acceptCampaignInstanceInvitation(token: string) {
  return request<{
    user: { displayName: string; role: "player" | "spectator" };
    campaignInstanceName: string;
  }>("/invitations/instance/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export interface PublicCampaignSessionInvitation {
  campaignInstanceName: string;
  sessionName: string;
  participantName: string;
  role: "player" | "spectator";
  response: string;
  scheduledFor?: string;
  expiresAt: string;
}

export function resolveCampaignSessionInvitation(token: string) {
  return request<PublicCampaignSessionInvitation>(
    "/invitations/session/resolve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    },
  );
}

export function respondToCampaignSessionInvitation(
  token: string,
  response: "accepted" | "declined",
  message?: string,
) {
  return request<{
    campaignInstanceName: string;
    sessionName: string;
    participantName: string;
    response: "accepted" | "declined";
    lobbyHref: string;
  }>("/invitations/session/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, response, message }),
  });
}

export interface ParticipantCampaignSessionProjection {
  campaignInstanceName: string;
  sessionName: string;
  status: "planned" | "lobby" | "active" | "paused" | "concluded" | "cancelled";
  scheduledFor?: string;
  role: "gm" | "player" | "spectator" | "agent";
  participants: readonly {
    name: string;
    role: "gm" | "player" | "spectator" | "agent";
    present: boolean;
  }[];
}

export interface ParticipantCampaignSessionEvents {
  sessionName: string;
  items: readonly {
    sequence: number;
    occurredAt: string;
    campaignTime?: string;
    type: string;
    summary: string;
    actorName?: string;
  }[];
  nextAfterSequence?: number;
}

export interface CampaignSessionEvents {
  campaignInstanceName: string;
  sessionName: string;
  items: readonly {
    sequence: number;
    occurredAt: string;
    campaignTime?: string;
    type: string;
    summary: string;
    actorName: string;
    visibility: string;
    runtimeRevisionBefore?: number;
    runtimeRevisionAfter?: number;
  }[];
  nextAfterSequence?: number;
}

function participantSessionPath(campaignInstanceId: string, sessionId: string) {
  return `/me/campaign-instances/${encodeURIComponent(campaignInstanceId)}/sessions/${encodeURIComponent(sessionId)}`;
}

export function getParticipantCampaignSession(
  campaignInstanceId: string,
  sessionId: string,
) {
  return request<ParticipantCampaignSessionProjection>(
    participantSessionPath(campaignInstanceId, sessionId),
  );
}

export function getParticipantCampaignSessionEvents(
  campaignInstanceId: string,
  sessionId: string,
  afterSequence = 0,
) {
  return request<ParticipantCampaignSessionEvents>(
    `${participantSessionPath(campaignInstanceId, sessionId)}/events?afterSequence=${afterSequence}`,
  );
}

export function heartbeatCampaignSession(
  campaignInstanceId: string,
  sessionId: string,
  connectionKey: string,
) {
  return request<{
    sessionName: string;
    participantName: string;
    present: true;
  }>(
    `${participantSessionPath(campaignInstanceId, sessionId)}/presence/heartbeat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionKey }),
    },
  );
}

export function leaveCampaignSession(
  campaignInstanceId: string,
  sessionId: string,
  connectionKey: string,
) {
  return request<{
    sessionName: string;
    participantName: string;
    present: false;
  }>(
    `${participantSessionPath(campaignInstanceId, sessionId)}/presence/leave`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionKey }),
    },
  );
}

export function updateCampaignSessionSummary(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  input: UpdateCampaignSessionSummaryRequest,
) {
  return request<CampaignSessionSummary>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/summary`,
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getCampaignSessionSummary(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
) {
  return request<CampaignSessionSummary>(
    campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/summary`,
    ),
  );
}

export function getCampaignSessionEvents(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  sessionId: string,
  afterSequence = 0,
) {
  return request<CampaignSessionEvents>(
    `${campaignSessionsPath(
      campaignDefinitionId,
      campaignInstanceId,
      `/${encodeURIComponent(sessionId)}/events`,
    )}?afterSequence=${afterSequence}`,
  );
}

export function getCampaignInstanceContinuation(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceContinuation>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/continuation"),
  );
}

export function getGmResumableSession() {
  return request<{
    session: {
      campaignInstanceId: string;
      campaignInstanceName: string;
      sessionId: string;
      sessionName: string;
      status: "active" | "paused";
      label: "Continue" | "Resume";
    } | null;
  }>("/me/resumable-session");
}

export function getCampaignInstanceVersions(
  campaignDefinitionId: string,
  campaignInstanceId: string,
) {
  return request<CampaignInstanceVersions>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/snapshots"),
  );
}

export function previewCampaignInstanceMigration(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: import("@aow/common").CampaignInstanceMigrationPreviewRequest,
) {
  return request<CampaignInstanceMigrationPreview>(
    instancePath(
      campaignDefinitionId,
      campaignInstanceId,
      "/migrations/preview",
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function applyCampaignInstanceMigration(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: ApplyCampaignInstanceMigrationRequest,
) {
  return request<CampaignInstanceMigrationResult>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/migrations"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function previewCampaignInstanceRestore(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: CampaignInstanceRestorePreviewRequest,
) {
  return request<CampaignInstanceMigrationPreview>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/restores/preview"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function applyCampaignInstanceRestore(
  campaignDefinitionId: string,
  campaignInstanceId: string,
  input: ApplyCampaignInstanceRestoreRequest,
) {
  return request<CampaignInstanceMigrationResult>(
    instancePath(campaignDefinitionId, campaignInstanceId, "/restores"),
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
