import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { ArmorGenerationService } from "./armor-generation.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { OpenAiService } from "./openai.service";

describe("ArmorGenerationService", () => {
  it("creates and equips one persisted armor item for every supported slot", async () => {
    const world = {
      id: "world-1",
      kind: "world",
      revision: 1,
      data: {
        identity: { id: "world-1" },
        name: "The Lantern Expanse",
        kind: "world",
      },
    };
    const creature = {
      id: "creature-1",
      kind: null,
      revision: 3,
      data: {
        identity: { id: "creature-1" },
        entityId: "entity-1",
        worldId: "world-1",
        name: "Prism-Horn Stalker",
        inventory: { itemIds: [], currencies: [], attunementLimit: 0 },
        equipment: { slots: {}, containers: [] },
        defenseRating: { contributions: [] },
      },
    };
    const get = jest.fn((resource: string) =>
      Promise.resolve(resource === "locations" ? world : creature),
    );
    const create = jest.fn(
      (resource: string, data: Record<string, unknown>) => {
        const identity =
          typeof data.identity === "object" && data.identity !== null
            ? (data.identity as Record<string, unknown>)
            : {};
        return Promise.resolve({
          id:
            resource === "definitions" ? String(identity.id) : String(data.id),
          data,
        });
      },
    );
    const replace = jest.fn(
      (
        resource: string,
        id: string,
        dto: { data: Record<string, unknown>; expectedRevision?: number },
      ) => Promise.resolve({ resource, id, revision: 4, data: dto.data }),
    );
    const domain = {
      get,
      create,
      replace,
      remove: jest.fn(() => Promise.resolve()),
    } as unknown as DomainService;
    const prompts = {
      read: jest.fn((fileName: string) =>
        Promise.resolve(
          fileName === "domain-model.md"
            ? "# Age of Wonders domain model"
            : "# Create armor",
        ),
      ),
    } as unknown as AiPromptService;
    const respond = jest.fn((input: { input: string }) => {
      const slot = ["head", "chest", "arms", "hands", "legs", "feet"].find(
        (candidate) => input.input.includes(`\n${candidate}\n`),
      );
      return Promise.resolve({
        output: JSON.stringify({
          identity: {
            id: "model-id",
            key: `aow:${slot}-armor`,
            name: `${slot} armor`,
            description: `Armor for the ${slot}.`,
            source: { namespace: "aow", edition: "homebrew:test" },
          },
          kind: "item",
          components: {
            category: "armor",
            operatingBasis: "mechanical",
            understanding: "understood",
            equippable: { compatibleSlotSets: [[slot]] },
            armor: {
              category: slot === "chest" ? "heavy" : "light",
              defenseDice: {
                terms: [
                  {
                    kind: "dice",
                    count: 1,
                    size: slot === "chest" ? 10 : 4,
                    label: `${slot} armor`,
                  },
                ],
              },
            },
          },
        }),
        responseId: `response-${slot}`,
      });
    });
    const openAi = { respond } as unknown as OpenAiService;
    let imageIndex = 0;
    const generate = jest.fn((data: Record<string, unknown>) => {
      imageIndex += 1;
      return Promise.resolve({
        data: {
          ...data,
          image: {
            assetId: `asset-${imageIndex}`,
            altText: "Inventory armor view",
            width: 1024,
            height: 1024,
            mimeType: "image/webp",
          },
        },
        asset: { id: `asset-${imageIndex}` },
        responseId: `image-response-${imageIndex}`,
      });
    });
    const images = { generate } as unknown as GeneratedItemImageService;
    const media = { remove: jest.fn() } as unknown as MediaService;
    const service = new ArmorGenerationService(
      prompts,
      openAi,
      images,
      media,
      domain,
    );

    const result = await service.createSet(
      "world-1",
      "creature-1",
      "Use moon-bronze.",
    );

    expect(respond).toHaveBeenCalledTimes(6);
    expect(generate).toHaveBeenCalledTimes(6);
    expect(result.definitions).toHaveLength(6);
    expect(result.items).toHaveLength(6);
    const replaced = replace.mock.calls[0]?.[2].data;
    const inventory = replaced?.inventory as { itemIds: string[] };
    const equipment = replaced?.equipment as { slots: Record<string, string> };
    const defense = replaced?.defenseRating as {
      contributions: Array<{ itemId: string; equipmentSlots: string[] }>;
    };
    expect(inventory.itemIds).toHaveLength(6);
    expect(Object.keys(equipment.slots)).toEqual([
      "head",
      "chest",
      "arms",
      "hands",
      "legs",
      "feet",
    ]);
    expect(defense.contributions).toHaveLength(6);
    expect(defense.contributions[0]?.equipmentSlots).toEqual(["head"]);
  });
});
