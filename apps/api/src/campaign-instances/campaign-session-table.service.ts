import { CampaignInstance, LocationDefinition } from "@aow/domain";
import { runtimeCaptureContext } from "./campaign-instance-management.service";
import { Prisma } from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  isTerrainActorPosition,
  type CampaignSessionTableProjection,
  type CampaignSessionTablePlot,
  type IsometricTerrainVolume,
  type IsometricTerrainManifest,
  type LocationImage,
  plotDiscoveryClaims,
  type PlotDiscovery,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";
import {
  isRecord,
  resolveTerrainManifest,
} from "../world-definitions/terrain-snapshot";

const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};
const rows = (value: unknown) =>
  Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const name = (value: unknown, fallback: string) => text(value) ?? fallback;

@Injectable()
export class CampaignSessionTableService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async changeWeather(
    definitionId: string,
    instanceId: string,
    sessionId: string,
    userId: string,
    input: {
      expectedRuntimeRevision: number;
      locationId: string;
      weather?: Record<string, unknown> | null;
      reset?: boolean;
    },
  ) {
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRuntimeRevision) ||
      input.expectedRuntimeRevision < 1 ||
      typeof input.locationId !== "string" ||
      (input.reset !== undefined && typeof input.reset !== "boolean")
    )
      throw new BadRequestException("Invalid weather change.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
      );
      const session = await tx.campaignInstanceSession.findFirst({
        where: {
          id: sessionId,
          campaignInstanceId: instanceId,
          campaignInstance: {
            campaignDefinitionId: definitionId,
            ownerUserId: userId,
          },
        },
        include: {
          campaignInstance: {
            include: {
              runtime: true,
              currentSnapshot: {
                include: {
                  campaignDefinitionSnapshot: true,
                  worldDefinitionSnapshot: true,
                },
              },
            },
          },
        },
      });
      if (!session)
        throw new NotFoundException("The selected Session was not found.");
      if (!["ACTIVE", "PAUSED"].includes(session.status))
        throw new ConflictException(
          "Weather can change only during active or paused play.",
        );
      const instance = session.campaignInstance;
      if (
        !instance.runtime ||
        instance.runtime.revision !== input.expectedRuntimeRevision
      )
        throw new ConflictException(
          "Instance runtime changed; refresh and retry.",
        );
      const owner = CampaignInstance.deserializePayload(
        instance.runtime.state,
        { captured: runtimeCaptureContext(instance) },
      );
      try {
        const receipt = await owner.command("locationWeather", {
          initiator: userId,
          context: {},
          params: {
            locationId: input.locationId,
            weather: input.weather,
            reset: input.reset,
          },
        });
        if (receipt.status === "rejected")
          throw new BadRequestException("The weather change is invalid.");
        const changed = await tx.campaignInstanceRuntime.updateMany({
          where: {
            id: instance.runtime.id,
            revision: input.expectedRuntimeRevision,
            campaignInstanceSnapshotId: instance.currentSnapshotId!,
          },
          data: {
            state: owner.serializePayload() as Prisma.InputJsonObject,
            revision: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            "Instance runtime changed; refresh and retry.",
          );
        await tx.campaignInstanceAuditEvent.create({
          data: {
            campaignInstanceId: instanceId,
            actorUserId: userId,
            action: "instance.location-weather.changed",
            subjectName: "Location weather",
            subjectType: "Location",
            detail: {
              fromRuntimeRevision: input.expectedRuntimeRevision,
              toRuntimeRevision: input.expectedRuntimeRevision + 1,
            },
          },
        });
      } catch (error) {
        if (error instanceof TypeError)
          throw new BadRequestException(error.message);
        throw error;
      } finally {
        owner.dispose();
      }
    });
    return this.table(
      definitionId,
      instanceId,
      sessionId,
      userId,
      input.locationId,
    );
  }

  async table(
    definitionId: string,
    instanceId: string,
    sessionId: string,
    ownerUserId: string,
    locationId?: string,
  ): Promise<CampaignSessionTableProjection> {
    // Repeatable read pins nested reads to one lifecycle/runtime/capture boundary.
    const session = await this.prisma.$transaction(
      (tx) =>
        tx.campaignInstanceSession.findFirst({
          where: {
            id: sessionId,
            campaignInstanceId: instanceId,
            campaignInstance: {
              campaignDefinitionId: definitionId,
              ownerUserId,
            },
          },
          select: {
            name: true,
            status: true,
            campaignInstance: {
              select: {
                name: true,
                runtime: { select: { revision: true, state: true } },
                currentSnapshot: {
                  select: {
                    snapshotNumber: true,
                    worldDefinitionSnapshot: {
                      select: {
                        manifest: true,
                        worldDefinitionRevision: {
                          select: { name: true, revisionNumber: true },
                        },
                      },
                    },
                    campaignDefinitionSnapshot: {
                      select: {
                        manifest: true,
                        campaignDefinitionRevision: {
                          select: { name: true, revisionNumber: true },
                        },
                      },
                    },
                  },
                },
                humanMemberships: {
                  where: { status: "ACTIVE", role: "PLAYER" },
                  select: {
                    user: { select: { displayName: true } },
                    activeCharacter: {
                      select: {
                        characterId: true,
                        characterName: true,
                        status: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!session)
      throw new NotFoundException("The selected Session was not found.");
    if (session.status !== "ACTIVE" && session.status !== "PAUSED")
      throw new ConflictException(
        "The Session table is available only during active or paused play.",
      );
    const instance = session.campaignInstance;
    const snapshot = instance.currentSnapshot;
    if (!snapshot || !instance.runtime)
      throw new ConflictException(
        "The Session captured content or continuing runtime is unavailable.",
      );
    const world = snapshot.worldDefinitionSnapshot;
    const campaign = snapshot.campaignDefinitionSnapshot;
    return projectSessionTable(
      {
        instanceId,
        sessionName: session.name,
        campaignInstanceName: instance.name,
        status: session.status === "ACTIVE" ? "active" : "paused",
        runtimeRevision: instance.runtime.revision,
        state: instance.runtime.state,
        captured: {
          snapshotNumber: snapshot.snapshotNumber,
          world: world.worldDefinitionRevision,
          campaign: campaign.campaignDefinitionRevision,
        },
        worldManifest: world.manifest,
        campaignManifest: campaign.manifest,
        characters: instance.humanMemberships.flatMap((membership) =>
          membership.activeCharacter?.status === "ACTIVE"
            ? [
                {
                  id: membership.activeCharacter.characterId,
                  name: membership.activeCharacter.characterName,
                  playerName: membership.user?.displayName ?? "Player",
                },
              ]
            : [],
        ),
      },
      locationId,
    );
  }
}

export interface SessionTableSource {
  instanceId: string;
  sessionName: string;
  campaignInstanceName: string;
  status: "active" | "paused";
  runtimeRevision: number;
  state: unknown;
  worldManifest: unknown;
  campaignManifest: unknown;
  captured: CampaignSessionTableProjection["captured"];
  characters: readonly { id: string; name: string; playerName: string }[];
}

/** Only captures and Instance-owned runtime enter this projection, never live authoring records. */
export function projectSessionTable(
  source: SessionTableSource,
  requestedLocationId?: string,
): CampaignSessionTableProjection {
  const unavailable: string[] = [];
  const world = isCanonicalSnapshotManifest(source.worldManifest)
    ? source.worldManifest.records
    : [];
  const campaign = isCanonicalSnapshotManifest(source.campaignManifest)
    ? source.campaignManifest.records
    : [];
  if (!world.length) unavailable.push("Captured World content is unavailable.");
  if (!campaign.length)
    unavailable.push("Captured Campaign content is unavailable.");
  const state = record(source.state);
  const locationRecords = world.filter((r) => r.resourceType === "locations");
  const locations = locationRecords.map((r) => ({
    id: r.sourceId,
    name: name(record(r.payload).name, "Unnamed Location"),
  }));
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const startingId = text(record(state.preparation).startingLocationId);
  if (
    requestedLocationId !== undefined &&
    !locationNames.has(requestedLocationId)
  )
    throw new NotFoundException(
      "The selected Location is not available in this Session's captured World.",
    );
  const selectedId =
    requestedLocationId ??
    (startingId && locationNames.has(startingId)
      ? startingId
      : locations[0]?.id);
  const focus =
    requestedLocationId !== undefined
      ? "requested"
      : selectedId === undefined
        ? "unavailable"
        : selectedId === startingId
          ? "starting-location"
          : "first-available";
  const selected = locationRecords.find((r) => r.sourceId === selectedId);
  let location: CampaignSessionTableProjection["location"];
  if (selected) {
    const payload = record(selected.payload);
    const image = capturedImage(payload.image);
    let terrain: IsometricTerrainVolume | undefined;
    let mapUnavailableReason: string | undefined;
    if (record(payload.map).kind === "isometric") {
      try {
        terrain = resolveTerrainManifest(
          payload.map as IsometricTerrainManifest,
          world,
        );
      } catch {
        mapUnavailableReason = "The captured terrain could not be verified.";
        unavailable.push(mapUnavailableReason);
      }
    } else if (!image)
      mapUnavailableReason = "No captured map or Location image is available.";
    location = {
      id: selected.sourceId,
      name: locationNames.get(selected.sourceId)!,
      description: text(payload.description),
      ...projectLocationPresentation(
        payload,
        rows(state.locationPresentationOverrides).find(
          (entry) => entry.locationId === selected.sourceId,
        ),
      ),
      image,
      terrain,
      mapStatus: terrain ? "isometric" : image ? "image" : "unavailable",
      mapUnavailableReason,
    };
  } else unavailable.push("No Locations are available in the captured World.");

  const actors = rows(state.creatureEmbodiments).filter(
    (actor) => actor.campaignInstanceId === source.instanceId,
  );
  const characterIds = new Set(source.characters.map((c) => c.id));
  const party: CampaignSessionTableProjection["party"][number][] =
    source.characters.map((character) => {
      const matches = actors.filter(
        (a) =>
          record(a.source).kind === "character" &&
          record(a.source).characterId === character.id,
      );
      const actor = matches.length === 1 ? record(matches[0].creature) : {};
      return {
        key: character.id,
        kind: "character",
        name: name(character.name, "Unnamed Character"),
        playerName: name(character.playerName, "Player"),
        locationName:
          locationNames.get(text(actor.currentLocationId) ?? "") ??
          "Location unavailable",
        atFocusedLocation: Boolean(
          selectedId && actor.currentLocationId === selectedId,
        ),
        position: isTerrainActorPosition(actor.terrainPosition)
          ? actor.terrainPosition
          : undefined,
      };
    });
  for (const [index, embodiment] of actors.entries()) {
    if (
      record(embodiment.source).kind === "character" &&
      characterIds.has(String(record(embodiment.source).characterId))
    )
      continue;
    const actor = record(embodiment.creature);
    party.push({
      key: text(embodiment.runtimeCreatureId) ?? `actor-${index}`,
      kind: "actor",
      name: name(actor.name, "Unnamed actor"),
      locationName:
        locationNames.get(text(actor.currentLocationId) ?? "") ??
        "Location unavailable",
      atFocusedLocation: Boolean(
        selectedId && actor.currentLocationId === selectedId,
      ),
      position: isTerrainActorPosition(actor.terrainPosition)
        ? actor.terrainPosition
        : undefined,
    });
  }
  if (!party.length)
    unavailable.push("No active Characters or runtime actors are available.");
  const progressById = new Map(
    rows(state.plotProgress)
      .filter((p) => p.campaignInstanceId === source.instanceId)
      .map((p) => [p.plotDefinitionId, p]),
  );
  const plotRows = campaign.filter((r) => r.resourceType === "plots");
  const cue = (v: Record<string, unknown>) => ({
    name: name(v.name, "Unnamed cue"),
    description: text(v.description),
  });
  const plotsById = new Map<string, CampaignSessionTablePlot>();
  for (const row of plotRows) {
    const plot = record(row.payload),
      progress = progressById.get(row.sourceId) ?? {};
    const objectiveProgress = new Map(
      rows(progress.objectiveProgress).map((p) => [p.objectiveId, p]),
    );
    const contextIds = rows(plot.locationContexts).map((p) => p.locationId);
    plotsById.set(row.sourceId, {
      key: row.sourceId,
      name: name(plot.name, "Unnamed Plot"),
      description: text(plot.description),
      status: text(progress.status) ?? "not-started",
      atFocusedLocation: Boolean(selectedId && contextIds.includes(selectedId)),
      locationNames: [
        ...new Set(
          contextIds.map(
            (id) => locationNames.get(String(id)) ?? "Location unavailable",
          ),
        ),
      ],
      objectives: rows(plot.objectives).map((objective) => {
        const p = objectiveProgress.get(objective.id) ?? {};
        return {
          ...cue(objective),
          status: text(p.status) ?? "not-started",
          notes: text(p.notes),
        };
      }),
      pressures: rows(plot.pressures).map(cue),
      resistances: rows(plot.resistances).map(cue),
      discoveries: rows(plot.discoveries).map((d) => ({
        name: name(d.name, "Unnamed discovery"),
        claims: plotDiscoveryClaims(d as unknown as PlotDiscovery).flatMap(
          (claim) =>
            claim.kind === "truth" ||
            claim.kind === "belief" ||
            claim.kind === "rumor"
              ? [
                  {
                    kind: claim.kind,
                    statement: name(claim.statement, "Claim unavailable"),
                    revealed:
                      Array.isArray(progress.revealedClaimIds) &&
                      progress.revealedClaimIds.includes(claim.id),
                  },
                ]
              : [],
        ),
      })),
      children: [],
    });
  }
  // Preserve authored hierarchy, but surface malformed/orphaned records as roots instead of losing them.
  const parents = new Map(
    plotRows.map((r) => [
      r.sourceId,
      text(record(record(r.payload).parent).parentPlotDefinitionId),
    ]),
  );
  const plots: CampaignSessionTablePlot[] = [];
  for (const [id, plot] of plotsById) {
    const seen = new Set([id]);
    let parentId = parents.get(id);
    let cursor = parentId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
    if (cursor) parentId = undefined;
    const parent = parentId ? plotsById.get(parentId) : undefined;
    if (parent) (parent.children as CampaignSessionTablePlot[]).push(plot);
    else plots.push(plot);
  }
  if (!plots.length) unavailable.push("No captured Plot cues are available.");
  return {
    sessionName: source.sessionName,
    campaignInstanceName: source.campaignInstanceName,
    status: source.status,
    runtimeRevision: source.runtimeRevision,
    campaignTime: text(state.campaignTime),
    captured: source.captured,
    locations,
    focus,
    location,
    party,
    plots,
    unavailable,
    encounter: {
      status: "unavailable",
      detail:
        "Encounter adjudication and Rules execution are not available. This table is read-only.",
    },
  };
}

function capturedImage(value: unknown): LocationImage | undefined {
  const image = record(value);
  if (
    typeof image.assetId !== "string" ||
    typeof image.width !== "number" ||
    typeof image.height !== "number" ||
    typeof image.mimeType !== "string" ||
    !image.mimeType.startsWith("image/") ||
    !["scenic", "overhead", "side-on"].includes(String(image.orientation))
  )
    return undefined;
  return {
    assetId: image.assetId as LocationImage["assetId"],
    width: image.width,
    height: image.height,
    mimeType: image.mimeType as `image/${string}`,
    altText: name(image.altText, "Location image"),
    orientation: image.orientation as LocationImage["orientation"],
    uri: text(image.uri),
  };
}

function projectLocationPresentation(
  captured: Record<string, unknown>,
  override?: Record<string, unknown>,
) {
  const weather =
    override && Object.hasOwn(override, "weather")
      ? override.weather
      : captured.weather;
  return {
    ...(weather &&
    typeof weather === "object" &&
    !LocationDefinition.presentationIssue({ weather })
      ? { weather: weather as unknown as import("@aow/common").LocationWeather }
      : {}),
    weatherOverridden: !!override && Object.hasOwn(override, "weather"),
    ...(Array.isArray(captured.audiovisualEffects)
      ? {
          audiovisualEffects: captured.audiovisualEffects.filter(
            (cue) =>
              !LocationDefinition.presentationIssue({
                audiovisualEffects: [cue],
              }),
          ) as import("@aow/common").LocationAudiovisualEffect[],
        }
      : {}),
  };
}
