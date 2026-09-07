import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CampaignDefinitionDraftProposal,
  CampaignDefinitionId,
  CampaignPlacementDefinition,
  CampaignPlacementDefinitionId,
  CreatureId,
  DefinitionId,
  DiscoveryClaim,
  LocationId,
  ModelSchemaReleaseId,
  PlotDefinition,
  PlotDiscovery,
  PlotDefinitionId,
  WorldDefinitionSnapshotId,
  WorldPlacementDefinitionId,
} from "@aow/common";
import { validatePlotHierarchy } from "@aow/common";
import { isObject } from "../domain/domain-resource";
import {
  isCanonicalSnapshotManifest,
  type CanonicalSnapshotManifest,
  type CanonicalSnapshotRecord,
} from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import { isSafeCampaignRichText } from "../campaign-definitions/campaign-definition-draft-validator";
import { AiPromptService } from "./ai-prompt.service";
import { logInvalidAiOutput } from "./ai-failure-logging";
import { OpenAiService } from "./openai.service";

const MAX_CATALOG_RECORDS_PER_KIND = 125;
const MAX_CATALOG_TEXT_LENGTH = 600;
const MAX_CAMPAIGN_PROMPT_LENGTH = 240_000;
const MAX_CAMPAIGN_OUTPUT_TOKENS = 6_000;

interface CapturedWorldRow {
  readonly id: string;
  readonly worldDefinitionId: string;
  readonly manifest: unknown;
  readonly contentHash: string;
  readonly worldDefinitionRevision: {
    readonly revisionNumber: number;
    readonly name: string;
  };
}

interface CampaignGenerationStore {
  readonly worldDefinitionSnapshot: {
    findUnique(args: unknown): Promise<CapturedWorldRow | null>;
  };
}

@Injectable()
export class CampaignGenerationService {
  private readonly logger = new Logger(CampaignGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    @Inject(PrismaService)
    private readonly prisma: CampaignGenerationStore,
  ) {}

