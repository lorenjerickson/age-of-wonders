import { BadRequestException } from "@nestjs/common";
import type { ArchivedDomainRecord } from "./host-transfer-archive";
import {
  remapRecordIdentities,
  selectDomainRecords,
} from "./host-transfer-archive";

function record(
  resource: ArchivedDomainRecord["resource"],
  id: string,
  data: Record<string, unknown>,
  kind: string | null = null,
): ArchivedDomainRecord {
  return {
    resource,
    id,
    kind,
    name: id,
    data,
    revision: 1,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("host transfer archive", () => {
  it("selects a world hierarchy, owned content, and forward dependencies", () => {
    const records = [
      record(
        "locations",
        "world-one",
        { identity: { id: "world-one" } },
        "world",
      ),
      record("locations", "child", {
        identity: { id: "child" },
        placement: { kind: "within-parent", parentLocationId: "world-one" },
      }),
      record("creatures", "creature", {
        identity: { id: "creature" },
        worldId: "world-one",
        definitionId: "definition",
      }),
      record("definitions", "definition", { identity: { id: "definition" } }),
      record(
        "locations",
        "world-two",
        { identity: { id: "world-two" } },
        "world",
      ),
    ];

    expect(
      selectDomainRecords(records, {
        worldIds: ["world-one"],
        campaignIds: [],
        sessionIds: [],
      }).map(({ id }) => id),
    ).toEqual(["world-one", "child", "creature", "definition"]);
  });

  it("rejects a missing selected root without exposing another matching resource", () => {
    expect(() =>
      selectDomainRecords(
        [record("campaigns", "same-id", { identity: { id: "same-id" } })],
        { worldIds: ["same-id"], campaignIds: [], sessionIds: [] },
      ),
    ).toThrow(BadRequestException);
  });

  it("remaps conflicting identities and every reference for both", () => {
    const result = remapRecordIdentities(
      [
        record("campaigns", "campaign", { identity: { id: "campaign" } }),
        record("sessions", "session", {
          identity: { id: "session" },
          campaignId: "campaign",
          image: { assetId: "media" },
        }),
      ],
      [
        {
          id: "media",
          bucket: "source",
          objectKey: "images/media.webp",
          filename: "media.webp",
          originalName: "media.webp",
          mimeType: "image/webp",
          mediaType: "image",
          purpose: "map",
          size: 1,
          etag: null,
          tags: [],
          createdAt: "2026-08-24T00:00:00.000Z",
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
      ],
      new Set(["campaign", "session"]),
      new Set(["media"]),
    );

    const session = result.records[1];
    expect(session?.id).not.toBe("session");
    expect(session?.data.campaignId).toBe(result.idMap.get("campaign"));
    expect((session?.data.image as { assetId: string }).assetId).toBe(
      result.idMap.get("media"),
    );
    expect(result.media[0]?.objectKey).toContain(result.idMap.get("media"));
  });
});
