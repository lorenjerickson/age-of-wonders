import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MediaImage", () => ({
  MediaImage: ({
    image,
    name,
  }: {
    image?: { assetId: string; altText?: string };
    name: string;
  }) =>
    image ? (
      <img src={`/test-images/${image.assetId}`} alt={image.altText || name} />
    ) : (
      <span>No image yet</span>
    ),
}));
import { CreatureArtwork, RecordThumbnail } from "./RecordArtwork";

describe("artwork rendering", () => {
  it("renders portrait and both token images from canonical Creature art", () => {
    const images = {
      portrait: { assetId: "portrait", altText: "A marsh hunter" },
      overheadToken: { assetId: "overhead" },
      paperDollToken: { assetId: "side" },
    };
    const html = renderToStaticMarkup(
      <CreatureArtwork
        name="Marsh hunter"
        payload={{ components: { art: { images } } }}
      />,
    );
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain('alt="A marsh hunter"');
    expect(html).toContain('alt="Marsh hunter · Overhead token"');
    expect(html).toContain('alt="Marsh hunter · Side-view token"');
  });

  it("renders thumbnails for legacy Creatures, Items and Locations", () => {
    for (const payload of [
      { images: { portrait: { assetId: "art" } } },
      { kind: "item", image: { assetId: "art" } },
      { kind: "site", image: { assetId: "art" } },
    ]) {
      expect(
        renderToStaticMarkup(
          <RecordThumbnail payload={payload} name="Catalog entry" />,
        ),
      ).toContain('<img src="/test-images/art" alt="Catalog entry"');
    }
  });

  it("uses neutral missing-image text and can omit empty optional thumbnails", () => {
    expect(
      renderToStaticMarkup(
        <RecordThumbnail payload={{}} name="Catalog entry" />,
      ),
    ).toContain("No image yet");
    expect(
      renderToStaticMarkup(
        <RecordThumbnail payload={{}} name="Catalog entry" onlyIfPresent />,
      ),
    ).toBe("");
  });
});