  async createDraftProposal(
    worldDefinitionSnapshotId: string,
    userId: string,
    userContext: string,
  ) {
    const captured = await this.prisma.worldDefinitionSnapshot.findUnique({
      where: {
        id: worldDefinitionSnapshotId,
        worldDefinition: { ownerUserId: userId },
      },
      select: {
        id: true,
        worldDefinitionId: true,
        manifest: true,
        contentHash: true,
        worldDefinitionRevision: {
          select: { revisionNumber: true, name: true },
        },
      },
    });
    if (!captured) {
      throw new NotFoundException(
        "The selected World Definition snapshot was not found.",
      );
    }
    if (
      !isCanonicalSnapshotManifest(captured.manifest) ||
      captured.manifest.contentHash !== captured.contentHash
    ) {
      throw new BadGatewayException(
        "The selected World Definition snapshot could not be verified.",
      );
    }

    const catalogs = capturedCatalogs(captured.manifest);
    const promptCatalogs = boundedCatalogs(catalogs);
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-campaign.md", "CREATE_CAMPAIGN_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_CAMPAIGN_PROMPT_PATH"),
    ]);
    const context = {
      capturedWorld: {
        name: captured.worldDefinitionRevision.name,
        revisionNumber: captured.worldDefinitionRevision.revisionNumber,
      },
      locations: promptCatalogs.locations.map(contextRecord),
      creatures: promptCatalogs.creatures.map(contextRecord),
      items: promptCatalogs.items.map(contextRecord),
      worldPlacements: promptCatalogs.worldPlacements.map(contextRecord),
    };
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Authoritative captured World catalogs",
      "These records come from the explicitly selected immutable World snapshot. Use only the human-readable content and identifiers supplied here:",
      JSON.stringify(context, null, 2),
      "",
      "## GM's campaign idea",
      userContext.trim(),
      "",
      "Return exactly one Campaign Definition draft proposal JSON object. Do not include Markdown or commentary.",
    ].join("\n");

    if (combinedPrompt.length > MAX_CAMPAIGN_PROMPT_LENGTH) {
      throw new PayloadTooLargeException(
        "The selected World contains too much Campaign proposal context.",
      );
    }

    const result = await this.openAi.respond({
      input: combinedPrompt,
      maxOutputTokens: MAX_CAMPAIGN_OUTPUT_TOKENS,
    });
    let data: CampaignDefinitionDraftProposal;
    try {
      data = this.normalize(
        this.parseObject(result.output),
        captured.id,
        catalogs,
      );
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-campaign",
        result.responseId,
        result.output.length,
      );
      throw error;
    }

    return {
      draftProposal: data,
      ...result,
      combinedPrompt,
    };
  }

  private normalize(
    generated: Record<string, unknown>,
    worldDefinitionSnapshotId: string,
    catalogs: CapturedCatalogs,
  ): CampaignDefinitionDraftProposal {
    const name = this.requiredString(generated.name, "campaign name");
    const gmPremise = this.requiredString(generated.gmPremise, "GM premise");
    const playerIntroduction = this.requiredString(
      generated.playerIntroduction,
      "player introduction",
    );
    if (
      !isSafeCampaignRichText(gmPremise) ||
      !isSafeCampaignRichText(playerIntroduction)
    ) {
      throw new BadGatewayException(
        "The AI response included unsafe Campaign rich text.",
      );
    }
    const locationIds = new Set(catalogs.locations.map(({ sourceId }) => sourceId));
    const creatureIds = new Set(catalogs.creatures.map(({ sourceId }) => sourceId));
    const itemIds = new Set(catalogs.items.map(({ sourceId }) => sourceId));
    const worldPlacementLocations = new Map(
      catalogs.worldPlacements.flatMap((record) =>
        isObject(record.payload) && typeof record.payload.locationId === "string"
          ? [[record.sourceId, record.payload.locationId] as const]
          : [],
      ),
    );
    const requestedStart =
      typeof generated.partyStartingLocationId === "string"
        ? generated.partyStartingLocationId
        : "";
    const partyStartingLocationId = locationIds.has(requestedStart)
      ? requestedStart
      : catalogs.locations[0]?.sourceId;
    const { plots, plotIdsByKey } = this.plots(generated.plots, locationIds);
    const placements = this.placements(
      generated.placements,
      plotIdsByKey,
      creatureIds,
      itemIds,
      locationIds,
      worldPlacementLocations,
    );

    return {
      sourceWorldDefinitionSnapshotId:
        worldDefinitionSnapshotId as WorldDefinitionSnapshotId,
      name,
      description:
        typeof generated.description === "string" && generated.description.trim()
          ? generated.description.trim()
          : undefined,
      content: {
        formatVersion: 1,
        gmPremise,
        playerIntroduction,
        plotDefinitionIds: plots.map(({ id }) => id),
        placementDefinitionIds: placements.map(({ id }) => id),
        modelSchemaReleaseIds: [] as ModelSchemaReleaseId[],
        preparation: partyStartingLocationId
          ? { startingLocationId: partyStartingLocationId as LocationId }
          : undefined,
      },
      plots,
      placements,
      records: [
        ...plots.map((plot) => ({
          resourceType: "plots" as const,
          sourceId: plot.id,
          payload: plot,
        })),
        ...placements.map((placement) => ({
          resourceType: "campaign-placements" as const,
          sourceId: placement.id,
          payload: placement,
        })),
      ],
    };
  }

  private placements(
    value: unknown,
    plotIdsByKey: ReadonlyMap<string, PlotDefinitionId>,
    creatureIds: ReadonlySet<string>,
    itemIds: ReadonlySet<string>,
    locationIds: ReadonlySet<string>,
    worldPlacementLocations: ReadonlyMap<string, string>,
  ): CampaignPlacementDefinition[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap<CampaignPlacementDefinition>((candidate) => {
      if (!isObject(candidate)) return [];
      const locationId = candidate.locationId;
      const plotDefinitionIds = Array.isArray(candidate.plotKeys)
        ? candidate.plotKeys.flatMap((key) =>
            typeof key === "string" && plotIdsByKey.has(key)
              ? [plotIdsByKey.get(key)!]
              : [],
          )
        : [];
      if (
        typeof locationId !== "string" ||
        !locationIds.has(locationId) ||
        plotDefinitionIds.length === 0
      ) {
        return [];
      }
      const common = {
        id: randomUUID() as CampaignPlacementDefinitionId,
        locationId: locationId as LocationId,
        plotDefinitionIds: plotDefinitionIds as [PlotDefinitionId, ...PlotDefinitionId[]],
        ...(typeof candidate.name === "string" && candidate.name.trim()
          ? { name: candidate.name.trim() }
          : {}),
        ...(typeof candidate.notes === "string" && candidate.notes.trim()
          ? { notes: candidate.notes.trim() }
          : {}),
      };
      if (
        candidate.kind === "world-decoration" &&
        typeof candidate.capturedWorldPlacementId === "string" &&
        worldPlacementLocations.get(candidate.capturedWorldPlacementId) ===
          locationId
      ) {
        return [{
          ...common,
          kind: "world-decoration" as const,
          capturedWorldPlacementId:
            candidate.capturedWorldPlacementId as WorldPlacementDefinitionId,
        }];
      }
      if (candidate.kind !== "independent" || !isObject(candidate.source)) {
        return [];
      }
      const source = candidate.source;
      if (
        source.kind === "world-creature" &&
        typeof source.creatureId === "string" &&
        creatureIds.has(source.creatureId)
      ) {
        return [{ ...common, kind: "independent" as const, source: {
          kind: "world-creature" as const,
          creatureId: source.creatureId as CreatureId,
        }}];
      }
      if (
        source.kind === "world-item" &&
        typeof source.itemDefinitionId === "string" &&
        itemIds.has(source.itemDefinitionId)
      ) {
        return [{ ...common, kind: "independent" as const, source: {
          kind: "world-item" as const,
          itemDefinitionId: source.itemDefinitionId as DefinitionId,
        }}];
      }
      return [];
    });
  }

  private plots(
    value: unknown,
    locationIds: ReadonlySet<string>,
  ): {
    plots: Array<Omit<PlotDefinition, "campaignDefinitionId">>;
    plotIdsByKey: ReadonlyMap<string, PlotDefinitionId>;
  } {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadGatewayException("The AI response did not include any Plots.");
    }
    const candidates = value.filter(isObject);
    const plotIdsByKey = new Map<string, PlotDefinitionId>();
    for (const candidate of candidates) {
      const key = this.requiredString(candidate.key, "Plot key");
      if (plotIdsByKey.has(key)) {
        throw new BadGatewayException("The AI response repeated a Plot key.");
      }
      plotIdsByKey.set(key, randomUUID() as PlotDefinitionId);
    }
    const plots = candidates.map((candidate) => {
      const key = this.requiredString(candidate.key, "Plot key");
      const name = this.requiredString(candidate.name, "Plot name");
      const parentId =
        typeof candidate.parentKey === "string"
          ? plotIdsByKey.get(candidate.parentKey)
          : undefined;
      if (typeof candidate.parentKey === "string" && !parentId) {
        throw new BadGatewayException(
          "The AI response referenced an unavailable parent Plot.",
        );
      }
      const locationContexts = Array.isArray(candidate.locationIds)
        ? [...new Set(candidate.locationIds)].flatMap((location) =>
            typeof location === "string" && locationIds.has(location)
              ? [{ id: randomUUID(), locationId: location as LocationId }]
              : [],
          )
        : [];
      return {
        id: plotIdsByKey.get(key)!,
        parent: parentId
          ? ({ kind: "subplot", parentPlotDefinitionId: parentId } as const)
          : ({ kind: "root" } as const),
        name,
        ...(typeof candidate.description === "string" && candidate.description.trim()
          ? { description: candidate.description.trim() }
          : {}),
        objectives: namedNotes(candidate.objectives),
        pressures: namedNotes(candidate.pressures),
        resistances: namedNotes(candidate.resistances),
        discoveries: plotDiscoveries(candidate.discoveries),
        locationContexts,
        prerequisites: relationships(candidate.prerequisites, plotIdsByKey),
        dependencies: relationships(candidate.dependencies, plotIdsByKey),
      };
    });
    const validation = validatePlotHierarchy(
      plots.map((plot) => ({
        ...plot,
        campaignDefinitionId: "draft-proposal" as CampaignDefinitionId,
      })),
    );
    if (!validation.valid) {
      throw new BadGatewayException(
        "The AI response included an invalid Plot hierarchy.",
      );
    }
    return { plots, plotIdsByKey };
  }

  private requiredString(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadGatewayException(
        `The AI response did not include a ${label}.`,
      );
    }
    return value.trim();
  }

  private parseObject(output: string): Record<string, unknown> {
    const withoutFence = output
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      const value: unknown = JSON.parse(withoutFence);
      if (isObject(value)) return value;
    } catch {
      // The stable error below avoids exposing a potentially large model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid campaign JSON object.",
    );
  }
}

