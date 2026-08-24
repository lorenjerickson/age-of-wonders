const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

interface ApiError {
  message?: string | string[];
}

export type DomainResource =
  "definitions" | "locations" | "campaigns" | "creatures" | "items" | "systems";

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
  const response = await fetch(`${apiUrl}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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

export function deleteWorld(id: string) {
  return request<void>(`/worlds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createLocationWithAi(parentId: string, prompt: string) {
  return request<{ location: DomainRecord }>(
    `/ai/locations/${encodeURIComponent(parentId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
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
