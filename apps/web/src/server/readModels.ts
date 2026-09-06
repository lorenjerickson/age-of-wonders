import { createServerFn } from "@tanstack/react-start";
import type {
  CampaignDefinitionDetail,
  CampaignDefinitionDraft,
  CampaignDefinitionList,
  CampaignInstanceDetail,
  CampaignInstanceList,
  CurrentUser,
  DomainResource,
  EffectiveWorldModelResponse,
  JsonValue,
  WorldDefinitionDetail,
  WorldDefinitionDraft,
  WorldDefinitionList,
  WorldDraftImpact,
} from "../api";
import { projectEffectiveModels } from "../worldAuthoringModel";
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

export type ReadSection<T> =
  { ok: true; data: T } | { ok: false; message: string };

async function readSection<T>(
  read: () => Promise<T>,
  message: string,
): Promise<ReadSection<T>> {
  try {
    return { ok: true, data: await read() };
  } catch {
    return { ok: false, message };
  }
}

export const readGmShell = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await readSession();
    return { session };
  },
);

export const readLanding = createServerFn({ method: "GET" }).handler(
  async () => {
    const [health, worlds, instances] = await Promise.all([
      serverApiRequest<{ status: string }>("/health").then(
        () => true,
        () => false,
      ),
      readSection(
        () => serverApiRequest<WorldDefinitionList>("/world-definitions"),
        "World Definitions could not be loaded.",
      ),
      readSection(
        () => serverApiRequest<CampaignInstanceList>("/campaign-instances"),
        "Campaign Instances could not be loaded.",
      ),
    ]);
    return { healthy: health, worlds, instances };
  },
);

export const readWorldDefinitionLibrary = createServerFn({
  method: "GET",
}).handler(() =>
  readSection(
    () => serverApiRequest<WorldDefinitionList>("/world-definitions"),
    "World Definitions could not be loaded.",
  ),
);

export const readWorldDefinition = createServerFn({ method: "GET" })
  .validator((data: { worldDefinitionId: string }) => ({
    worldDefinitionId: data.worldDefinitionId.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const definition = await serverApiRequest<WorldDefinitionDetail>(
        `/world-definitions/${encodeURIComponent(data.worldDefinitionId)}`,
      );
      return { found: true as const, definition };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });

export const readWorldAuthoring = createServerFn({ method: "GET" })
  .validator((data: { worldDefinitionId: string }) => ({
    worldDefinitionId: data.worldDefinitionId.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const definition = await serverApiRequest<WorldDefinitionDetail>(
        `/world-definitions/${encodeURIComponent(data.worldDefinitionId)}`,
      );
      const [draft, effective] = await Promise.all([
        serverApiRequest<WorldDefinitionDraft>(
          `/world-definitions/${encodeURIComponent(data.worldDefinitionId)}/draft`,
        ).catch((error: unknown) => {
          if (error instanceof ServerApiError && error.status === 404)
            return undefined;
          throw error;
        }),
        serverApiRequest<EffectiveWorldModelResponse>(
          `/model-registries/effective?worldDefinitionId=${encodeURIComponent(data.worldDefinitionId)}`,
        ).catch(() => undefined),
      ]);
      return {
        found: true as const,
        definition,
        draft: draft
          ? {
              ...draft,
              baseRevisionNumber: definition.revisions.find(
                (revision) => revision.id === draft.baseRevisionId,
              )?.revisionNumber,
              status:
                (draft.baseRevisionId ?? undefined) ===
                (definition.currentRevisionId ?? undefined)
                  ? ("current" as const)
                  : ("stale" as const),
              effectiveModels: effective
                ? projectEffectiveModels(effective)
                : undefined,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });

export const readWorldDraftImpact = createServerFn({ method: "GET" })
  .validator((data: { worldDefinitionId: string }) => ({
    worldDefinitionId: data.worldDefinitionId.trim(),
  }))
  .handler(async ({ data }): Promise<ReadSection<WorldDraftImpact>> =>
    readSection(
      () =>
        serverApiRequest<WorldDraftImpact>(
          `/world-definitions/${encodeURIComponent(data.worldDefinitionId)}/draft/impact`,
        ),
      "Draft impact could not be calculated.",
    ),
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

export const readCampaignLibrary = createServerFn({ method: "GET" }).handler(
  async () => {
    const [definitions, instances] = await Promise.all([
      readSection(
        () => serverApiRequest<CampaignDefinitionList>("/campaign-definitions"),
        "Campaign Definitions could not be loaded.",
      ),
      readSection(
        () => serverApiRequest<CampaignInstanceList>("/campaign-instances"),
        "Campaign Instances could not be loaded.",
      ),
    ]);
    return { definitions, instances };
  },
);

export const readCampaignDefinition = createServerFn({ method: "GET" })
  .validator((data: { campaignDefinitionId: string }) => ({
    campaignDefinitionId: data.campaignDefinitionId.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const definition = await serverApiRequest<CampaignDefinitionDetail>(
        `/campaign-definitions/${encodeURIComponent(data.campaignDefinitionId)}`,
      );
      return { found: true as const, definition };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });

export const readCampaignDefinitionAuthoring = createServerFn({ method: "GET" })
  .validator((data: { campaignDefinitionId: string }) => ({
    campaignDefinitionId: data.campaignDefinitionId.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const definition = await serverApiRequest<CampaignDefinitionDetail>(
        `/campaign-definitions/${encodeURIComponent(data.campaignDefinitionId)}`,
      );
      let draft: CampaignDefinitionDraft | undefined;
      try {
        draft = await serverApiRequest<CampaignDefinitionDraft>(
          `/campaign-definitions/${encodeURIComponent(data.campaignDefinitionId)}/draft`,
        );
      } catch (error) {
        if (!(error instanceof ServerApiError) || error.status !== 404) throw error;
      }
      return { found: true as const, definition, draft };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });

export const readCampaignInstance = createServerFn({ method: "GET" })
  .validator((data: { campaignInstanceId: string }) => ({
    campaignInstanceId: data.campaignInstanceId.trim(),
  }))
  .handler(async ({ data }) => {
    try {
      const instance = await serverApiRequest<CampaignInstanceDetail>(
        `/campaign-instances/${encodeURIComponent(data.campaignInstanceId)}`,
      );
      return { found: true as const, instance };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) {
        return { found: false as const };
      }
      throw error;
    }
  });