interface CapturedCatalogs {
  readonly locations: readonly CanonicalSnapshotRecord[];
  readonly creatures: readonly CanonicalSnapshotRecord[];
  readonly items: readonly CanonicalSnapshotRecord[];
  readonly worldPlacements: readonly CanonicalSnapshotRecord[];
}

function capturedCatalogs(
  manifest: CanonicalSnapshotManifest,
): CapturedCatalogs {
  const definitions = manifest.records.filter(
    (record) => record.resourceType === "definitions" && isObject(record.payload),
  );
  return {
    locations: manifest.records.filter(
      (record) => record.resourceType === "locations",
    ),
    creatures: [
      ...manifest.records.filter(
        (record) => record.resourceType === "creatures",
      ),
      ...definitions.filter((record) =>
        isObject(record.payload) && record.payload.kind === "creature",
      ),
    ],
    items: definitions.filter(
      (record) => isObject(record.payload) && record.payload.kind === "item",
    ),
    worldPlacements: manifest.records.filter(
      (record) => record.resourceType === "world-placements",
    ),
  };
}

function contextRecord(record: CanonicalSnapshotRecord) {
  const payload = isObject(record.payload) ? record.payload : {};
  const identity = isObject(payload.identity) ? payload.identity : {};
  return {
    id: record.sourceId,
    name:
      (typeof payload.name === "string" && boundedText(payload.name)) ||
      (typeof identity.name === "string" && boundedText(identity.name)) ||
      "Unnamed captured content",
    kind: typeof payload.kind === "string" ? payload.kind : undefined,
    description:
      typeof payload.description === "string"
        ? boundedText(payload.description)
        : typeof identity.description === "string"
          ? boundedText(identity.description)
          : undefined,
    ...(record.resourceType === "world-placements" &&
    typeof payload.locationId === "string"
      ? { locationId: payload.locationId }
      : {}),
  };
}

