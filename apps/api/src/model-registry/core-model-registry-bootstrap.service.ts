import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { createEditableCoreModelSeed } from "./editable-core-model-seed";
import { canonicalJsonHash } from "../domain/snapshot-manifest";

/** Idempotently materializes the deterministic immutable core registry on every installation. */
@Injectable()
export class CoreModelRegistryBootstrapService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const seed = createEditableCoreModelSeed();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.modelRegistry.createMany({
          data: [
            {
              id: seed.registry.identity.id,
              key: seed.registry.key,
              name: seed.registry.name,
              description: seed.registry.description,
              provenance: seed.registry.provenance,
              ownerUserId: null,
              metadataRevision: seed.registry.identity.version.revision,
              createdAt: new Date(seed.registry.identity.version.updatedAt),
              updatedAt: new Date(seed.registry.identity.version.updatedAt),
            },
          ],
          skipDuplicates: true,
        });
        await tx.modelElementLineage.createMany({
          data: seed.lineages.map((lineage) => ({
            id: lineage.id,
            registryId: lineage.registryId,
            key: lineage.key,
            kind: lineage.kind,
            semanticRole: lineage.semanticRole,
            applicability: lineage.applicability,
            status: "ACTIVE" as const,
            currentRevisionId: null,
            metadataRevision: 1,
          })),
          skipDuplicates: true,
        });
        await tx.modelElementRevision.createMany({
          data: seed.revisions.map((revision) => ({
            id: revision.identity.id,
            elementId: revision.identity.lineageId,
            revisionNumber: revision.identity.revisionNumber,
            predecessorRevisionId: revision.identity.predecessorRevisionId,
            payload: revision.payload as unknown as Prisma.InputJsonObject,
            presentation:
              revision.presentation as unknown as Prisma.InputJsonObject,
            dependencies: (revision.dependencies ??
              []) as unknown as Prisma.InputJsonArray,
            source: revision.source
              ? (revision.source as unknown as Prisma.InputJsonObject)
              : Prisma.DbNull,
            contentHash: revision.identity.contentHash,
            authoredByUserId: null,
            createdAt: new Date(revision.identity.publishedAt),
            publishedAt: new Date(revision.identity.publishedAt),
          })),
          skipDuplicates: true,
        });
        for (const lineage of seed.lineages) {
          await tx.modelElementLineage.updateMany({
            where: {
              id: lineage.id,
              registryId: seed.registry.identity.id,
              currentRevisionId: null,
            },
            data: { currentRevisionId: lineage.currentRevisionId },
          });
        }
        await tx.modelSchemaRelease.createMany({
          data: [
            {
              id: seed.release.identity.id,
              registryId: seed.release.identity.lineageId,
              revisionNumber: seed.release.identity.revisionNumber,
              predecessorRevisionId:
                seed.release.identity.predecessorRevisionId,
              name: seed.release.name,
              elementSelections: seed.release
                .elementSelections as unknown as Prisma.InputJsonArray,
              dependencies: (seed.release.dependencies ??
                []) as unknown as Prisma.InputJsonArray,
              contentHash: seed.release.identity.contentHash,
              publishedByUserId: null,
              createdAt: new Date(seed.release.identity.publishedAt),
              publishedAt: new Date(seed.release.identity.publishedAt),
            },
          ],
          skipDuplicates: true,
        });
        const storedRelease = await tx.modelSchemaRelease.findUnique({
          where: { id: seed.release.identity.id },
          select: {
            contentHash: true,
            elementSelections: true,
            dependencies: true,
          },
        });
        const storedRevisions = await tx.modelElementRevision.findMany({
          where: {
            id: { in: seed.revisions.map((revision) => revision.identity.id) },
          },
          select: { id: true, contentHash: true },
        });
        const expectedRevisionHashes = new Map(
          seed.revisions.map((revision) => [
            revision.identity.id as string,
            revision.identity.contentHash,
          ]),
        );
        const releaseMatches =
          storedRelease?.contentHash === seed.release.identity.contentHash &&
          canonicalJsonHash(storedRelease.elementSelections) ===
            canonicalJsonHash(seed.release.elementSelections) &&
          canonicalJsonHash(storedRelease.dependencies) ===
            canonicalJsonHash(seed.release.dependencies ?? []);
        const revisionsMatch =
          storedRevisions.length === seed.revisions.length &&
          storedRevisions.every(
            (revision) =>
              expectedRevisionHashes.get(revision.id) === revision.contentHash,
          );
        if (!releaseMatches || !revisionsMatch) {
          throw new Error(
            "The persisted core Model Registry does not match its immutable release identity.",
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
