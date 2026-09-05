import {
  buildSnapshotManifest,
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
  isPublicationJson,
  MAX_PUBLICATION_JSON_DEPTH,
  MAX_SNAPSHOT_RECORDS,
} from "./snapshot-manifest";

describe("snapshot manifest integrity", () => {
  it("canonicalizes object keys and produces a self-verifiable manifest", () => {
    expect(canonicalJsonHash({ b: 2, a: 1 })).toBe(
      canonicalJsonHash({ a: 1, b: 2 }),
    );
    const manifest = buildSnapshotManifest(1, [
      {
        resourceType: "location",
        sourceId: "source",
        sourceRevision: 2,
        payload: { b: 2, a: 1 },
      },
    ]);

    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.records[0]?.contentHash).toBe(
      canonicalJsonHash({ a: 1, b: 2 }),
    );
    expect(isCanonicalSnapshotManifest(manifest)).toBe(true);
    expect(
      isCanonicalSnapshotManifest({ ...manifest, contentHash: "corrupt" }),
    ).toBe(false);
    expect(
      isCanonicalSnapshotManifest({
        ...manifest,
        records: [{ ...manifest.records[0], contentHash: "corrupt" }],
      }),
    ).toBe(false);
  });

  it("enforces publication record-count and JSON-depth bounds", () => {
    const tooMany = Array.from(
      { length: MAX_SNAPSHOT_RECORDS + 1 },
      (_, index) => ({
        resourceType: "location",
        sourceId: `source-${index}`,
        payload: {},
      }),
    );
    expect(() => buildSnapshotManifest(1, tooMany)).toThrow(
      "A snapshot manifest requires a supported format and records.",
    );

    let nested: unknown = "leaf";
    for (let depth = 0; depth <= MAX_PUBLICATION_JSON_DEPTH; depth += 1) {
      nested = { child: nested };
    }
    expect(isPublicationJson(nested)).toBe(false);
    expect(() => canonicalJsonHash(nested)).toThrow(
      "Snapshot content must be bounded JSON.",
    );
  });
});
