import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { OpenAiService } from "./openai.service";
import { WeaponGenerationService } from "./weapon-generation.service";

describe("WeaponGenerationService", () => {
  it("normalizes, illustrates, and persists a structured weapon definition", async () => {
    const world = {
      id: "world-1",
      kind: "world",
      data: { identity: { id: "world-1" }, name: "Gaslight Earth" },
    };
    const create = jest.fn((resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ resource, id: "weapon-1", data }),
    );
    const domain = {
      get: jest.fn(() => Promise.resolve(world)),
      create,
    } as unknown as DomainService;
    const prompts = {
      read: jest.fn((name: string) => Promise.resolve(`# ${name}`)),
    } as unknown as AiPromptService;
    const respond = jest.fn(() =>
      Promise.resolve({
        output: JSON.stringify({
          identity: {
            id: "model-id",
            name: "Galvanic Carbine",
            description: "A two-handed electrical rifle.",
          },
          components: {
            quality: "exquisite",
            operatingBasis: "electrical",
            understanding: "understood",
            weapon: {
              category: "martial-ranged",
              hitDice: {
                terms: [{ kind: "dice", count: 1, size: 4 }],
              },
              range: {
                kind: "ranged",
                minimum: { value: 10, unit: "foot" },
                maximum: { value: 180, unit: "foot" },
              },
              damage: [
                {
                  damage: {
                    terms: [{ kind: "dice", count: 2, size: 6 }],
                  },
                  damageType: "electrical",
                  savingThrow: {
                    test: {
                      kind: "saving-throw",
                      attribute: "hardiness",
                      difficultyClass: { kind: "constant", value: 14 },
                    },
                    onSuccess: "half-damage",
                  },
                },
              ],
              wieldingModes: [{ kind: "two-handed", handsRequired: 2 }],
              properties: ["two-handed"],
            },
          },
        }),
        responseId: "response-1",
      }),
    );
    const generate = jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({
        data: { ...data, image: { assetId: "asset-1" } },
        asset: { id: "asset-1" },
        responseId: "image-response-1",
      }),
    );
    const service = new WeaponGenerationService(
      prompts,
      { respond } as unknown as OpenAiService,
      { generate } as unknown as GeneratedItemImageService,
      { remove: jest.fn() } as unknown as MediaService,
      domain,
    );

    const result = await service.create("world-1", "An electrical carbine.");

    expect(respond).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[1];
    expect(data).toMatchObject({
      kind: "item",
      components: {
        category: "weapon",
        quality: "exquisite",
        equippable: {
          compatibleSlotSets: [["main-hand", "off-hand"]],
        },
      },
      extensions: { "aow:worldId": "world-1" },
      image: { assetId: "asset-1" },
    });
    expect(result.definition.id).toBe("weapon-1");
  });
});
