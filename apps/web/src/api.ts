import type {
  CharacterDraft,
  CharacterOptions,
  CharacterSelections,
} from "./characterCreationModel";
import type { CreateInvitationRequest } from "./campaignParticipationModel";

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

export function createCampaignWithAi(worldId: string, prompt: string) {
  return request<{ campaign: DomainRecord }>(
    `/ai/worlds/${encodeURIComponent(worldId)}/campaigns`,
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