function boundedCatalogs(catalogs: CapturedCatalogs): CapturedCatalogs {
  return {
    locations: catalogs.locations.slice(0, MAX_CATALOG_RECORDS_PER_KIND),
    creatures: catalogs.creatures.slice(0, MAX_CATALOG_RECORDS_PER_KIND),
    items: catalogs.items.slice(0, MAX_CATALOG_RECORDS_PER_KIND),
    worldPlacements: catalogs.worldPlacements.slice(
      0,
      MAX_CATALOG_RECORDS_PER_KIND,
    ),
  };
}

function boundedText(value: string): string {
  return value.trim().slice(0, MAX_CATALOG_TEXT_LENGTH);
}

function namedNotes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate === "string" && candidate.trim()) {
      return [{ id: randomUUID(), name: candidate.trim() }];
    }
    if (!isObject(candidate)) return [];
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) return [];
    return [
      {
        id: randomUUID(),
        name,
        ...(typeof candidate.description === "string" &&
        candidate.description.trim()
          ? { description: candidate.description.trim() }
          : {}),
      },
    ];
  });
}

function relationships(
  value: unknown,
  idsByKey: ReadonlyMap<string, PlotDefinitionId>,
) {
  if (!Array.isArray(value)) return undefined;
  const result = value.flatMap((candidate) => {
    const key =
      typeof candidate === "string"
        ? candidate
        : isObject(candidate) && typeof candidate.plotKey === "string"
          ? candidate.plotKey
          : undefined;
    const id = key ? idsByKey.get(key) : undefined;
    if (!id) {
      throw new BadGatewayException(
        "The AI response referenced an unavailable related Plot.",
      );
    }
    return [
      {
        plotDefinitionId: id,
        ...(isObject(candidate) &&
        typeof candidate.crossBranchRationale === "string" &&
        candidate.crossBranchRationale.trim()
          ? { crossBranchRationale: candidate.crossBranchRationale.trim() }
          : {}),
      },
    ];
  });
  return result.length > 0 ? result : undefined;
}

function plotDiscoveries(value: unknown): PlotDiscovery[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) return [];
    const claimCandidates = Array.isArray(candidate.claims)
      ? candidate.claims.filter(isObject)
      : [];
    const idsByKey = new Map<string, string>();
    const kindsByKey = new Map<string, unknown>();
    for (const claim of claimCandidates) {
      if (typeof claim.key === "string" && claim.key.trim()) {
        idsByKey.set(claim.key, randomUUID());
        kindsByKey.set(claim.key, claim.kind);
      }
    }
    const claims = claimCandidates.flatMap<DiscoveryClaim>((claim) => {
      const key = typeof claim.key === "string" ? claim.key : "";
      const id = idsByKey.get(key);
      const statement =
        typeof claim.statement === "string" ? claim.statement.trim() : "";
      if (!id || !statement) return [];
      if (claim.kind === "truth") {
        return [{ id, kind: "truth" as const, statement }];
      }
      const conflictsWithClaimIds = Array.isArray(claim.conflictsWithKeys)
        ? claim.conflictsWithKeys.flatMap((conflictKey) =>
            typeof conflictKey === "string" && idsByKey.has(conflictKey)
              ? [idsByKey.get(conflictKey)!]
              : [],
          )
        : [];
      if (claim.kind === "belief") {
        return [{
          id,
          kind: "belief" as const,
          statement,
          ...(conflictsWithClaimIds.length > 0 ? { conflictsWithClaimIds } : {}),
        }];
      }
      if (claim.kind === "rumor") {
        const relatedTruthClaimId =
          typeof claim.relatedTruthKey === "string"
            ? kindsByKey.get(claim.relatedTruthKey) === "truth"
              ? idsByKey.get(claim.relatedTruthKey)
              : undefined
            : undefined;
        return [{
          id,
          kind: "rumor" as const,
          statement,
          ...(relatedTruthClaimId ? { relatedTruthClaimId } : {}),
          ...(conflictsWithClaimIds.length > 0 ? { conflictsWithClaimIds } : {}),
        }];
      }
      return [];
    });
    return [{ id: randomUUID(), name, claims }];
  });
}
