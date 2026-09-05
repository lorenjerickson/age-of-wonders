import { createServerFn } from "@tanstack/react-start";
import type { CurrentUser, DomainResource, JsonValue } from "../api";
import { ServerApiError, serverApiRequest } from "./api";

export type SessionResult =
  { authenticated: true; user: CurrentUser } | { authenticated: false };

interface SerializableDomainRecord {
  resource: DomainResource;
  id: string;
  kind: string | null;
  name: string | null;
  revision: number;
  data: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
}

interface SerializableDomainList {
  items: SerializableDomainRecord[];
  total: number;
  limit: number;
  offset: number;
}

export const readSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionResult> => {
    try {
      const result = await serverApiRequest<{ user: CurrentUser }>("/auth/me");
      return { authenticated: true, user: result.user };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 401) {
        return { authenticated: false };
      }
      throw error;
    }
  },
);

function listPath(
  resource: DomainResource,
  options: Record<string, string | number | undefined>,
) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  return `/domain/${resource}?${parameters}`;
}

const recentOptions = { limit: 1, sort: "updatedAt", order: "desc" } as const;

export const readGmShell = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await readSession();
    if (!session.authenticated || session.user.role !== "gm")
      return { session };
    const [worlds, campaigns] = await Promise.all([
      serverApiRequest<SerializableDomainList>(
        listPath("locations", { ...recentOptions, kind: "world" }),
      ),
      serverApiRequest<SerializableDomainList>(
        listPath("campaigns", recentOptions),
      ),
    ]);
    return {
      session,
      world: worlds.items[0],
      campaign: campaigns.items[0],
    };
  },
);

export const readLanding = createServerFn({ method: "GET" }).handler(
  async () => {
    const [health, worlds, campaigns] = await Promise.all([
      serverApiRequest<{ status: string }>("/health").then(
        () => true,
        () => false,
      ),
      serverApiRequest<SerializableDomainList>(
        listPath("locations", { ...recentOptions, kind: "world" }),
      ),
      serverApiRequest<SerializableDomainList>(
        listPath("campaigns", recentOptions),
      ),
    ]);
    return { healthy: health, worlds, campaigns };
  },
);

export const readResourceList = createServerFn({ method: "GET" })
  .validator(
    (data: { resource: DomainResource; kind?: string; limit?: number }) => data,
  )
  .handler(({ data }) =>
    serverApiRequest<SerializableDomainList>(
      listPath(data.resource, {
        kind: data.kind,
        limit: data.limit ?? 200,
        sort: "updatedAt",
        order: "desc",
      }),
    ),
  );

export const readResource = createServerFn({ method: "GET" })
  .validator((data: { resource: DomainResource; id: string }) => ({
    resource: data.resource,
    id: data.id.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const record = await serverApiRequest<SerializableDomainRecord>(
        `/domain/${data.resource}/${encodeURIComponent(data.id)}`,
      );
      return { found: true as const, record };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });

export const readSessions = createServerFn({ method: "GET" }).handler(
  async () => {
    const [sessions, campaigns] = await Promise.all([
      serverApiRequest<SerializableDomainList>(
        listPath("sessions", {
          limit: 100,
          sort: "createdAt",
          order: "desc",
        }),
      ),
      serverApiRequest<SerializableDomainList>(
        listPath("campaigns", recentOptions),
      ),
    ]);
    const campaign = campaigns.items[0];
    return {
      campaign,
      sessions: campaign
        ? sessions.items.filter(
            (session) => session.data.campaignId === campaign.id,
          )
        : [],
    };
  },
);
