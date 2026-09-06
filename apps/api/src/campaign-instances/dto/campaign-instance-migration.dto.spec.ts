import { getMetadataStorage, validate } from "class-validator";
import { PreviewCampaignInstanceMigrationDto } from "./campaign-instance-migration.dto";
import { MAX_MIGRATION_EXPANDED_RECORDS } from "../../domain/snapshot-manifest";

const dto = (values: Record<string, unknown>) =>
  Object.assign(new PreviewCampaignInstanceMigrationDto(), values);

describe("PreviewCampaignInstanceMigrationDto", () => {
  it("accepts independently bounded presentation pages", async () => {
    await expect(
      validate(
        dto({
          sourceSnapshotId: "instance-snapshot-1",
          targetCampaignDefinitionSnapshotId: "campaign-snapshot-2",
          expectedRuntimeRevision: 3,
          changeOffset: 100,
          changeLimit: 50,
          conflictOffset: 20,
          conflictLimit: 10,
          candidateOffset: 200,
          candidateLimit: 100,
        }),
      ),
    ).resolves.toEqual([]);
  });

  it("rejects oversized and negative page controls", async () => {
    const errors = await validate(
      dto({
        sourceSnapshotId: "instance-snapshot-1",
        targetCampaignDefinitionSnapshotId: "campaign-snapshot-2",
        expectedRuntimeRevision: 3,
        changeOffset: -1,
        changeLimit: 201,
        conflictOffset: -1,
        conflictLimit: 201,
        candidateOffset: -1,
        candidateLimit: 201,
      }),
    );
    expect(errors.map(({ property }) => property).sort()).toEqual([
      "candidateLimit",
      "candidateOffset",
      "changeLimit",
      "changeOffset",
      "conflictLimit",
      "conflictOffset",
    ]);
  });

  it("uses the shared expanded-record bound above the former 1,000 mapping limit", () => {
    const mappingBounds = getMetadataStorage()
      .getTargetValidationMetadatas(
        PreviewCampaignInstanceMigrationDto,
        "",
        false,
        false,
      )
      .filter(({ propertyName, name }) =>
        propertyName === "mappings" && name === "arrayMaxSize"
      );
    expect(mappingBounds).toEqual([
      expect.objectContaining({ constraints: [MAX_MIGRATION_EXPANDED_RECORDS] }),
    ]);
    expect(MAX_MIGRATION_EXPANDED_RECORDS).toBeGreaterThan(1_000);
  });
});
