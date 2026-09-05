import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ApplyCampaignWorldMigrationDto, CreateCampaignDefinitionDto,
  SaveCampaignDraftDto,
} from "./campaign-definition-write.dto";

describe("Campaign Definition authoring DTOs", () => {
  it("requires an explicit World snapshot for creation", async () => {
    const dto = plainToInstance(CreateCampaignDefinitionDto, { name: "Ashes" });
    expect((await validate(dto)).map((error) => error.property)).toContain("worldDefinitionSnapshotId");
  });

  it("accepts a bounded complete draft replacement", async () => {
    const dto = plainToInstance(SaveCampaignDraftDto, {
      expectedStorageRevision: 2, revisionName: "Second draft",
      content: { formatVersion: 1 }, records: [],
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("requires a canonical preview hash before migration apply", async () => {
    const dto = plainToInstance(ApplyCampaignWorldMigrationDto, {
      expectedStorageRevision: 2,
      targetWorldDefinitionSnapshotId: "world-snapshot",
      expectedPlanHash: "not-a-hash",
    });
    expect((await validate(dto)).map((error) => error.property)).toContain("expectedPlanHash");
  });

  it("accepts migrations with more than one hundred bounded reconciliations", async () => {
    const dto = plainToInstance(ApplyCampaignWorldMigrationDto, {
      expectedStorageRevision: 2,
      targetWorldDefinitionSnapshotId: "world-snapshot",
      expectedPlanHash: "a".repeat(64),
      mappings: Array.from({ length: 125 }, (_, index) => ({
        resourceType: "locations",
        sourceId: `source-${index}`,
        targetId: `target-${index}`,
      })),
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});
