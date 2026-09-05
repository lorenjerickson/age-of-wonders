import { createServerFn } from "@tanstack/react-start";
import {
  serverApiRequest,
  UpstreamApiError,
  type CurrentUser,
  type DomainRecord,
} from "./api";

export type SessionResult =
  { authenticated: true; user: CurrentUser } | { authenticated: false };

export const readCurrentSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionResult> => {
    try {
      const result = await serverApiRequest<{ user: CurrentUser }>("/auth/me");
      return { authenticated: true, user: result.user };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.status === 401) {
        return { authenticated: false };
      }
      throw error;
    }
  },
);

export const readLocation = createServerFn({ method: "GET" })
  .validator((data: { locationId: string }) => {
    const locationId = data.locationId.trim();
    if (!locationId || locationId.length > 256) {
      throw new Error("The location reference is invalid.");
    }
    return { locationId };
  })
  .handler(async ({ data }) => {
    try {
      const location = await serverApiRequest<DomainRecord>(
        `/domain/locations/${encodeURIComponent(data.locationId)}`,
      );
      return {
        found: true as const,
        location: {
          kind: location.kind,
          name: location.name,
          revision: location.revision,
        },
      };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });
