import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { OpenAiService } from "./openai.service";

describe("GeneratedItemImageService", () => {
  it("renders and stores a transparent square inventory image", async () => {
    const generateImage = jest.fn(() =>
      Promise.resolve({
        buffer: Buffer.from("image"),
        mimeType: "image/webp" as const,
        width: 1024,
        height: 1024,
        responseId: "image-response-1",
      }),
    );
    const upload = jest.fn(() =>
      Promise.resolve({
        id: "asset-1",
        bucket: "media",
        objectKey: "items/asset-1.webp",
        filename: "asset-1.webp",
        originalName: "Surveyor's Lens-inventory.webp",
        mimeType: "image/webp",
        mediaType: "image",
        purpose: "items",
        size: 5,
        etag: "etag",
      }),
    );
    const create = jest.fn(() => Promise.resolve({ id: "asset-1" }));
    const service = new GeneratedItemImageService(
      { generateImage } as unknown as OpenAiService,
      { upload } as unknown as ObjectStorageService,
      { create } as unknown as MediaService,
    );

    const result = await service.generate(
      {
        identity: {
          id: "definition-1",
          name: "Surveyor's Lens",
          description: "A brass instrument.",
        },
        components: { category: "tool" },
        extensions: {
          "aow:image-brief": {
            imageGenerationPrompt: "Polished brass and blue glass.",
          },
        },
      },
      "world-1",
    );

    expect(generateImage).toHaveBeenCalledWith(
      expect.stringContaining("Polished brass and blue glass."),
      { size: "1024x1024", background: "transparent" },
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.data.image).toEqual({
      assetId: "asset-1",
      altText: "Inventory view of Surveyor's Lens",
      width: 1024,
      height: 1024,
      mimeType: "image/webp",
    });
  });
});
