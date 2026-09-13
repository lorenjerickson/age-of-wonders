import { ConflictException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  parseTerrainExplorationSnapshot,
  type TerrainExplorationSnapshot,
} from "@aow/common";
import { canonicalJsonHash } from "../domain/snapshot-manifest";

type Client = Prisma.TransactionClient | PrismaClient;
const invalid = () =>
  new ConflictException(
    "Checkpoint exploration could not be verified. No changes were applied.",
  );
function digest(
  rows: readonly {
    locationId: string;
    observerId: string;
    contentHash: string;
  }[],
) {
  return canonicalJsonHash(
    rows
      .map(({ locationId, observerId, contentHash }) => ({
        locationId,
        observerId,
        contentHash,
      }))
      .sort((a, b) =>
        a.locationId < b.locationId
          ? -1
          : a.locationId > b.locationId
            ? 1
            : a.observerId < b.observerId
              ? -1
              : a.observerId > b.observerId
                ? 1
                : 0,
      ),
  );
}
function checked(
  payload: unknown,
  hash: string,
  scope: {
    campaignInstanceId: string;
    snapshotId: string;
    locationId: string;
    observerId: string;
  },
  revision: number,
): TerrainExplorationSnapshot {
  try {
    if (canonicalJsonHash(payload) !== hash) throw invalid();
    const memory = parseTerrainExplorationSnapshot(payload);
    if (
      memory.context.runtimeRevision > revision ||
      Object.entries(scope).some(
        ([key, value]) =>
          memory.context[key as keyof typeof memory.context] !== value,
      )
    )
      throw invalid();
    return memory;
  } catch {
    throw invalid();
  }
}
/** Calculate the seal before the immutable checkpoint is inserted; callers hold the runtime lock. */
export async function checkpointExplorationSeal(
  tx: Prisma.TransactionClient,
  campaignInstanceId: string,
  snapshotId: string,
) {
  const rows = await tx.campaignTerrainExploration.findMany({
    where: { campaignInstanceId, snapshotId },
    select: { locationId: true, observerId: true, contentHash: true },
  });
  return { explorationHash: digest(rows), explorationCount: rows.length };
}
/** Caller must exclude exploration writers before its transaction's first snapshot read. */
export async function captureCheckpointExploration(
  tx: Prisma.TransactionClient,
  checkpointId: string,
) {
  const checkpoint =
    await tx.campaignInstanceRuntimeCheckpoint.findUniqueOrThrow({
      where: { id: checkpointId },
    });
  const scope = {
    campaignInstanceId: checkpoint.campaignInstanceId,
    snapshotId: checkpoint.campaignInstanceSnapshotId,
  };
  const rows = await tx.campaignTerrainExploration.findMany({
    where: scope,
    select: { locationId: true, observerId: true, contentHash: true },
  });
  if (
    checkpoint.explorationCount !== rows.length ||
    checkpoint.explorationHash !== digest(rows)
  )
    throw invalid();
  for (const row of rows) {
    const source = await tx.campaignTerrainExploration.findUniqueOrThrow({
      where: {
        campaignInstanceId_snapshotId_locationId_observerId: {
          ...scope,
          locationId: row.locationId,
          observerId: row.observerId,
        },
      },
    });
    checked(
      source.payload,
      row.contentHash,
      { ...scope, locationId: row.locationId, observerId: row.observerId },
      checkpoint.runtimeRevision,
    );
    await tx.campaignCheckpointExploration.create({
      data: {
        checkpointId,
        ...scope,
        ...row,
        payload: source.payload as Prisma.InputJsonValue,
      },
    });
  }
}
/** Select the exact departure checkpoint through the adoption audit, never the newest memory rows. */
export async function restoreExplorationSource(
  client: Client,
  instanceId: string,
  currentSnapshotId: string,
) {
  const audit = await client.campaignInstanceMigrationAudit.findFirst({
    where: {
      campaignInstanceId: instanceId,
      resultSnapshotId: currentSnapshotId,
    },
    select: { sourceRuntimeCheckpointId: true, sourceSnapshotId: true },
  });
  if (!audit) throw invalid();
  const checkpoint = await client.campaignInstanceRuntimeCheckpoint.findFirst({
    where: {
      id: audit.sourceRuntimeCheckpointId,
      campaignInstanceId: instanceId,
      campaignInstanceSnapshotId: audit.sourceSnapshotId,
    },
  });
  if (!checkpoint) throw invalid();
  const rows = await client.campaignCheckpointExploration.findMany({
    where: { checkpointId: checkpoint.id },
    select: { locationId: true, observerId: true, contentHash: true },
  });
  if (
    checkpoint.explorationHash == null &&
    checkpoint.explorationCount == null
  ) {
    if (rows.length) throw invalid();
    return { checkpoint, rows, recorded: false as const };
  }
  if (
    checkpoint.explorationCount !== rows.length ||
    checkpoint.explorationHash !== digest(rows)
  )
    throw invalid();
  return { checkpoint, rows, recorded: true as const };
}
/** Exact capture recovery only; no geometry refresh or cross-map remapping. Current sight stays empty. */
export async function recoverCheckpointExploration(
  tx: Prisma.TransactionClient,
  source: Awaited<ReturnType<typeof restoreExplorationSource>>,
  targetSnapshotId: string,
  targetRevision: number,
) {
  const target = await tx.campaignInstanceSnapshot.findUniqueOrThrow({
    where: { id: targetSnapshotId },
  });
  const original = await tx.campaignInstanceSnapshot.findUniqueOrThrow({
    where: { id: source.checkpoint.campaignInstanceSnapshotId },
  });
  if (
    target.campaignInstanceId !== source.checkpoint.campaignInstanceId ||
    target.worldDefinitionSnapshotId !== original.worldDefinitionSnapshotId ||
    target.campaignDefinitionSnapshotId !==
      original.campaignDefinitionSnapshotId ||
    targetRevision <= source.checkpoint.runtimeRevision
  )
    throw invalid();
  for (const row of source.rows) {
    const saved = await tx.campaignCheckpointExploration.findUniqueOrThrow({
      where: {
        checkpointId_locationId_observerId: {
          checkpointId: source.checkpoint.id,
          locationId: row.locationId,
          observerId: row.observerId,
        },
      },
    });
    const memory = checked(
      saved.payload,
      row.contentHash,
      {
        campaignInstanceId: source.checkpoint.campaignInstanceId,
        snapshotId: source.checkpoint.campaignInstanceSnapshotId,
        locationId: row.locationId,
        observerId: row.observerId,
      },
      source.checkpoint.runtimeRevision,
    );
    // Reserve the restored runtime revision for a fresh observation; remembered timestamps remain historical.
    const recovered = parseTerrainExplorationSnapshot({
      ...memory,
      context: {
        ...memory.context,
        snapshotId: targetSnapshotId,
        runtimeRevision: targetRevision - 1,
      },
      visibleSurfaceKeys: [],
    });
    await tx.campaignTerrainExploration.create({
      data: {
        campaignInstanceId: target.campaignInstanceId,
        snapshotId: targetSnapshotId,
        locationId: row.locationId,
        observerId: row.observerId,
        runtimeRevision: recovered.context.runtimeRevision,
        payload: recovered as unknown as Prisma.InputJsonValue,
        contentHash: canonicalJsonHash(recovered),
      },
    });
  }
}
