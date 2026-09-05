import { Injectable } from "@nestjs/common";
import {
  InstallationRolloutPhase,
  Prisma,
  type CampaignInstanceStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { DOMAIN_RESOURCES } from "./domain-resource";
import {
  LegacyRealignmentPreflightService,
  type LegacyRealignmentInventory,
  type LegacyRealignmentPreflightReport,
} from "./legacy-realignment-preflight";
import {
  LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION,
  LegacyRealignmentShadowPlanError,
  planLegacyRealignmentShadowConversion,
  type LegacyRealignmentShadowDataset,
  type LegacyRealignmentShadowPlan,
  type ProposedShadowRow,
} from "./legacy-realignment-shadow-plan";

const REALIGNMENT_MIGRATION_KEY = "definition-instance-realignment-v1";
const DEFAULT_INSTALLATION_KEY = "single-tenant";
type JsonObject = Readonly<Record<string, unknown>>;
type ReadClient = Pick<
  Prisma.TransactionClient,
  | "domainRecord"
  | "campaignMembership"
  | "campaignInvitation"
  | "characterCreationDraft"
  | "user"
>;

export interface LegacyRealignmentMaterializerOptions {
  readonly apply?: boolean;
  readonly installationKey?: string;
  readonly capturedAt?: string;
  /** Explicit GM who adopts and owns every migrated Definition/Instance. */
  readonly ownerUserId?: string;
}

export interface LegacyRealignmentMaterializationCounts {
  readonly worldDefinitions: number;
  readonly worldDefinitionRevisions: number;
  readonly worldDefinitionSnapshots: number;
  readonly campaignDefinitions: number;
  readonly campaignDefinitionRevisions: number;
  readonly campaignDefinitionSnapshots: number;
  readonly campaignInstances: number;
  readonly campaignInstanceSnapshots: number;
  readonly campaignInstanceRuntimes: number;
  readonly legacyIdentityMappings: number;
  readonly deferredDependentRebindings: number;
  readonly retainedLegacyRecords: number;
}

export interface LegacyRealignmentMaterializationReport {
  readonly version: typeof LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION;
  readonly mode: "dry-run" | "blocked" | "applied";
  readonly applied: boolean;
  readonly readyForApply: boolean;
  readonly blockingIssueCount: number;
  readonly inventory: LegacyRealignmentInventory;
  readonly planned: LegacyRealignmentMaterializationCounts;
}

interface PreparedMaterialization {
  readonly preflight: LegacyRealignmentPreflightReport;
  readonly plan?: LegacyRealignmentShadowPlan;
  readonly blockingIssueCount: number;
}

/**
 * Materializes the additive Definition/Instance spine without rebinding any
 * legacy row or changing read paths. Dry-run is the default and performs no
 * transaction or write. Apply performs preflight, capture, and all shadow
 * writes inside one serializable database transaction.
 */
@Injectable()
export class LegacyRealignmentShadowMaterializerService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    options: LegacyRealignmentMaterializerOptions = {},
  ): Promise<LegacyRealignmentMaterializationReport> {
    const requestedCapturedAt = validCaptureTime(
      options.capturedAt ?? new Date().toISOString(),
    );
    const installationKey =
      options.installationKey?.trim() || DEFAULT_INSTALLATION_KEY;
    const ownerUserId = options.ownerUserId?.trim();
    if (!ownerUserId) {
      throw new Error(
        "Shadow materialization requires an explicitly selected GM owner.",
      );
    }

    if (!options.apply) {
      await validateGmOwner(this.prisma, ownerUserId);
      const prepared = await this.prepare(this.prisma, requestedCapturedAt);
      return this.report(prepared, "dry-run", false);
    }

    return this.prisma.$transaction(
      async (transaction) => {
        await validateGmOwner(transaction, ownerUserId);
        const existingRollout =
          await transaction.installationRolloutState.findUnique({
            where: {
              installationKey_migrationKey: {
                installationKey,
                migrationKey: REALIGNMENT_MIGRATION_KEY,
              },
            },
            select: { startedAt: true, initiatedByUserId: true },
          });
        if (
          existingRollout?.initiatedByUserId &&
          existingRollout.initiatedByUserId !== ownerUserId
        ) {
          throw new Error(
            "The existing shadow rollout belongs to a different GM owner.",
          );
        }
        const capturedAt =
          existingRollout?.startedAt?.toISOString() ?? requestedCapturedAt;
        const prepared = await this.prepare(transaction, capturedAt);
        if (!prepared.plan) {
          await this.recordBlocked(
            transaction,
            installationKey,
            capturedAt,
            prepared,
            ownerUserId,
          );
          return this.report(prepared, "blocked", false);
        }
        await this.materialize(
          transaction,
          installationKey,
          capturedAt,
          prepared,
          ownerUserId,
        );
        return this.report(prepared, "applied", true);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async prepare(
    client: ReadClient,
    capturedAt: string,
  ): Promise<PreparedMaterialization> {
    const preflight = await new LegacyRealignmentPreflightService(client).run();
    if (!preflight.readyForMigration) {
      return {
        preflight,
        blockingIssueCount: preflight.issues.length,
      };
    }

    const dataset = await this.loadDataset(client, capturedAt);
    try {
      return {
        preflight,
        plan: planLegacyRealignmentShadowConversion(dataset),
        blockingIssueCount: 0,
      };
    } catch (error) {
      if (!(error instanceof LegacyRealignmentShadowPlanError)) throw error;
      return {
        preflight,
        blockingIssueCount: error.issues.length,
      };
    }
  }

  private async loadDataset(
    client: ReadClient,
    capturedAt: string,
  ): Promise<LegacyRealignmentShadowDataset> {
    const [domainRecords, memberships, invitations, characterDrafts] =
      await Promise.all([
        client.domainRecord.findMany({
          where: { resource: { in: [...DOMAIN_RESOURCES] } },
          select: {
            resource: true,
            id: true,
            kind: true,
            revision: true,
            data: true,
          },
          orderBy: [{ resource: "asc" }, { id: "asc" }],
        }),
        client.campaignMembership.findMany({
          select: {
            id: true,
            campaignId: true,
            role: true,
            status: true,
            characterIds: true,
            activeCharacterId: true,
          },
          orderBy: { id: "asc" },
        }),
        client.campaignInvitation.findMany({
          select: {
            id: true,
            campaignId: true,
            role: true,
            status: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
          },
          orderBy: { id: "asc" },
        }),
        client.characterCreationDraft.findMany({
          select: {
            id: true,
            membershipId: true,
            characterId: true,
            revision: true,
            status: true,
            name: true,
            backgroundDefinitionId: true,
            professionDefinitionId: true,
            heritageDefinitionIds: true,
            attributeRolls: true,
            attributeAssignments: true,
            startingEquipmentIds: true,
            biography: true,
            imageAssetIds: true,
          },
          orderBy: { id: "asc" },
        }),
      ]);

    return {
      capturedAt,
      domainRecords: domainRecords.map((record) => ({
        resource: record.resource,
        id: record.id,
        kind: record.kind,
        revision: record.revision,
        data: asObject(record.data),
      })),
      memberships: memberships.map(({ id, campaignId, ...data }) => ({
        id,
        campaignId,
        data: toJsonObject(data),
      })),
      invitations: invitations.map(({ id, campaignId, ...data }) => ({
        id,
        campaignId,
        data: toJsonObject(data),
      })),
      characterDrafts: characterDrafts.map(
        ({ id, membershipId, characterId, ...data }) => ({
          id,
          membershipId,
          characterId,
          data: toJsonObject(data),
        }),
      ),
    };
  }

  private async recordBlocked(
    transaction: Prisma.TransactionClient,
    installationKey: string,
    capturedAt: string,
    prepared: PreparedMaterialization,
    ownerUserId: string,
  ): Promise<void> {
    const rolloutId = deterministicInternalId(
      "installation-rollout",
      `${installationKey}:${REALIGNMENT_MIGRATION_KEY}`,
    );
    const rollout = await transaction.installationRolloutState.upsert({
      where: {
        installationKey_migrationKey: {
          installationKey,
          migrationKey: REALIGNMENT_MIGRATION_KEY,
        },
      },
      create: {
        id: rolloutId,
        installationKey,
        migrationKey: REALIGNMENT_MIGRATION_KEY,
        targetVersion: LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION,
        phase: InstallationRolloutPhase.BLOCKED,
        preflightReport: inputJson(prepared.preflight),
        checkpoint: inputJson({
          blockingIssueCount: prepared.blockingIssueCount,
        }),
        startedAt: new Date(capturedAt),
        initiatedByUserId: ownerUserId,
        updatedAt: new Date(capturedAt),
      },
      update: {
        phase: InstallationRolloutPhase.BLOCKED,
        preflightReport: inputJson(prepared.preflight),
        checkpoint: inputJson({
          blockingIssueCount: prepared.blockingIssueCount,
        }),
        startedAt: new Date(capturedAt),
        initiatedByUserId: ownerUserId,
        completedAt: null,
        updatedAt: new Date(capturedAt),
      },
    });
    await transaction.installationRolloutAudit.create({
      data: {
        rolloutStateId: rollout.id,
        phase: InstallationRolloutPhase.BLOCKED,
        action: "shadow-materialization-refused",
        details: inputJson({
          blockingIssueCount: prepared.blockingIssueCount,
        }),
        actorUserId: ownerUserId,
        createdAt: new Date(capturedAt),
      },
    });
  }

  private async materialize(
    transaction: Prisma.TransactionClient,
    installationKey: string,
    capturedAt: string,
    prepared: PreparedMaterialization & {
      readonly plan?: LegacyRealignmentShadowPlan;
    },
    ownerUserId: string,
  ): Promise<void> {
    const plan = prepared.plan;
    if (!plan) throw new Error("A ready materialization requires a plan.");
    const at = new Date(capturedAt);
    const rolloutId = deterministicInternalId(
      "installation-rollout",
      `${installationKey}:${REALIGNMENT_MIGRATION_KEY}`,
    );
    const counts = countsFromPlan(plan);

    const rollout = await transaction.installationRolloutState.upsert({
      where: {
        installationKey_migrationKey: {
          installationKey,
          migrationKey: REALIGNMENT_MIGRATION_KEY,
        },
      },
      create: {
        id: rolloutId,
        installationKey,
        migrationKey: REALIGNMENT_MIGRATION_KEY,
        targetVersion: plan.version,
        phase: InstallationRolloutPhase.SHADOW_WRITING,
        preflightReport: inputJson(prepared.preflight),
        checkpoint: inputJson({ planned: counts }),
        startedAt: at,
        initiatedByUserId: ownerUserId,
        updatedAt: at,
      },
      update: {
        phase: InstallationRolloutPhase.SHADOW_WRITING,
        preflightReport: inputJson(prepared.preflight),
        checkpoint: inputJson({ planned: counts }),
        startedAt: at,
        initiatedByUserId: ownerUserId,
        completedAt: null,
        updatedAt: at,
      },
    });
    await transaction.installationRolloutAudit.create({
      data: {
        rolloutStateId: rollout.id,
        phase: InstallationRolloutPhase.SHADOW_WRITING,
        action: "shadow-materialization-started",
        details: inputJson({ planned: counts }),
        actorUserId: ownerUserId,
        createdAt: at,
      },
    });

    await this.createWorldRows(transaction, plan, at, ownerUserId);
    await this.createCampaignRows(transaction, plan, at, ownerUserId);
    await this.createInstanceRows(transaction, plan, at, ownerUserId);

    if (plan.legacyIdentityMap.length > 0) {
      const sourceRevisions = new Map(
        (
          await transaction.domainRecord.findMany({
            where: { resource: { in: [...DOMAIN_RESOURCES] } },
            select: { resource: true, id: true, revision: true },
          })
        ).map((record) => [
          `${record.resource}\0${record.id}`,
          record.revision,
        ]),
      );
      await createManyIfAny(
        transaction.legacyIdentityMap,
        plan.legacyIdentityMap.map((entry) => ({
          id: deterministicInternalId(
            "legacy-identity-map",
            `${entry.legacyResource}:${entry.legacyId}:${entry.targetType}`,
          ),
          legacyResource: entry.legacyResource,
          legacyId: entry.legacyId,
          targetType: entry.targetType,
          targetId: entry.targetId,
          sourceDomainRevision: sourceRevisions.get(
            `${entry.legacyResource}\0${entry.legacyId}`,
          ),
          mappingMetadata: inputJson({ planVersion: plan.version }),
          createdAt: at,
        })),
      );
    }

    await transaction.installationRolloutState.update({
      where: { id: rollout.id },
      data: {
        phase: InstallationRolloutPhase.READY_FOR_CUTOVER,
        checkpoint: inputJson({ materialized: counts }),
        completedAt: null,
        updatedAt: at,
      },
    });
    await transaction.installationRolloutAudit.create({
      data: {
        rolloutStateId: rollout.id,
        phase: InstallationRolloutPhase.READY_FOR_CUTOVER,
        action: "shadow-materialization-ready-for-cutover",
        details: inputJson({ materialized: counts }),
        actorUserId: ownerUserId,
        createdAt: at,
      },
    });
  }

  private async createWorldRows(
    transaction: Prisma.TransactionClient,
    plan: LegacyRealignmentShadowPlan,
    at: Date,
    ownerUserId: string,
  ): Promise<void> {
    const definitionsById = indexRows(plan.rows.worldDefinitions);
    await adoptNullableAttribution(
      transaction.worldDefinition,
      plan.rows.worldDefinitions,
      "ownerUserId",
      ownerUserId,
    );
    await createManyIfAny(
      transaction.worldDefinition,
      plan.rows.worldDefinitions.map((row) => ({
        id: row.id,
        name: stringField(row.payload, "name"),
        status: "ACTIVE" as const,
        ownerUserId,
        createdAt: at,
        updatedAt: at,
      })),
    );
    await createManyIfAny(
      transaction.worldDefinitionRevision,
      plan.rows.worldDefinitionRevisions.map((row) => {
        const definition = definitionsById.get(
          stringField(row.payload, "worldDefinitionId"),
        );
        return {
          id: row.id,
          worldDefinitionId: stringField(row.payload, "worldDefinitionId"),
          revisionNumber: numberField(row.payload, "revisionNumber"),
          name: definition
            ? stringField(definition.payload, "name")
            : "Unnamed World",
          content: inputJson(row.payload.content),
          contentHash: stringField(row.payload, "contentHash"),
          createdByUserId: ownerUserId,
          publishedAt: dateField(row.payload, "publishedAt"),
          createdAt: at,
        };
      }),
      { allowExistingNullFields: ["createdByUserId"] },
    );
    await createManyIfAny(
      transaction.worldDefinitionSnapshot,
      plan.rows.worldDefinitionSnapshots.map((row) => {
        const manifest = objectField(row.payload, "manifest");
        return {
          id: row.id,
          worldDefinitionId: stringField(row.payload, "worldDefinitionId"),
          worldDefinitionRevisionId: stringField(
            row.payload,
            "worldDefinitionRevisionId",
          ),
          manifest: inputJson(manifest),
          contentHash: stringField(manifest, "contentHash"),
          capturedAt: dateField(row.payload, "capturedAt"),
        };
      }),
    );
    for (const row of plan.rows.worldDefinitions) {
      await requirePointerUpdate(
        transaction.worldDefinition,
        row.id,
        "currentRevisionId",
        stringField(row.payload, "currentRevisionId"),
      );
    }
  }

  private async createCampaignRows(
    transaction: Prisma.TransactionClient,
    plan: LegacyRealignmentShadowPlan,
    at: Date,
    ownerUserId: string,
  ): Promise<void> {
    const definitionsById = indexRows(plan.rows.campaignDefinitions);
    await adoptNullableAttribution(
      transaction.campaignDefinition,
      plan.rows.campaignDefinitions,
      "ownerUserId",
      ownerUserId,
    );
    await createManyIfAny(
      transaction.campaignDefinition,
      plan.rows.campaignDefinitions.map((row) => ({
        id: row.id,
        worldDefinitionId: stringField(row.payload, "worldDefinitionId"),
        name: stringField(row.payload, "name"),
        status: "ACTIVE" as const,
        ownerUserId,
        createdAt: at,
        updatedAt: at,
      })),
    );
    await createManyIfAny(
      transaction.campaignDefinitionRevision,
      plan.rows.campaignDefinitionRevisions.map((row) => {
        const campaignDefinitionId = stringField(
          row.payload,
          "campaignDefinitionId",
        );
        const definition = definitionsById.get(campaignDefinitionId);
        return {
          id: row.id,
          campaignDefinitionId,
          worldDefinitionId: definition
            ? stringField(definition.payload, "worldDefinitionId")
            : "",
          capturedWorldSnapshotId: stringField(
            row.payload,
            "capturedWorldSnapshotId",
          ),
          revisionNumber: numberField(row.payload, "revisionNumber"),
          name: definition
            ? stringField(definition.payload, "name")
            : "Unnamed Campaign",
          content: inputJson(row.payload.legacyCampaignPayload),
          contentHash: stringField(row.payload, "contentHash"),
          createdByUserId: ownerUserId,
          publishedAt: dateField(row.payload, "publishedAt"),
          createdAt: at,
        };
      }),
      { allowExistingNullFields: ["createdByUserId"] },
    );
    await createManyIfAny(
      transaction.campaignDefinitionSnapshot,
      plan.rows.campaignDefinitionSnapshots.map((row) => {
        const manifest = objectField(row.payload, "manifest");
        return {
          id: row.id,
          campaignDefinitionId: stringField(
            row.payload,
            "campaignDefinitionId",
          ),
          campaignDefinitionRevisionId: stringField(
            row.payload,
            "campaignDefinitionRevisionId",
          ),
          capturedWorldSnapshotId: stringField(
            row.payload,
            "capturedWorldSnapshotId",
          ),
          manifest: inputJson(manifest),
          contentHash: stringField(manifest, "contentHash"),
          capturedAt: dateField(row.payload, "capturedAt"),
        };
      }),
    );
    for (const row of plan.rows.campaignDefinitions) {
      await requirePointerUpdate(
        transaction.campaignDefinition,
        row.id,
        "currentRevisionId",
        stringField(row.payload, "currentRevisionId"),
      );
    }
  }

  private async createInstanceRows(
    transaction: Prisma.TransactionClient,
    plan: LegacyRealignmentShadowPlan,
    at: Date,
    ownerUserId: string,
  ): Promise<void> {
    const campaignSnapshotsById = indexRows(
      plan.rows.campaignDefinitionSnapshots,
    );
    await adoptNullableAttribution(
      transaction.campaignInstance,
      plan.rows.campaignInstances,
      "createdByUserId",
      ownerUserId,
    );
    await createManyIfAny(
      transaction.campaignInstance,
      plan.rows.campaignInstances.map((row) => ({
        id: row.id,
        campaignDefinitionId: stringField(row.payload, "campaignDefinitionId"),
        name: stringField(row.payload, "name"),
        status: instanceStatus(stringField(row.payload, "status")),
        createdByUserId: ownerUserId,
        createdAt: dateField(row.payload, "createdAt"),
        updatedAt: at,
      })),
    );
    await createManyIfAny(
      transaction.campaignInstanceSnapshot,
      plan.rows.campaignInstanceSnapshots.map((row) => {
        const campaignDefinitionSnapshotId = stringField(
          row.payload,
          "campaignDefinitionSnapshotId",
        );
        const campaignSnapshot = campaignSnapshotsById.get(
          campaignDefinitionSnapshotId,
        );
        const manifest = objectField(row.payload, "manifest");
        return {
          id: row.id,
          campaignInstanceId: stringField(row.payload, "campaignInstanceId"),
          campaignDefinitionId: campaignSnapshot
            ? stringField(campaignSnapshot.payload, "campaignDefinitionId")
            : "",
          campaignDefinitionSnapshotId,
          worldDefinitionSnapshotId: stringField(
            row.payload,
            "worldDefinitionSnapshotId",
          ),
          snapshotNumber: numberField(row.payload, "snapshotNumber"),
          reason: "INITIAL" as const,
          createdByUserId: ownerUserId,
          manifest: inputJson(manifest),
          contentHash: stringField(manifest, "contentHash"),
          adoptedAt: dateField(row.payload, "adoptedAt"),
        };
      }),
      { allowExistingNullFields: ["createdByUserId"] },
    );
    for (const row of plan.rows.campaignInstances) {
      await requirePointerUpdate(
        transaction.campaignInstance,
        row.id,
        "currentSnapshotId",
        stringField(row.payload, "currentSnapshotId"),
      );
    }
    await createManyIfAny(
      transaction.campaignInstanceRuntime,
      plan.rows.campaignInstanceRuntimes.map((row) => ({
        id: row.id,
        campaignInstanceId: stringField(row.payload, "campaignInstanceId"),
        campaignInstanceSnapshotId: stringField(
          row.payload,
          "campaignInstanceSnapshotId",
        ),
        state: inputJson({ legacyGamePayload: row.payload.legacyGamePayload }),
        extensions: inputJson({}),
        revision: 1,
        createdAt: at,
        updatedAt: at,
      })),
    );
  }

  private report(
    prepared: PreparedMaterialization,
    mode: LegacyRealignmentMaterializationReport["mode"],
    applied: boolean,
  ): LegacyRealignmentMaterializationReport {
    return {
      version: LEGACY_REALIGNMENT_SHADOW_PLAN_VERSION,
      mode,
      applied,
      readyForApply: prepared.blockingIssueCount === 0,
      blockingIssueCount: prepared.blockingIssueCount,
      inventory: prepared.preflight.inventory,
      planned: prepared.plan ? countsFromPlan(prepared.plan) : emptyCounts(),
    };
  }
}

function countsFromPlan(
  plan: LegacyRealignmentShadowPlan,
): LegacyRealignmentMaterializationCounts {
  return {
    worldDefinitions: plan.rows.worldDefinitions.length,
    worldDefinitionRevisions: plan.rows.worldDefinitionRevisions.length,
    worldDefinitionSnapshots: plan.rows.worldDefinitionSnapshots.length,
    campaignDefinitions: plan.rows.campaignDefinitions.length,
    campaignDefinitionRevisions: plan.rows.campaignDefinitionRevisions.length,
    campaignDefinitionSnapshots: plan.rows.campaignDefinitionSnapshots.length,
    campaignInstances: plan.rows.campaignInstances.length,
    campaignInstanceSnapshots: plan.rows.campaignInstanceSnapshots.length,
    campaignInstanceRuntimes: plan.rows.campaignInstanceRuntimes.length,
    legacyIdentityMappings: plan.legacyIdentityMap.length,
    deferredDependentRebindings: plan.dependentRebindings.length,
    retainedLegacyRecords: plan.retainedLegacyRecords.length,
  };
}

function emptyCounts(): LegacyRealignmentMaterializationCounts {
  return {
    worldDefinitions: 0,
    worldDefinitionRevisions: 0,
    worldDefinitionSnapshots: 0,
    campaignDefinitions: 0,
    campaignDefinitionRevisions: 0,
    campaignDefinitionSnapshots: 0,
    campaignInstances: 0,
    campaignInstanceSnapshots: 0,
    campaignInstanceRuntimes: 0,
    legacyIdentityMappings: 0,
    deferredDependentRebindings: 0,
    retainedLegacyRecords: 0,
  };
}

function indexRows<Payload>(
  rows: readonly ProposedShadowRow<Payload>[],
): ReadonlyMap<string, ProposedShadowRow<Payload>> {
  return new Map(rows.map((row) => [row.id, row]));
}

async function adoptNullableAttribution(
  delegate: { updateMany(args: unknown): Promise<{ readonly count: number }> },
  rows: readonly ProposedShadowRow<unknown>[],
  field: "ownerUserId" | "createdByUserId",
  ownerUserId: string,
): Promise<void> {
  if (rows.length === 0) return;
  await delegate.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, [field]: null },
    data: { [field]: ownerUserId },
  });
}

