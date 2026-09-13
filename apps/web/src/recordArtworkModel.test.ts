import { describe, expect, it } from "vitest";
import { creatureImageReferences, recordThumbnail } from "./recordArtworkModel";

const portrait = { assetId: "portrait-asset", altText: "A creature" };
const overheadToken = { assetId: "overhead-asset" };
const paperDollToken = { assetId: "side-asset" };

describe("record artwork", () => {
  it("finds all three legacy Creature images and prefers the portrait for cards", () => {
    const payload = { images: { portrait, overheadToken, paperDollToken } };
    expect(creatureImageReferences(payload)).toEqual(payload.images);
    expect(recordThumbnail(payload)).toEqual(portrait);
  });

  it("uses canonical art while retaining missing legacy views", () => {
    const replacement = { assetId: "new-portrait" };
    const payload = {
      components: { art: { images: { portrait: replacement } } },
      images: { portrait, overheadToken, paperDollToken },
    };
    expect(creatureImageReferences(payload)).toEqual({
      portrait: replacement,
      overheadToken,
      paperDollToken,
    });
    expect(recordThumbnail(payload)).toEqual(replacement);
  });

  it("recovers artwork from an upgraded Creature's preserved legacy source", () => {
    const payload = {
      components: { art: {} },
      extensions: {
        "aow:legacy-creature": {
          payload: { images: { portrait, overheadToken, paperDollToken } },
        },
      },
    };
    expect(creatureImageReferences(payload)).toEqual({
      portrait,
      overheadToken,
      paperDollToken,
    });
    expect(recordThumbnail(payload)).toEqual(portrait);
    const replacement = { assetId: "replacement" };
    expect(
      creatureImageReferences({
        ...payload,
        components: { art: { images: { overheadToken: replacement } } },
      }),
    ).toEqual({ portrait, overheadToken: replacement, paperDollToken });
  });

  it("supports Item and Location images without requiring a stored URL", () => {
    expect(recordThumbnail({ image: portrait })).toEqual(portrait);
  });

  it("uses an available token when a portrait is absent", () => {
    expect(
      recordThumbnail({ images: { portrait: {}, paperDollToken } }),
    ).toEqual(paperDollToken);
  });

  it("ignores missing, malformed and URI-only references", () => {
    for (const payload of [
      null,
      [],
      {},
      { image: { assetId: " " } },
      { image: { uri: "expired-url" } },
    ]) {
      expect(recordThumbnail(payload)).toBeUndefined();
    }
  });
});
