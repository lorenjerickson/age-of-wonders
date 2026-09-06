import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { CreatureGenerationService } from "./creature-generation.service";
import { GeneratedCreatureImagesService } from "./generated-creature-images.service";
import { OpenAiService } from "./openai.service";

describe("CreatureGenerationService", () => {
  it("combines the creature prompt, domain guide, world, and user context", async () => {
    const world = {
      id: "world-1",
      kind: "world",
      data: {
        identity: { id: "world-1" },
        name: "The Lantern Expanse",
        kind: "world",
      },
    };
    const get = jest.fn(() => Promise.resolve(world));
    const create = jest.fn((resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ id: "creature-1", resource, data }),
    );
    const domain = { get, create } as unknown as DomainService;
    const prompts = {
      read: jest.fn((fileName: string) =>
        Promise.resolve(
          fileName === "domain-model.md"
            ? "# Age of Wonders domain model"
            : "# Create a creature",
        ),
      ),
    } as unknown as AiPromptService;
    const respond = jest.fn((input: { input: string }) => {
      void input;
      return Promise.resolve({
        output: JSON.stringify({
          name: "Prism-Horn Stalker",
          classification: {
            nature: "organism",
            morphology: "animal",
            aliases: [{ label: "Prism-Horn Stalker" }],
          },
          armorClass: 99,
          attributes: {
            standard: {
              might: {
                score: 10,
                modifier: 0,
                savingThrow: 0,
                proficientInSave: false,
              },
              intellect: {
                score: 18,
                modifier: 4,
                savingThrow: 6,
                proficientInSave: true,
              },
              will: {
                score: 15,
                modifier: 2,
                savingThrow: 4,
                proficientInSave: true,
              },
              hardiness: {
                score: 12,
                modifier: 1,
                savingThrow: 1,
                proficientInSave: false,
              },
              charisma: {
                score: 13,
                modifier: 1,
                savingThrow: 1,
                proficientInSave: false,
              },
              agility: {
                score: 14,
                modifier: 2,
                savingThrow: 2,
                proficientInSave: false,
              },
              fortune: {
                score: 12,
                modifier: 1,
                savingThrow: 1,
                proficientInSave: false,
              },
              sanity: {
                score: 16,
                modifier: 3,
                savingThrow: 5,
                proficientInSave: true,
              },
            },
          },
          extensions: {
            "aow:image-briefs": {
              portrait: { imageGenerationPrompt: "Full-body portrait" },
              overheadToken: { imageGenerationPrompt: "Top-down token" },
              paperDollToken: { imageGenerationPrompt: "Side token" },
            },
          },
        }),
        responseId: "response-1",
      });
    });
    const openAi = { respond } as unknown as OpenAiService;
    const generate = jest.fn((data: Record<string, unknown>, worldId: string) =>
      Promise.resolve({
        data: {
          ...data,
          images: {
            portrait: { assetId: "portrait-1" },
            overheadToken: { assetId: "overhead-1" },
            paperDollToken: { assetId: "paper-doll-1" },
          },
        },
        assets: [],
        responseIds: {
          portrait: "image-1",
          overheadToken: "image-2",
          paperDollToken: "image-3",
        },
        worldId,
      }),
    );
    const images = { generate } as unknown as GeneratedCreatureImagesService;
    const media = { remove: jest.fn() } as unknown as MediaService;
    const service = new CreatureGenerationService(
      prompts,
      openAi,
      images,
      media,
      domain,
    );

    const result = await service.create(
      "world-1",
      "A predator that refracts moonlight.",
    );

    const submittedPrompt = respond.mock.calls[0]?.[0].input;
    expect(submittedPrompt).toContain("# Create a creature");
    expect(submittedPrompt).toContain("# Age of Wonders domain model");
    expect(submittedPrompt).toContain("The Lantern Expanse");
    expect(submittedPrompt).toContain("A predator that refracts moonlight.");
    expect(generate.mock.calls[0]?.[1]).toBe("world-1");
    expect(create.mock.calls[0]?.[0]).toBe("creatures");
    expect(create.mock.calls[0]?.[1].worldId).toBe("world-1");
    expect(create.mock.calls[0]?.[1].defenseRating).toEqual({
      contributions: [],
    });
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      attributes: {
        "aow:attribute-might": { score: 50, modifier: 0 },
        "aow:attribute-intellect": { score: 90, modifier: 4 },
        "aow:attribute-wisdom": { score: 75, modifier: 2 },
        "aow:attribute-hardiness": { score: 60, modifier: 1 },
        "aow:attribute-charisma": { score: 65, modifier: 1 },
        "aow:attribute-agility": { score: 70, modifier: 2 },
        "aow:attribute-fortune": { score: 60, modifier: 1 },
        "aow:attribute-sanity": { score: 80, modifier: 3 },
      },
    });
    expect(create.mock.calls[0]?.[1]).not.toHaveProperty("armorClass");
    expect(result.imageResponseIds).toEqual({
      portrait: "image-1",
      overheadToken: "image-2",
      paperDollToken: "image-3",
    });
  });

  it("preserves native 100-point scores and supplies neutral 50-point defaults", () => {
    const service = new CreatureGenerationService(
      {} as AiPromptService,
      {} as OpenAiService,
      {} as GeneratedCreatureImagesService,
      {} as MediaService,
      {} as DomainService,
    );
    const normalize = (
      service as unknown as {
        normalize: (
          generated: Record<string, unknown>,
          worldId: string,
        ) => Record<string, unknown>;
      }
    ).normalize.bind(service);

    const normalized = normalize(
      {
        name: "Percentile Native",
        classification: { nature: "organism", aliases: [] },
        attributes: {
          standard: {
            intellect: {
              score: 92,
              modifier: 5,
              savingThrow: 7,
              proficientInSave: true,
            },
          },
        },
      },
      "world-1",
    );
    const attributes = normalized.attributes as Record<
      string,
      { score: number }
    >;

    expect(attributes["aow:attribute-intellect"]?.score).toBe(92);
    expect(attributes["aow:attribute-might"]?.score).toBe(50);
    expect(attributes["aow:attribute-sanity"]?.score).toBe(50);
  });

  it("rejects legacy fantasy taxonomy in newly generated creatures", () => {
    const service = new CreatureGenerationService(
      {} as AiPromptService,
      {} as OpenAiService,
      {} as GeneratedCreatureImagesService,
      {} as MediaService,
      {} as DomainService,
    );
    const normalize = (
      service as unknown as {
        normalize: (
          generated: Record<string, unknown>,
          worldId: string,
        ) => Record<string, unknown>;
      }
    ).normalize.bind(service);

    expect(() =>
      normalize(
        {
          name: "Legacy Label",
          classification: { nature: "fey", aliases: [] },
        },
        "world-1",
      ),
    ).toThrow("physical creature classification");
  });
});
