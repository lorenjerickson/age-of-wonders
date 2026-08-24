import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { GeneratedMapService } from "./generated-map.service";
import { OpenAiService } from "./openai.service";
import { WorldGenerationService } from "./world-generation.service";

describe("WorldGenerationService", () => {
  it("combines the prompt, domain guide, and user context before persisting", async () => {
    const respond = jest.fn(
      (input: { input: string }) => {
        void input;
        return Promise.resolve({
          output: JSON.stringify({
            name: "The Lantern Expanse",
            description:
              "A chain of kingdoms follows a wandering artificial sun. Their oldest enemy is waking beneath the road of light.",
          }),
          responseId: "response-1",
        });
      },
    );
    const openAi = {
      respond,
    } as unknown as OpenAiService;
    const create = jest.fn(
      (resource: string, data: Record<string, unknown>) => {
        void resource;
        return Promise.resolve({ id: "world-1", data });
      },
    );
    const domain = {
      create,
    } as unknown as DomainService;
    const prompts = {
      read: jest.fn((fileName: string) =>
        Promise.resolve(
          fileName === "domain-model.md"
            ? "# Age of Wonders domain model"
            : "# Create a world",
        ),
      ),
    } as unknown as AiPromptService;
    const maps = {
      generate: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve({
          data: { ...data, image: { assetId: "asset-1" } },
          asset: { id: "asset-1" },
          imageResponseId: "image-response-1",
        }),
      ),
    } as unknown as GeneratedMapService;
    const media = { remove: jest.fn() } as unknown as MediaService;
    const service = new WorldGenerationService(
      prompts,
      openAi,
      maps,
      media,
      domain,
    );

    const result = await service.create("A world that follows a moving sun.");

    const submittedPrompt = respond.mock.calls[0]?.[0].input;
    expect(submittedPrompt).toContain("# Age of Wonders domain model");
    expect(submittedPrompt).toContain("A world that follows a moving sun.");

    const createCall = create.mock.calls[0];
    expect(createCall?.[0]).toBe("locations");
    expect(createCall?.[1].name).toBe("The Lantern Expanse");
    expect(createCall?.[1].kind).toBe("world");
    const identity = createCall?.[1].identity;
    expect(typeof identity === "object" && identity !== null).toBe(true);
    expect(result.responseId).toBe("response-1");
  });
});