export async function createManyIfAny(
  delegate: {
    createMany(args: unknown): Promise<{ readonly count: number }>;
    findMany(args: unknown): Promise<readonly unknown[]>;
  },
  data: readonly unknown[],
  options: {
    readonly allowExistingNullFields?: readonly string[];
  } = {},
): Promise<void> {
  if (data.length === 0) return;
  const created = await delegate.createMany({ data, skipDuplicates: true });
  if (created.count >= data.length) return;
  const desired = data.map(requireObject);
  const ids = desired.map((row) => stringField(row, "id"));
  const existing = (await delegate.findMany({
    where: { id: { in: ids } },
  })).map(requireObject);
  const existingById = new Map(
    existing.map((row) => [stringField(row, "id"), row]),
  );
  for (const row of desired) {
    const persisted = existingById.get(stringField(row, "id"));
    if (
      !persisted ||
      !containsEquivalentFields(
        persisted,
        row,
        new Set(options.allowExistingNullFields ?? []),
      )
    ) {
      throw new Error(
        "Existing shadow data differs from the deterministic migration plan.",
      );
    }
  }
}

async function validateGmOwner(
  client: Pick<Prisma.TransactionClient, "user">,
  ownerUserId: string,
): Promise<void> {
  const owner = await client.user.findUnique({
    where: { id: ownerUserId },
    select: { id: true, role: true },
  });
  if (!owner || owner.role !== "GM") {
    throw new Error(
      "Shadow materialization requires an existing GM owner.",
    );
  }
}

function validCaptureTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Shadow materialization requires a valid capture time.");
  }
  return parsed.toISOString();
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Shadow materialization expected an object row.");
  }
  return value as Record<string, unknown>;
}

function containsEquivalentFields(
  persisted: Record<string, unknown>,
  desired: Record<string, unknown>,
  allowExistingNullFields: ReadonlySet<string>,
): boolean {
  return Object.entries(desired).every(([key, value]) => {
    if (allowExistingNullFields.has(key) && persisted[key] === null) return true;
    return equivalentValue(persisted[key], value);
  });
}

function equivalentValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left as string | number | Date).toISOString() ===
      new Date(right as string | number | Date).toISOString();
  }
  return JSON.stringify(canonicalComparable(left)) ===
    JSON.stringify(canonicalComparable(right));
}

function canonicalComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalComparable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalComparable(child)]),
  );
}

async function requirePointerUpdate(
  delegate: { updateMany(args: unknown): Promise<{ count: number }> },
  id: string,
  field: "currentRevisionId" | "currentSnapshotId",
  value: string,
): Promise<void> {
  const result = await delegate.updateMany({
    where: { id, OR: [{ [field]: null }, { [field]: value }] },
    data: { [field]: value },
  });
  if (result.count !== 1) {
    throw new Error(
      "Existing shadow lineage points at a different immutable capture.",
    );
  }
}

