import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { ItemGenerationService } from "./item-generation.service";
import { OpenAiService } from "./openai.service";

describe("ItemGenerationService", () => {
  it("creates a normalized world-scoped item definition", async () => {
    const world = {
      id: "world-1",
      kind: "world",
      data: { identity: { id: "world-1" }, name: "Lantern Expanse" },
    };
    const create = jest.fn((resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ resource, id: "stored-item", data }),
    );
    const domain = {
      get: jest.fn(() => Promise.resolve(world)),
      create,
    } as unknown as DomainService;
    const prompts = {
      read: jest.fn((fileName: string) => Promise.resolve(`# ${fileName}`)),
    } as unknown as AiPromptService;
    const respond = jest.fn(() =>
      Promise.resolve({
        output: JSON.stringify({
          identity: {
            id: "model-id",
            key: "aow:surveyors-lens",
            name: "Surveyor's Lens",
            description: "A brass instrument for finding ley fractures.",
            source: { namespace: "model", edition: "model" },
          },
          kind: "item",
          components: {
            category: "tool",
            rarity: "uncommon",
            operatingBasis: "field-effect",
            understanding: "empirical",
          },
        }),
        responseId: "response-1",
      }),
    );
    const openAi = {
      respond,
    } as unknown as OpenAiService;
    const generate = jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({
        data: {
          ...data,
          image: {
            assetId: "asset-1",
            altText: "Inventory view of Surveyor's Lens",
            width: 1024,
            height: 1024,
            mimeType: "image/webp",
          },
        },
        asset: { id: "asset-1" },
        responseId: "image-response-1",
      }),
    );
    const images = { generate } as unknown as GeneratedItemImageService;
    const media = { remove: jest.fn() } as unknown as MediaService;
    const service = new ItemGenerationService(
      prompts,
      openAi,
      images,
      media,
      domain,
    );

    const result = await service.create("world-1", "A survey instrument.");

    expect(respond).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0];
    expect(created?.[0]).toBe("definitions");
    expect(created?.[1]).toMatchObject({
      kind: "item",
      components: {
        category: "tool",
        quality: "standard",
      },
      identity: {
        name: "Surveyor's Lens",
        source: {
          namespace: "aow",
          edition: "homebrew:age-of-wonders",
        },
      },
      extensions: { "aow:worldId": "world-1" },
      image: { assetId: "asset-1" },
    });
    expect(result.definition.id).toBe("stored-item");
    expect(result.imageResponseId).toBe("image-response-1");
  });

  it("replaces an existing item's image and removes the previous asset", async () => {
    const world = {
      id: "world-1",
      kind: "world",
      data: { identity: { id: "world-1" }, name: "Lantern Expanse" },
    };
    const definition = {
      id: "definition-1",
      kind: "item",
      revision: 4,
      data: {
        identity: { id: "definition-1", name: "Surveyor's Lens" },
        components: { category: "tool" },
        image: { assetId: "old-asset" },
        extensions: { "aow:worldId": "world-1" },
      },
    };
    const replace = jest.fn(
      (
        resource: string,
        id: string,
        dto: { data: Record<string, unknown>; expectedRevision?: number },
      ) => Promise.resolve({ resource, id, revision: 5, data: dto.data }),
    );
    const domain = {
      get: jest.fn((resource: string) =>
        Promise.resolve(resource === "locations" ? world : definition),
      ),
      replace,
    } as unknown as DomainService;
    const generate = jest.fn(() =>
      Promise.resolve({
        data: {
          ...definition.data,
          image: { assetId: "new-asset" },
        },
        asset: { id: "new-asset" },
        responseId: "image-response-2",
        prompt: "A square inventory image.",
      }),
    );
    const remove = jest.fn(() => Promise.resolve());
    const service = new ItemGenerationService(
      {} as AiPromptService,
      {} as OpenAiService,
      { generate } as unknown as GeneratedItemImageService,
      { remove } as unknown as MediaService,
      domain,
    );

    const result = await service.regenerateImage("world-1", "definition-1");

    const replaceCall = replace.mock.calls[0];
    expect(replaceCall?.[0]).toBe("definitions");
    expect(replaceCall?.[1]).toBe("definition-1");
    expect(replaceCall?.[2].data).toMatchObject({
      image: { assetId: "new-asset" },
    });
    expect(replaceCall?.[2].expectedRevision).toBe(4);
    expect(remove).toHaveBeenCalledWith("old-asset");
    expect(result.imageResponseId).toBe("image-response-2");
  });
});
