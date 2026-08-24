import { BadRequestException } from "@nestjs/common";
import {
  assertPurpose,
  generateMediaKey,
  mediaTypeForMimeType,
} from "./media-key";

describe("media object keys", () => {
  it.each([
    ["image/png", "images"],
    ["audio/ogg", "audio"],
    ["video/mp4", "video"],
    ["application/pdf", "documents"],
    ["application/zip", "archives"],
    ["application/octet-stream", "files"],
  ])("maps %s to %s", (mimeType, expected) => {
    expect(mediaTypeForMimeType(mimeType)).toBe(expected);
  });

  it("creates a GUID filename under media type and purpose", () => {
    const generated = generateMediaKey("image/png", "maps", "world.PNG");

    expect(generated.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(generated.filename).toBe(`${generated.id}.png`);
    expect(generated.objectKey).toBe(`images/maps/${generated.id}.png`);
  });

  it("rejects purposes that could escape their prefix", () => {
    expect(() => assertPurpose("../maps")).toThrow(BadRequestException);
  });
});