function instanceStatus(value: string): CampaignInstanceStatus {
  const normalized = value.toUpperCase();
  if (
    normalized === "PREPARING" ||
    normalized === "ACTIVE" ||
    normalized === "PAUSED" ||
    normalized === "CONCLUDED" ||
    normalized === "ARCHIVED"
  ) {
    return normalized;
  }
  throw new Error("The shadow plan contains an unsupported Instance status.");
}

function deterministicInternalId(kind: string, source: string): string {
  return `realignment:v1:${kind}:${createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 32)}`;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asObject(value: Prisma.JsonValue): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  throw new Error("A legacy DomainRecord payload is not a JSON object.");
}

function toJsonObject(value: object): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function stringField(value: object, field: string): string {
  const result = (value as Record<string, unknown>)[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`The shadow plan is missing required field ${field}.`);
  }
  return result;
}

function numberField(value: object, field: string): number {
  const result = (value as Record<string, unknown>)[field];
  if (typeof result !== "number" || !Number.isInteger(result)) {
    throw new Error(`The shadow plan is missing required field ${field}.`);
  }
  return result;
}

function objectField(value: object, field: string): JsonObject {
  const result = (value as Record<string, unknown>)[field];
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`The shadow plan is missing required field ${field}.`);
  }
  return result as JsonObject;
}

function dateField(value: object, field: string): Date {
  const result = new Date(stringField(value, field));
  if (Number.isNaN(result.valueOf())) {
    throw new Error(`The shadow plan has an invalid date field ${field}.`);
  }
  return result;
}
