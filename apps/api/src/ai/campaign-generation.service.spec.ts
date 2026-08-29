import { DomainService } from "../domain/domain.service";
import { AiPromptService } from "./ai-prompt.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { OpenAiService } from "./openai.service";

describe("CampaignGenerationService", () => {
  it("grounds generated campaign content in the selected world before persisting", async () => {
    const world = {
      id: "world-1",
      name: "Greybridge",
      kind: "world",
      data: { identity: { name: "Greybridge" } },
    };
    const sewer = {
      id: "location-1",
      name: "Old sewer",
      kind: "site",
      data: {
        placement: { kind: "within-parent", parentLocationId: "world-1" },
      },
    };
    const creature = {
      id: "creature-1",
      name: "The Bell Keeper",
      kind: "person",
      data: {},
    };
    const item = {
      id: "item-1",
      name: "Floodgate key",
      kind: "item",
      data: {},
    };
    const output = JSON.stringify({
      name: "The Bells Below",
      gmPremise: "<h2>The hidden danger</h2><p>The river is rising.</p>",
      playerIntroduction: "<p>Greybridge needs investigators.</p>",
      locationIds: [sewer.id, "not-in-world"],
      partyStartingLocationId: sewer.id,
      creaturePlacements: [
        { creatureId: creature.id, locationId: sewer.id },
        { creatureId: "not-in-world", locationId: sewer.id },
      ],
      itemPlacements: [{ itemDefinitionId: item.id, locationId: sewer.id }],
      discoveries: [
        {
          name: "Scratches on the gate",
          locationId: sewer.id,
          grants: [
            { kind: "fact", text: "The gate was opened from below." },
            { kind: "item", itemDefinitionId: "not-in-world" },
          ],
        },
      ],
    });
    const respond = jest.fn((input: { input: string }) => {
      void input;
      return Promise.resolve({ output, responseId: "response-1" });
    });
    const create = jest.fn((resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ id: "campaign-1", resource, data }),
    );
    const domain = {
      get: jest.fn(() => Promise.resolve(world)),
      list: jest.fn((resource: string) => {
        if (resource === "locations")
          return Promise.resolve({ items: [sewer] });
        if (resource === "creatures")
          return Promise.resolve({ items: [creature] });
        return Promise.resolve({ items: [item] });
      }),
      create,
    } as unknown as DomainService;
    const prompts = {
      read: jest.fn((fileName: string) =>
        Promise.resolve(
          fileName === "domain-model.md"
            ? "# Age of Wonders domain model"
            : "# Create a campaign",
        ),
      ),
    } as unknown as AiPromptService;
    const service = new CampaignGenerationService(
      prompts,
      { respond } as unknown as OpenAiService,
      domain,
    );

    const result = await service.create(
      world.id,
      "A mystery beneath a flooded city.",
    );

    expect(respond.mock.calls[0]?.[0].input).toContain("Greybridge");
    expect(respond.mock.calls[0]?.[0].input).toContain(
      "A mystery beneath a flooded city.",
    );
    expect(create).toHaveBeenCalledTimes(1);
    const [resource, campaign] = create.mock.calls[0] ?? [];
    expect(resource).toBe("campaigns");
    expect(campaign.worldId).toBe(world.id);
    expect(campaign.locationIds).toEqual([sewer.id]);
    expect(campaign.partyStartingLocationId).toBe(sewer.id);
    expect(campaign.creaturePlacements).toHaveLength(1);
    expect(campaign.itemPlacements).toHaveLength(1);
    expect(campaign.locationCanvases).toEqual([]);
    expect(campaign.discoveries).toEqual([
      expect.objectContaining({
        name: "Scratches on the gate",
        grants: [{ kind: "fact", text: "The gate was opened from below." }],
      }),
    ]);
    expect(result.responseId).toBe("response-1");
  });
});
