import { worldAccessWhere } from "../world-definitions/world-access";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ModelElementLineage,
  ModelElementRevision,
  ModelMigrationPlan,
  ModelRegistry,
  ModelSchemaRelease,
} from "@aow/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  compileModelSchemaRelease,
  modelElementRevisionContentHash,
  modelSchemaReleaseContentHash,
  validateModelMigrationPlan,
  validateModelSchemaCompilation,
  type CompiledModelSchema,
  type ModelSchemaCompilationInput,
  type ModelRegistryValidationResult,
} from "./model-registry-compiler";
import type {
  CreateModelMigrationPlanDto,
  CreateModelRegistryDto,
  ExtendModelSchemaReleaseDto,
  ModelElementRevisionPayloadDto,
} from "./dto/model-registry.dto";
import { CORE_MODEL_SCHEMA_RELEASE_ID } from "./editable-core-model-seed";
import {
  assertModelElementRuntimeShape,
  assertModelMigrationMappingsRuntimeShape,
} from "./model-registry-runtime-validator";

@Injectable()
export class ModelRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = 50, offset = 0) {
    const where = { OR: [{ ownerUserId: userId }, { ownerUserId: null }] };
    const [rows, total] = await Promise.all([
      this.prisma.modelRegistry.findMany({
        where,
        select: registrySelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.modelRegistry.count({ where }),
    ]);
    return { items: rows.map(registryResponse), total, limit, offset };
  }

  async get(id: string, userId: string) {
    const row = await this.prisma.modelRegistry.findFirst({
      where: { id, OR: [{ ownerUserId: userId }, { ownerUserId: null }] },
      select: {
        ...registrySelect,
        elements: {
          select: {
            ...elementSelect,
            revisions: {
              select: revisionSelect,
              orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
            },
          },
          orderBy: [{ key: "asc" }, { id: "asc" }],
        },
        releases: {
          select: releaseSelect,
          orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
        },
      },
    });
    if (!row) throw missing();
    return {
      ...registryResponse(row),
      elements: row.elements.map((element) => ({
        ...elementResponse(element),
        revisions: element.revisions.map(revisionResponse),
      })),
      releases: row.releases.map(releaseResponse),
    };
  }

  async create(dto: CreateModelRegistryDto, userId: string) {
    try {
      const row = await this.prisma.modelRegistry.create({
        data: {
          key: dto.key.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          provenance: {
            kind: "gm",
            namespace: dto.key.split(":", 1)[0],
            ownerUserId: userId,
          },
          ownerUserId: userId,
        },
        select: registrySelect,
      });
      return registryResponse(row);
    } catch (error) {
      if (isConflict(error))
        throw new ConflictException("A Model Registry already uses that key.");
      throw unavailable();
    }
  }

  async extendRelease(
    registryId: string,
    dto: ExtendModelSchemaReleaseDto,
    userId: string,
  ) {
    const requestedAdditions = dto.elements ?? [];
    const requestedRevisions = dto.revisions ?? [];
    const requestedArchives = dto.archiveElementIds ?? [];
    if (
      !Array.isArray(requestedAdditions) ||
      !Array.isArray(requestedRevisions) ||
      !Array.isArray(requestedArchives) ||
      requestedAdditions.length > 100 ||
      requestedRevisions.length > 100 ||
      requestedArchives.length > 100
    )
      throw new BadRequestException(
        "Model Element changes must be supplied as supported lists.",
      );
    for (const element of requestedAdditions)
      assertModelElementRuntimeShape(element);
    assertModelMigrationMappingsRuntimeShape(dto.migrationMappings ?? []);
    if (
      requestedAdditions.length +
        requestedRevisions.length +
        requestedArchives.length ===
      0
    )
      throw new BadRequestException(
        "Change at least one Model Element before publishing a successor release.",
      );
    const compiledCore = (
      await this.compileAccessibleRoot(CORE_MODEL_SCHEMA_RELEASE_ID, userId)
    ).compiled;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const registry = await tx.modelRegistry.findUnique({
            where: { id: registryId, ownerUserId: userId },
            select: registrySelect,
          });
          if (!registry) throw missing();
          const predecessor = await tx.modelSchemaRelease.findFirst({
            where: { registryId },
            orderBy: { revisionNumber: "desc" },
            select: releaseSelect,
          });
          if ((predecessor?.id ?? undefined) !== dto.predecessorRevisionId)
            throw new ConflictException(
              "The Model Registry release changed; refresh before publishing.",
            );
          const previousSelections = predecessor
            ? readSelections(predecessor.elementSelections)
            : [];
          const dependencyIds = predecessor
            ? readDependencyIds(predecessor.dependencies)
            : [CORE_MODEL_SCHEMA_RELEASE_ID as string];
          if (
            dependencyIds.length !== 1 ||
            dependencyIds[0] !== CORE_MODEL_SCHEMA_RELEASE_ID
          ) {
            throw new BadRequestException(
              "This Model Registry requires an unsupported dependency closure.",
            );
          }
          const previousElementIds = previousSelections.map(
            (selection) => selection.elementId as string,
          );
          const previousRevisionIds = previousSelections.map(
            (selection) => selection.elementRevisionId as string,
          );
          const previousLineages = await tx.modelElementLineage.findMany({
            where: { registryId, id: { in: previousElementIds } },
            select: elementSelect,
          });
          const previousRevisions = await tx.modelElementRevision.findMany({
            where: { id: { in: previousRevisionIds } },
            select: revisionSelect,
          });
          if (
            previousLineages.length !== previousSelections.length ||
            previousRevisions.length !== previousSelections.length
          )
            throw new BadRequestException(
              "The predecessor Model Schema release is incomplete.",
            );
          const lineageById = new Map(
            previousLineages.map((lineage) => [lineage.id, lineage]),
          );
          const revisionById = new Map(
            previousRevisions.map((revision) => [revision.id, revision]),
          );
          const changedElementIds = [
            ...requestedRevisions.map(({ elementId }) => elementId),
            ...requestedArchives,
          ];
          if (new Set(changedElementIds).size !== changedElementIds.length)
            throw new BadRequestException(
              "A Model Element may be revised or archived only once per release.",
            );
          const publishedAt = new Date();
          const additions = requestedAdditions.map((element) => {
            const elementId = randomUUID();
            const revisionId = randomUUID();
            const lineage = commonLineage(
              elementId,
              registryId,
              element,
              revisionId,
            );
            const revision = commonRevision(
              revisionId,
              elementId,
              1,
              undefined,
              element,
              userId,
              publishedAt,
            );
            if (revision.payload.kind !== lineage.kind)
              throw new BadRequestException(
                "A Model Element kind does not match its payload.",
              );
            return { element, lineage, revision };
          });
          const revisions = requestedRevisions.map((change) => {
            const lineage = lineageById.get(change.elementId);
            const selected = lineage?.currentRevisionId
              ? revisionById.get(lineage.currentRevisionId)
              : undefined;
            if (
              !lineage ||
              lineage.status !== "ACTIVE" ||
              !selected ||
              selected.id !== change.predecessorRevisionId
            )
              throw new ConflictException(
                "A Model Element changed; refresh before publishing.",
              );
            assertModelElementRuntimeShape({
              key: lineage.key,
              kind: lineage.kind,
              semanticRole: lineage.semanticRole,
              applicability: lineage.applicability,
              payload: change.payload,
              presentation: change.presentation,
              ...(change.dependencies
                ? { dependencies: change.dependencies }
                : {}),
              ...(change.source ? { source: change.source } : {}),
            });
            const revision = commonRevision(
              randomUUID(),
              lineage.id,
              selected.revisionNumber + 1,
              selected.id,
              change,
              userId,
              publishedAt,
            );
            if (revision.payload.kind !== lineage.kind)
              throw new BadRequestException(
                "A Model Element kind does not match its payload.",
              );
            return { lineage, revision };
          });
          const archived = requestedArchives.map((elementId) => {
            const lineage = lineageById.get(elementId);
            if (!lineage || lineage.status !== "ACTIVE")
              throw new ConflictException(
                "A Model Element changed; refresh before publishing.",
              );
            return lineage;
          });
          const revisedById = new Map(
            revisions.map((change) => [change.lineage.id, change]),
          );
          const archivedIds = new Set(archived.map(({ id }) => id));
          const releaseId = randomUUID();
          const releaseNumber = (predecessor?.revisionNumber ?? 0) + 1;
          const provisional: ModelSchemaRelease = {
            identity: {
              id: releaseId as ModelSchemaRelease["identity"]["id"],
              lineageId:
                registry.id as ModelSchemaRelease["identity"]["lineageId"],
              revisionNumber: releaseNumber,
              predecessorRevisionId:
                predecessor?.id as ModelSchemaRelease["identity"]["predecessorRevisionId"],
              publishedAt: publishedAt.toISOString(),
              contentHash: "",
            },
            name: dto.name.trim(),
            elementSelections: [
              ...previousSelections.flatMap((selection) => {
                if (archivedIds.has(selection.elementId)) return [];
                const revised = revisedById.get(selection.elementId);
                return [
                  revised
                    ? {
                        elementId: revised.lineage
                          .id as ModelSchemaRelease["elementSelections"][number]["elementId"],
                        elementRevisionId: revised.revision.identity.id,
                      }
                    : selection,
                ];
              }),
              ...additions.map(({ lineage, revision }) => ({
                elementId: lineage.id,
                elementRevisionId: revision.identity.id,
              })),
            ],
            dependencies: [{ releaseId: CORE_MODEL_SCHEMA_RELEASE_ID }],
            publishedByUserId:
              userId as ModelSchemaRelease["publishedByUserId"],
          };
          const release: ModelSchemaRelease = {
            ...provisional,
            identity: {
              ...provisional.identity,
              contentHash: modelSchemaReleaseContentHash(provisional),
            },
          };
          const targetCompilationInput: ModelSchemaCompilationInput = {
            registry: registryResponse(registry),
            release,
            lineages: [
              ...previousLineages
                .filter(({ id }) => !archivedIds.has(id))
                .map((lineage) => {
                  const revised = revisedById.get(lineage.id);
                  return revised
                    ? commonLineage(
                        lineage.id,
                        registryId,
                        lineage,
                        revised.revision.identity.id,
                      )
                    : toCommonLineage(lineage);
                }),
              ...additions.map(({ lineage }) => lineage),
            ],
            revisions: [
              ...previousSelections.flatMap((selection) => {
                if (
                  archivedIds.has(selection.elementId) ||
                  revisedById.has(selection.elementId)
                )
                  return [];
                const revision = revisionById.get(selection.elementRevisionId);
                return revision ? [toCommonRevision(revision)] : [];
              }),
              ...revisions.map(({ revision }) => revision),
              ...additions.map(({ revision }) => revision),
            ],
            dependencies: [compiledCore],
          };
          const validation = validateCompilationSafely(targetCompilationInput);
          if (!validation.valid)
            throw new BadRequestException({
              message: "The Model Schema release is incomplete.",
              issues: validation.issues,
            });
          const targetCompiled = compileModelSchemaRelease(
            targetCompilationInput,
          );
          const migrationPlan = predecessor
            ? modelMigrationPlan(
                predecessor.id,
                release.identity.id,
                [
                  ...(dto.migrationMappings ?? []),
                  ...archived
                    .filter(
                      ({ id }) =>
                        !(dto.migrationMappings ?? []).some(
                          ({ sourceElementId }) => sourceElementId === id,
                        ),
                    )
                    .map(({ id }) => ({ sourceElementId: id })),
                ] as ModelMigrationPlan["mappings"],
                userId,
                publishedAt,
              )
            : undefined;
          if (migrationPlan && predecessor) {
            const sourceCompiled = compileModelSchemaRelease({
              registry: registryResponse(registry),
              release: releaseResponse(predecessor),
              lineages: previousLineages.map(toCommonLineage),
              revisions: previousRevisions.map(toCommonRevision),
              dependencies: [compiledCore],
            });
            const migrationValidation = validateModelMigrationPlan(
              migrationPlan,
              sourceCompiled,
              targetCompiled,
            );
            if (!migrationValidation.valid)
              throw new BadRequestException({
                message: "The Model migration plan is incomplete.",
                issues: migrationValidation.issues,
              });
          }
          for (const addition of additions) {
            await tx.modelElementLineage.create({
              data: {
                id: addition.lineage.id,
                registryId,
                key: addition.lineage.key,
                kind: addition.lineage.kind,
                semanticRole: addition.lineage.semanticRole,
                applicability: jsonObject(addition.lineage.applicability),
                currentRevisionId: null,
              },
            });
            await tx.modelElementRevision.create({
              data: {
                id: addition.revision.identity.id,
                elementId: addition.lineage.id,
                revisionNumber: 1,
                payload: jsonObject(addition.element.payload),
                presentation: jsonObject(addition.element.presentation),
                dependencies: jsonArray(addition.element.dependencies ?? []),
                source: addition.element.source
                  ? jsonObject(addition.element.source)
                  : Prisma.DbNull,
                contentHash: addition.revision.identity.contentHash,
                authoredByUserId: userId,
                publishedAt,
              },
            });
            await tx.modelElementLineage.update({
              where: { id: addition.lineage.id },
              data: { currentRevisionId: addition.revision.identity.id },
            });
          }
          for (const change of revisions) {
            await tx.modelElementRevision.create({
              data: {
                id: change.revision.identity.id,
                elementId: change.lineage.id,
                revisionNumber: change.revision.identity.revisionNumber,
                predecessorRevisionId:
                  change.revision.identity.predecessorRevisionId,
                payload: jsonObject(change.revision.payload),
                presentation: jsonObject(change.revision.presentation),
                dependencies: jsonArray(change.revision.dependencies ?? []),
                source: change.revision.source
                  ? jsonObject(change.revision.source)
                  : Prisma.DbNull,
                contentHash: change.revision.identity.contentHash,
                authoredByUserId: userId,
                publishedAt,
              },
            });
            await tx.modelElementLineage.update({
              where: { id: change.lineage.id },
              data: {
                currentRevisionId: change.revision.identity.id,
                metadataRevision: { increment: 1 },
              },
            });
          }
          for (const lineage of archived) {
            await tx.modelElementLineage.update({
              where: { id: lineage.id },
              data: {
                status: "ARCHIVED",
                archivedAt: publishedAt,
                metadataRevision: { increment: 1 },
              },
            });
          }
          const row = await tx.modelSchemaRelease.create({
            data: {
              id: release.identity.id,
              registryId,
              revisionNumber: releaseNumber,
              predecessorRevisionId: predecessor?.id,
              name: release.name,
              elementSelections: jsonArray(release.elementSelections),
              dependencies: jsonArray(release.dependencies ?? []),
              contentHash: release.identity.contentHash,
              publishedByUserId: userId,
              publishedAt,
            },
            select: releaseSelect,
          });
          if (migrationPlan) {
            await tx.modelMigrationPlan.create({
              data: {
                id: migrationPlan.id,
                registryId,
                sourceReleaseId: migrationPlan.sourceReleaseId,
                targetReleaseId: migrationPlan.targetReleaseId,
                mappings: jsonArray(migrationPlan.mappings),
                createdByUserId: userId,
                createdAt: publishedAt,
              },
            });
          }
          return {
            release: releaseResponse(row),
            migrationPlan,
            addedElements: additions.map(({ lineage, revision }) => ({
              id: lineage.id,
              key: lineage.key,
              revision,
            })),
            revisedElements: revisions.map(({ lineage, revision }) => ({
              id: lineage.id,
              key: lineage.key,
              revision,
            })),
            archivedElements: archived.map(({ id, key }) => ({ id, key })),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw error;
      if (isConflict(error))
        throw new ConflictException(
          "The Model Registry changed; refresh before publishing.",
        );
      throw unavailable();
    }
  }

  async listMigrationPlans(
    registryId: string,
    userId: string,
    limit = 50,
    offset = 0,
  ) {
    const registry = await this.prisma.modelRegistry.findFirst({
      where: {
        id: registryId,
        OR: [{ ownerUserId: userId }, { ownerUserId: null }],
      },
      select: { id: true },
    });
    if (!registry) throw missing();
    const [rows, total] = await Promise.all([
      this.prisma.modelMigrationPlan.findMany({
        where: { registryId },
        select: migrationPlanSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.modelMigrationPlan.count({ where: { registryId } }),
    ]);
    return { items: rows.map(migrationPlanResponse), total, limit, offset };
  }

  async createMigrationPlan(
    registryId: string,
    dto: CreateModelMigrationPlanDto,
    userId: string,
  ) {
    assertModelMigrationMappingsRuntimeShape(dto.mappings);
    const registry = await this.prisma.modelRegistry.findUnique({
      where: { id: registryId, ownerUserId: userId },
      select: { id: true },
    });
    if (!registry) throw missing();
    if (dto.sourceReleaseId === dto.targetReleaseId)
      throw new BadRequestException(
        "A Model migration requires different source and target releases.",
      );
    const [source, target] = await Promise.all([
      this.compileAccessibleRoot(dto.sourceReleaseId, userId),
      this.compileAccessibleRoot(dto.targetReleaseId, userId),
    ]);
    if (
      source.compiled.registryId !== registryId ||
      target.compiled.registryId !== registryId
    )
      throw missing();
    const plan: ModelMigrationPlan = {
      id: randomUUID() as ModelMigrationPlan["id"],
      sourceReleaseId:
        dto.sourceReleaseId as ModelMigrationPlan["sourceReleaseId"],
      targetReleaseId:
        dto.targetReleaseId as ModelMigrationPlan["targetReleaseId"],
      mappings: dto.mappings as ModelMigrationPlan["mappings"],
      createdByUserId: userId as ModelMigrationPlan["createdByUserId"],
      createdAt: new Date().toISOString(),
    };
    const validation = validateModelMigrationPlan(
      plan,
      source.compiled,
      target.compiled,
    );
    if (!validation.valid)
      throw new BadRequestException({
        message: "The Model migration plan is incomplete.",
        issues: validation.issues,
      });
    try {
      const row = await this.prisma.modelMigrationPlan.create({
        data: {
          id: plan.id,
          registryId,
          sourceReleaseId: plan.sourceReleaseId,
          targetReleaseId: plan.targetReleaseId,
          mappings: jsonArray(plan.mappings),
          createdByUserId: userId,
          createdAt: new Date(plan.createdAt),
        },
        select: migrationPlanSelect,
      });
      return migrationPlanResponse(row);
    } catch (error) {
      if (isConflict(error))
        throw new ConflictException(
          "A migration plan already connects those exact releases.",
        );
      throw unavailable();
    }
  }

  async effective(worldDefinitionId: string, userId: string) {
    const world = await this.prisma.worldDefinition.findUnique({
      where: { id: worldDefinitionId, ...worldAccessWhere(userId) },
      select: { ownerUserId: true, draft: { select: { content: true } } },
    });
    if (!world?.draft)
      throw new NotFoundException("The selected World was not found.");
    const rootReleaseIds = modelReleaseIdsFromContent(world.draft.content);
    const resolved = await this.resolveEffectiveRoots(
      rootReleaseIds,
      world.ownerUserId ?? userId,
      worldDefinitionId,
    );
    const elements = resolved.elements.map((element) => ({
      ...elementResponseFromCommon(element.lineage, element.revision),
      sourceReleaseId: element.sourceReleaseId,
    }));
    return {
      releases: resolved.roots.map((root) => ({
        id: root.compiled.releaseId,
        registryId: root.compiled.registryId,
        name: root.releaseName,
        registryName: root.registryName,
        revisionNumber: root.compiled.releaseIdentity.revisionNumber,
        contentHash: root.compiled.contentHash,
      })),
      attributes: elements.filter(
        (element) => element.semanticRole === "aow:attribute",
      ),
      equipmentSlots: elements.filter(
        (element) => element.semanticRole === "aow:equipment-slot",
      ),
      professionRanks: elements.filter(
        (element) => element.semanticRole === "aow:profession-rank",
      ),
      elements,
    };
  }

  async resolveEffectiveRoots(
    rootReleaseIds: readonly string[],
    userId: string,
    worldDefinitionId: string,
  ) {
    if (rootReleaseIds.length === 0)
      throw new BadRequestException(
        "Select at least one Model Schema release for this World draft.",
      );
    const roots: Array<{
      compiled: CompiledModelSchema;
      releaseName: string;
      registryName: string;
    }> = [];
    for (const releaseId of rootReleaseIds)
      roots.push(await this.compileAccessibleRoot(releaseId, userId));
    const elements = mergeCompiledRootElements(
      roots.map(({ compiled }) => compiled),
    );
    return {
      roots,
      elements: elements.filter(({ lineage }) =>
        isApplicableToWorld(
          lineage.applicability as unknown as Prisma.JsonValue,
          worldDefinitionId,
        ),
      ),
    };
  }

  async resolveEffectiveRootsForCampaign(
    rootReleaseIds: readonly string[],
    userId: string,
    worldDefinitionId: string,
    campaignDefinitionId: string,
  ) {
    if (rootReleaseIds.length === 0)
      throw new BadRequestException(
        "Select at least one Model Schema release for this Campaign draft.",
      );
    const roots: Array<{
      compiled: CompiledModelSchema;
      releaseName: string;
      registryName: string;
    }> = [];
    for (const releaseId of rootReleaseIds)
      roots.push(await this.compileAccessibleRoot(releaseId, userId));
    const elements = mergeCompiledRootElements(
      roots.map(({ compiled }) => compiled),
    );
    return {
      roots,
      elements: elements.filter(({ lineage }) =>
        isApplicableToCampaign(
          lineage.applicability as unknown as Prisma.JsonValue,
          worldDefinitionId,
          campaignDefinitionId,
        ),
      ),
    };
  }

  private async compileAccessibleRoot(
    releaseId: string,
    userId: string,
  ): Promise<{
    compiled: CompiledModelSchema;
    releaseName: string;
    registryName: string;
  }> {
    const row = await this.prisma.modelSchemaRelease.findFirst({
      where: {
        id: releaseId,
        registry: { OR: [{ ownerUserId: userId }, { ownerUserId: null }] },
      },
      select: { ...releaseSelect, registry: { select: registrySelect } },
    });
    if (!row)
      throw new BadRequestException(
        "A selected Model Schema release is unavailable.",
      );
    const dependencyIds = readDependencyIds(row.dependencies);
    if (
      dependencyIds.length > 1 ||
      (dependencyIds.length === 1 &&
        dependencyIds[0] !== CORE_MODEL_SCHEMA_RELEASE_ID) ||
      (releaseId === CORE_MODEL_SCHEMA_RELEASE_ID && dependencyIds.length > 0)
    )
      throw new BadRequestException(
        "A selected Model Schema dependency closure is unavailable.",
      );
    const selections = readSelections(row.elementSelections);
    const lineages = await this.prisma.modelElementLineage.findMany({
      where: {
        registryId: row.registryId,
        id: {
          in: selections.map((selection) => selection.elementId as string),
        },
      },
      select: elementSelect,
    });
    const revisions = await this.prisma.modelElementRevision.findMany({
      where: {
        id: {
          in: selections.map(
            (selection) => selection.elementRevisionId as string,
          ),
        },
      },
      select: revisionSelect,
    });
    try {
      return {
        compiled: compileModelSchemaRelease({
          registry: registryResponse(row.registry),
          release: releaseResponse(row),
          lineages: lineages.map(toCommonLineage),
          revisions: revisions.map(toCommonRevision),
          dependencies:
            dependencyIds.length === 1
              ? [
                  (await this.compileAccessibleRoot(dependencyIds[0], userId))
                    .compiled,
                ]
              : [],
        }),
        releaseName: row.name,
        registryName: row.registry.name,
      };
    } catch {
      throw new BadRequestException(
        "A selected Model Schema release is invalid.",
      );
    }
  }
}

const registrySelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  provenance: true,
  ownerUserId: true,
  metadataRevision: true,
  createdAt: true,
  updatedAt: true,
} as const;
const revisionSelect = {
  id: true,
  elementId: true,
  revisionNumber: true,
  predecessorRevisionId: true,
  payload: true,
  presentation: true,
  dependencies: true,
  source: true,
  contentHash: true,
  authoredByUserId: true,
  publishedAt: true,
} as const;
const elementSelect = {
  id: true,
  registryId: true,
  key: true,
  kind: true,
  semanticRole: true,
  applicability: true,
  status: true,
  currentRevisionId: true,
  metadataRevision: true,
  currentRevision: { select: revisionSelect },
} as const;
const releaseSelect = {
  id: true,
  registryId: true,
  revisionNumber: true,
  predecessorRevisionId: true,
  name: true,
  elementSelections: true,
  dependencies: true,
  contentHash: true,
  publishedByUserId: true,
  publishedAt: true,
} as const;
const migrationPlanSelect = {
  id: true,
  registryId: true,
  sourceReleaseId: true,
  targetReleaseId: true,
  mappings: true,
  createdByUserId: true,
  createdAt: true,
  sourceRelease: { select: { name: true, revisionNumber: true } },
  targetRelease: { select: { name: true, revisionNumber: true } },
} as const;
type RegistryRow = Prisma.ModelRegistryGetPayload<{
  select: typeof registrySelect;
}>;
type ElementRow = Prisma.ModelElementLineageGetPayload<{
  select: typeof elementSelect;
}>;
type RevisionRow = Prisma.ModelElementRevisionGetPayload<{
  select: typeof revisionSelect;
}>;
type ReleaseRow = Prisma.ModelSchemaReleaseGetPayload<{
  select: typeof releaseSelect;
}>;
type MigrationPlanRow = Prisma.ModelMigrationPlanGetPayload<{
  select: typeof migrationPlanSelect;
}>;
interface LineageInput {
  readonly key: string;
  readonly kind: string;
  readonly semanticRole: string;
  readonly applicability: unknown;
}

function registryResponse(row: RegistryRow): ModelRegistry {
  return {
    identity: {
      id: row.id as ModelRegistry["identity"]["id"],
      version: {
        revision: row.metadataRevision,
        updatedAt: row.updatedAt.toISOString(),
      },
    },
    key: row.key as ModelRegistry["key"],
    name: row.name,
    description: row.description ?? undefined,
    provenance: row.provenance as ModelRegistry["provenance"],
  };
}
function elementResponse(row: ElementRow) {
  return {
    id: row.id,
    registryId: row.registryId,
    key: row.key,
    kind: row.kind,
    semanticRole: row.semanticRole,
    applicability: row.applicability,
    status: row.status.toLowerCase(),
    currentRevisionId: row.currentRevisionId ?? undefined,
    metadataRevision: row.metadataRevision,
    currentRevision: row.currentRevision
      ? revisionResponse(row.currentRevision)
      : undefined,
  };
}
function revisionResponse(row: RevisionRow): ModelElementRevision {
  return {
    identity: {
      id: row.id as ModelElementRevision["identity"]["id"],
      lineageId: row.elementId as ModelElementRevision["identity"]["lineageId"],
      revisionNumber: row.revisionNumber,
      predecessorRevisionId:
        row.predecessorRevisionId as ModelElementRevision["identity"]["predecessorRevisionId"],
      publishedAt: row.publishedAt.toISOString(),
      contentHash: row.contentHash,
    },
    payload: row.payload as unknown as ModelElementRevision["payload"],
    presentation:
      row.presentation as unknown as ModelElementRevision["presentation"],
    dependencies:
      row.dependencies as unknown as ModelElementRevision["dependencies"],
    source: row.source as unknown as ModelElementRevision["source"],
    authoredByUserId:
      row.authoredByUserId as ModelElementRevision["authoredByUserId"],
  };
}
function releaseResponse(row: ReleaseRow): ModelSchemaRelease {
  return {
    identity: {
      id: row.id as ModelSchemaRelease["identity"]["id"],
      lineageId: row.registryId as ModelSchemaRelease["identity"]["lineageId"],
      revisionNumber: row.revisionNumber,
      predecessorRevisionId:
        row.predecessorRevisionId as ModelSchemaRelease["identity"]["predecessorRevisionId"],
      publishedAt: row.publishedAt.toISOString(),
      contentHash: row.contentHash,
    },
    name: row.name,
    elementSelections:
      row.elementSelections as unknown as ModelSchemaRelease["elementSelections"],
    dependencies:
      row.dependencies as unknown as ModelSchemaRelease["dependencies"],
    publishedByUserId:
      row.publishedByUserId as ModelSchemaRelease["publishedByUserId"],
  };
}
function migrationPlanResponse(row: MigrationPlanRow) {
  return {
    id: row.id,
    registryId: row.registryId,
    sourceReleaseId: row.sourceReleaseId,
    targetReleaseId: row.targetReleaseId,
    mappings: row.mappings,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    sourceRelease: row.sourceRelease,
    targetRelease: row.targetRelease,
  };
}
function commonLineage(
  id: string,
  registryId: string,
  draft: LineageInput,
  currentRevisionId: string,
): ModelElementLineage {
  return {
    id: id as ModelElementLineage["id"],
    registryId: registryId as ModelElementLineage["registryId"],
    key: draft.key as ModelElementLineage["key"],
    kind: draft.kind as ModelElementLineage["kind"],
    semanticRole: draft.semanticRole as ModelElementLineage["semanticRole"],
    applicability: draft.applicability as ModelElementLineage["applicability"],
    status: "active",
    currentRevisionId:
      currentRevisionId as ModelElementLineage["currentRevisionId"],
  };
}
function commonRevision(
  id: string,
  elementId: string,
  revisionNumber: number,
  predecessorRevisionId: string | undefined,
  draft: ModelElementRevisionPayloadDto,
  userId: string,
  publishedAt: Date,
): ModelElementRevision {
  const base: ModelElementRevision = {
    identity: {
      id: id as ModelElementRevision["identity"]["id"],
      lineageId: elementId as ModelElementRevision["identity"]["lineageId"],
      revisionNumber,
      predecessorRevisionId:
        predecessorRevisionId as ModelElementRevision["identity"]["predecessorRevisionId"],
      publishedAt: publishedAt.toISOString(),
      contentHash: "",
    },
    payload: draft.payload as unknown as ModelElementRevision["payload"],
    presentation:
      draft.presentation as unknown as ModelElementRevision["presentation"],
    dependencies: draft.dependencies as ModelElementRevision["dependencies"],
    source: draft.source as ModelElementRevision["source"],
    authoredByUserId: userId as ModelElementRevision["authoredByUserId"],
  };
  return {
    ...base,
    identity: {
      ...base.identity,
      contentHash: modelElementRevisionContentHash(base),
    },
  };
}
function modelMigrationPlan(
  sourceReleaseId: string,
  targetReleaseId: string,
  mappings: ModelMigrationPlan["mappings"],
  userId: string,
  createdAt: Date,
): ModelMigrationPlan {
  return {
    id: randomUUID() as ModelMigrationPlan["id"],
    sourceReleaseId: sourceReleaseId as ModelMigrationPlan["sourceReleaseId"],
    targetReleaseId: targetReleaseId as ModelMigrationPlan["targetReleaseId"],
    mappings,
    createdByUserId: userId as ModelMigrationPlan["createdByUserId"],
    createdAt: createdAt.toISOString(),
  };
}
function toCommonLineage(row: ElementRow): ModelElementLineage {
  return {
    id: row.id as ModelElementLineage["id"],
    registryId: row.registryId as ModelElementLineage["registryId"],
    key: row.key as ModelElementLineage["key"],
    kind: row.kind as ModelElementLineage["kind"],
    semanticRole: row.semanticRole as ModelElementLineage["semanticRole"],
    applicability: row.applicability as ModelElementLineage["applicability"],
    status: row.status.toLowerCase() as ModelElementLineage["status"],
    currentRevisionId:
      row.currentRevisionId as ModelElementLineage["currentRevisionId"],
  };
}
function toCommonRevision(row: RevisionRow): ModelElementRevision {
  return revisionResponse(row);
}
function jsonObject(v: unknown) {
  return v as Prisma.InputJsonObject;
}
function jsonArray(v: unknown) {
  return v as Prisma.InputJsonArray;
}
function readSelections(
  value: Prisma.JsonValue,
): ModelSchemaRelease["elementSelections"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof entry.elementId === "string" &&
        typeof entry.elementRevisionId === "string",
    )
    .map((entry) => ({
      elementId:
        entry.elementId as ModelSchemaRelease["elementSelections"][number]["elementId"],
      elementRevisionId:
        entry.elementRevisionId as ModelSchemaRelease["elementSelections"][number]["elementRevisionId"],
    }));
}
function readDependencyIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    !Array.isArray(entry) &&
    typeof entry.releaseId === "string"
      ? [entry.releaseId]
      : [],
  );
}
function modelReleaseIdsFromContent(value: Prisma.JsonValue): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray(value.modelSchemaReleaseIds)
  )
    return [];
  return value.modelSchemaReleaseIds.filter(
    (id): id is string => typeof id === "string",
  );
}
function elementResponseFromCommon(
  lineage: ModelElementLineage,
  revision: ModelElementRevision,
) {
  return {
    id: lineage.id,
    registryId: lineage.registryId,
    key: lineage.key,
    kind: lineage.kind,
    semanticRole: lineage.semanticRole,
    applicability: lineage.applicability,
    status: lineage.status,
    currentRevision: revision,
  };
}
export function mergeCompiledRootElements(
  roots: readonly CompiledModelSchema[],
): CompiledModelSchema["elements"] {
  const byKey = new Map<string, CompiledModelSchema["elements"][number]>();
  for (const root of roots) {
    for (const element of root.elements) {
      const existing = byKey.get(element.lineage.key);
      if (existing) {
        const sameExactElement =
          existing.lineage.id === element.lineage.id &&
          existing.revision.identity.id === element.revision.identity.id &&
          existing.sourceReleaseId === element.sourceReleaseId;
        if (!sameExactElement)
          throw new BadRequestException(
            "The World draft selects conflicting Model Schema release roots.",
          );
        continue;
      }
      byKey.set(element.lineage.key, element);
    }
  }
  return [...byKey.values()];
}
function isApplicableToWorld(
  value: Prisma.JsonValue,
  worldDefinitionId: string,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value.kind === "global" ||
      (value.kind === "world" && value.worldDefinitionId === worldDefinitionId))
  );
}
export function isApplicableToCampaign(
  value: Prisma.JsonValue,
  worldDefinitionId: string,
  campaignDefinitionId: string,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value.kind === "global" ||
      (value.kind === "world" &&
        value.worldDefinitionId === worldDefinitionId) ||
      (value.kind === "campaign-definition" &&
        value.campaignDefinitionId === campaignDefinitionId))
  );
}
function validateCompilationSafely(
  input: ModelSchemaCompilationInput,
): ModelRegistryValidationResult {
  try {
    return validateModelSchemaCompilation(input);
  } catch {
    throw new BadRequestException("The Model Element shape is invalid.");
  }
}
function missing() {
  return new NotFoundException(
    "The selected Model Registry resource was not found.",
  );
}
function unavailable() {
  return new ServiceUnavailableException(
    "Model Registry is temporarily unavailable.",
  );
}
function isConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || code === "P2034";
}
