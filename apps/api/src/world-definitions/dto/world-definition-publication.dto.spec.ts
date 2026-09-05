import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateWorldDefinitionDto } from "./create-world-definition.dto";
import { PublishWorldDefinitionRevisionDto } from "./publish-world-definition-revision.dto";

const record = {
  resourceType: "locations",
  sourceId: "root-location",
  sourceRevision: 3,
  payload: { name: "Glasswake" },
};

describe("World Definition publication DTOs", () => {
  it("accepts complete initial and successor revision payloads", async () => {
    const create = plainToInstance(CreateWorldDefinitionDto, {
      name: "The Glasswake",
      description: "A fractured coast.",
      content: { rootLocationId: "root-location" },
      snapshotManifest: { formatVersion: 1, records: [record] },
    });
    const publish = plainToInstance(PublishWorldDefinitionRevisionDto, {
      predecessorRevisionId: "world-revision-1",
      name: "The Glasswake, Second Edition",
      content: { rootLocationId: "root-location" },
      snapshotManifest: { formatVersion: 1, records: [record] },
    });

    await expect(
      validate(create, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    await expect(
      validate(publish, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it("rejects arrays as revision content, empty records, incomplete records, and caller hashes", async () => {
    const dto = plainToInstance(CreateWorldDefinitionDto, {
      name: "The Glasswake",
      content: [],
      contentHash: "caller-revision-hash",
      snapshotContentHash: "caller-snapshot-hash",
      snapshotManifest: {
        formatVersion: 1,
        contentHash: "caller-manifest-hash",
        records: [
          {
            resourceType: "locations",
            sourceId: "root-location",
            contentHash: "caller-record-hash",
          },
        ],
      },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property).sort()).toEqual([
      "content",
      "contentHash",
      "snapshotContentHash",
      "snapshotManifest",
    ]);

    const emptyManifest = plainToInstance(CreateWorldDefinitionDto, {
      name: "The Glasswake",
      content: {},
      snapshotManifest: { formatVersion: 1, records: [] },
    });
    expect(
      (
        await validate(emptyManifest, {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).map((error) => error.property),
    ).toContain("snapshotManifest");
  });
});
