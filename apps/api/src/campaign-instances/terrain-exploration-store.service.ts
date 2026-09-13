import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  isTerrainActorPosition,
  type IsometricTerrainManifest,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import {
  isRecord,
  resolveTerrainManifest,
} from "../world-definitions/terrain-snapshot";
import { projectTerrainWithExploration } from "./terrain-exploration-projection";
import type {
  EvaluatedVisibilityDecision,
  ProjectionActor,
} from "./terrain-visibility-projection";

/** Internal persistence boundary, not an authorization endpoint.
 * The future rules executor must bind the caller/observer and evaluate the captured rules first.
 * This service accepts only its decision; terrain and actors always come from the locked database state.
 */
@Injectable()
export class TerrainExplorationStore {
  constructor(private readonly prisma: PrismaService) {}

  async projectAndStore(decision: EvaluatedVisibilityDecision) {
    const waiting = { status: "awaiting-visibility" as const };
    const context = decision.context;
    if (
      !context ||
      !Number.isSafeInteger(context.runtimeRevision) ||
      context.runtimeRevision < 1 ||
      [
        context.campaignInstanceId,
        context.snapshotId,
        context.locationId,
        context.observerId,
      ].some(
        (value) =>
          typeof value !== "string" || !value.trim() || value.length > 200,
      )
    )
      return waiting;
    // Own inputs before any await; a caller cannot mutate an in-flight decision.
    const evaluated = JSON.parse(
      JSON.stringify(decision),
    ) as EvaluatedVisibilityDecision;
    const scope = {
      campaignInstanceId: context.campaignInstanceId,
      snapshotId: context.snapshotId,
      locationId: context.locationId,
      observerId: context.observerId,
    };
    return this.prisma.$transaction(
      async (tx) => {
        // Runtime writers also acquire this row lock. READ COMMITTED reads the winner's revision
        // after a wait; lock precedes both source reads and the exploration read/merge/write.
        const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "CampaignInstanceRuntime"
        WHERE "campaignInstanceId" = ${scope.campaignInstanceId} FOR UPDATE
      `;
        if (locked.length !== 1) return waiting;
        const runtime = await tx.campaignInstanceRuntime.findUnique({
          where: { id: locked[0].id },
          include: {
            campaignInstance: {
              select: { currentSnapshotId: true, status: true },
            },
            campaignInstanceSnapshot: {
              select: {
                worldDefinitionSnapshot: { select: { manifest: true } },
              },
            },
          },
        });
        if (
          !runtime ||
          runtime.revision !== evaluated.context.runtimeRevision ||
          runtime.campaignInstanceSnapshotId !== scope.snapshotId ||
          runtime.campaignInstance.currentSnapshotId !== scope.snapshotId ||
          !["PREPARING", "ACTIVE", "PAUSED"].includes(
            runtime.campaignInstance.status,
          )
        )
          return waiting;
        const manifest =
          runtime.campaignInstanceSnapshot.worldDefinitionSnapshot.manifest;
        if (
          !isCanonicalSnapshotManifest(manifest) ||
          !isRecord(runtime.state) ||
          !Array.isArray(runtime.state.creatureEmbodiments)
        )
          return waiting;
        const location = manifest.records.find(
          (r) =>
            r.resourceType === "locations" && r.sourceId === scope.locationId,
        );
        const map = isRecord(location?.payload)
          ? location.payload.map
          : undefined;
        if (!isRecord(map) || map.kind !== "isometric") return waiting;
        const actors: ProjectionActor[] = [];
        for (const embodiment of runtime.state.creatureEmbodiments) {
          if (
            !isRecord(embodiment) ||
            embodiment.campaignInstanceId !== scope.campaignInstanceId ||
            !isRecord(embodiment.creature)
          )
            continue;
          const creature = embodiment.creature;
          if (
            creature.currentLocationId !== scope.locationId ||
            typeof embodiment.runtimeCreatureId !== "string" ||
            !isTerrainActorPosition(creature.terrainPosition)
          )
            continue;
          actors.push({
            id: embodiment.runtimeCreatureId,
            name:
              typeof creature.name === "string" && creature.name.trim()
                ? creature.name.trim()
                : "Creature",
            position: creature.terrainPosition,
          });
        }
        const previous = await tx.campaignTerrainExploration.findUnique({
          where: { campaignInstanceId_snapshotId_locationId_observerId: scope },
        });
        let result: ReturnType<typeof projectTerrainWithExploration>;
        try {
          if (
            previous &&
            (previous.runtimeRevision > runtime.revision ||
              canonicalJsonHash(previous.payload) !== previous.contentHash)
          )
            return waiting;
          result = projectTerrainWithExploration({
            context: evaluated.context,
            decision: evaluated,
            volume: resolveTerrainManifest(
              map as unknown as IsometricTerrainManifest,
              manifest.records,
            ),
            actors,
            previousExploration: previous?.payload,
          });
        } catch {
          return waiting;
        }
        if (result.status !== "ready") return waiting;
        const contentHash = canonicalJsonHash(result.exploration);
        // Identical retries do not rewrite timestamps or increment any gameplay revision.
        if (previous?.contentHash !== contentHash) {
          await tx.campaignTerrainExploration.upsert({
            where: {
              campaignInstanceId_snapshotId_locationId_observerId: scope,
            },
            create: {
              ...scope,
              runtimeRevision: runtime.revision,
              contentHash,
              payload: result.exploration as unknown as Prisma.InputJsonValue,
            },
            update: {
              runtimeRevision: runtime.revision,
              contentHash,
              payload: result.exploration as unknown as Prisma.InputJsonValue,
            },
          });
        }
        // Return only the redacted projection, and only after the transaction commits.
        return { status: "ready" as const, projection: result.projection };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 30000,
      },
    );
  }
}
