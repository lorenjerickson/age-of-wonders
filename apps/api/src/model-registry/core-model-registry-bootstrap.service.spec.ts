import { CoreModelRegistryBootstrapService } from "./core-model-registry-bootstrap.service";
import { createEditableCoreModelSeed } from "./editable-core-model-seed";

describe("CoreModelRegistryBootstrapService", () => {
  it("idempotently materializes the complete immutable core graph and release", async () => {
    const seed = createEditableCoreModelSeed();
    const tx = {
      modelRegistry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      modelElementLineage: {
        createMany: jest.fn().mockResolvedValue({ count: 64 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      modelElementRevision: {
        createMany: jest.fn().mockResolvedValue({ count: 64 }),
        findMany: jest.fn().mockResolvedValue(
          seed.revisions.map((revision) => ({
            id: revision.identity.id,
            contentHash: revision.identity.contentHash,
          })),
        ),
      },
      modelSchemaRelease: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          contentHash: seed.release.identity.contentHash,
          elementSelections: seed.release.elementSelections,
          dependencies: [],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new CoreModelRegistryBootstrapService(prisma as never);
    await service.onModuleInit();
    expect(tx.modelRegistry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.modelElementLineage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.modelElementRevision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.modelSchemaRelease.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ id: "aow:model-schema-release:core:1" }),
        ],
        skipDuplicates: true,
      }),
    );
  });
});
