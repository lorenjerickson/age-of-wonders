import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateCampaignDefinitionDto,
  PublishCampaignDefinitionRevisionDto,
} from "./campaign-definition-write.dto";
import { MAX_SNAPSHOT_RECORDS } from "../../domain/snapshot-manifest";

describe("Campaign Definition write DTOs", () => {
  it("requires complete initial content, manifest, and explicit World snapshot", async () => {
    const dto = plainToInstance(CreateCampaignDefinitionDto, {
      name: "Ashes at Dawn",
      worldDefinitionSnapshotId: "world-snapshot-4",
      content: { plots: [] },
      snapshotManifest: {
        formatVersion: 1,
        records: [
          { resourceType: "campaign-content", sourceId: "draft", payload: {} },
        ],
      },
    });
    await expect(validate(dto)).resolves.toEqual([]);

    const incomplete = plainToInstance(CreateCampaignDefinitionDto, {
      name: "Ashes at Dawn",
      worldDefinitionId: "ambiguous-live-world",
    });
    expect((await validate(incomplete)).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        "worldDefinitionSnapshotId",
        "content",
        "snapshotManifest",
      ]),
    );
  });

  it("requires an explicit predecessor and complete replacement payloads", async () => {
    const dto = plainToInstance(PublishCampaignDefinitionRevisionDto, {
      predecessorRevisionId: "campaign-revision-1",
      worldDefinitionSnapshotId: "world-snapshot-5",
      name: "Ashes at Dawn, Revised",
      content: { plots: [{ id: "plot-1" }] },
      snapshotManifest: {
        formatVersion: 1,
        records: [
          { resourceType: "campaign-content", sourceId: "draft", payload: {} },
        ],
      },
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects caller hashes and malformed nested manifest keys at the transport boundary", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const baseInput = {
      name: "Ashes at Dawn",
      worldDefinitionSnapshotId: "world-snapshot-4",
      content: { plots: [] },
      snapshotManifest: {
        formatVersion: 1,
        records: [
          {
            resourceType: "campaign-content",
            sourceId: "draft",
            payload: {},
          },
        ],
      },
    };

    const invalidManifests = [
      { ...baseInput.snapshotManifest, contentHash: "caller-manifest-hash" },
      {
        ...baseInput.snapshotManifest,
        records: [
          {
            ...baseInput.snapshotManifest.records[0],
            contentHash: "caller-record-hash",
          },
        ],
      },
      {
        ...baseInput.snapshotManifest,
        records: [
          {
            ...baseInput.snapshotManifest.records[0],
            unknownRecordKey: true,
          },
        ],
      },
    ];
    for (const snapshotManifest of invalidManifests) {
      await expect(
        pipe.transform(
          { ...baseInput, snapshotManifest },
          { type: "body", metatype: CreateCampaignDefinitionDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      pipe.transform(
        {
          ...baseInput,
          snapshotManifest: {
            formatVersion: 1,
            records: [
              {
                resourceType: "campaign-content",
                sourceId: "draft",
                sourceRevision: 2,
                payload: { plots: [] },
              },
            ],
          },
        },
        { type: "body", metatype: CreateCampaignDefinitionDto },
      ),
    ).resolves.toBeInstanceOf(CreateCampaignDefinitionDto);
  });

  it("rejects a manifest that leaves no room for the authoritative revision record", async () => {
    const dto = plainToInstance(CreateCampaignDefinitionDto, {
      name: "Ashes at Dawn",
      worldDefinitionSnapshotId: "world-snapshot-4",
      content: {},
      snapshotManifest: {
        formatVersion: 1,
        records: Array.from({ length: MAX_SNAPSHOT_RECORDS }, (_, index) => ({
          resourceType: "campaign-content",
          sourceId: `draft-${index}`,
          payload: {},
        })),
      },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain(
      "snapshotManifest",
    );
  });
});
