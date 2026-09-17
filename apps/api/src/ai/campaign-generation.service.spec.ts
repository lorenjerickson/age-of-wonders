import { BadGatewayException, NotFoundException } from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { AiPromptService } from "./ai-prompt.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { OpenAiService } from "./openai.service";

describe("CampaignGenerationService", () => {
  it("proposes draft Plots and placements from one authorized immutable World capture", async () => {
    const manifest = buildSnapshotManifest(1, [
      {
        resourceType: "world-definition-revision",
        sourceId: "world-revision-2",
        sourceRevision: 2,
        payload: {
          rootLocationId: "world-1",
          locationIds: ["world-1", "location-1"],
        },
      },
      {
        resourceType: "locations",
        sourceId: "world-1",
        payload: { name: "Greybridge", kind: "world" },
      },
      {
        resourceType: "locations",
        sourceId: "location-1",
        payload: { name: "Old sewer", kind: "site" },
      },
      {
        resourceType: "definitions",
        sourceId: "creature-1",
        payload: { identity: { name: "The Bell Keeper" }, kind: "creature" },
      },
      {
        resourceType: "definitions",
        sourceId: "item-1",
        payload: { identity: { name: "Floodgate key" }, kind: "item" },
      },
      {
        resourceType: "world-placements",
        sourceId: "world-placement-1",
        payload: { name: "The Keeper at the gate", locationId: "location-1" },
      },
    ]);
    const output = JSON.stringify({
      name: "The Bells Below",
      description: "An investigation beneath Greybridge.",
      gmPremise: "<h2>The hidden danger</h2><p>The river is rising.</p>",
      playerIntroduction: "<p>Greybridge needs investigators.</p>",
      partyStartingLocationId: "location-1",
      plots: [
        {
          key: "bells",
          name: "The Bells Below",
          objectives: [{ name: "Find the source" }],
          pressures: ["The river rises"],
          resistances: ["The gate is sealed"],
          discoveries: [
            {
              name: "The Keeper's warning",
              claims: [
                {
                  key: "rising-water",
                  kind: "truth",
                  statement: "The river is already rising.",
                },
                {
                  key: "silent-bells",
                  kind: "rumor",
                  statement: "Silencing the bells will stop the flood.",
                  conflictsWithKeys: ["rising-water"],
                },
              ],
            },
          ],
          locationIds: ["location-1", "not-in-world"],
        },
        {
          key: "floodgate",
          parentKey: "bells",
          name: "Open the Floodgate",
          prerequisites: ["bells"],
        },
      ],
      placements: [
        {
          kind: "independent",
          name: "The hidden key",
          locationId: "location-1",
          plotKeys: ["bells", "floodgate"],
          source: { kind: "world-item", itemDefinitionId: "item-1" },
        },
        {
          kind: "world-decoration",
          name: "Keeper knows the danger",
          locationId: "location-1",
          plotKeys: ["bells"],
          capturedWorldPlacementId: "world-placement-1",
        },
        {
          kind: "independent",
          locationId: "location-1",
          plotKeys: ["bells"],
          source: { kind: "world-creature", creatureId: "not-captured" },
        },
      ],
    });
    const respond = jest
      .fn()
      .mockResolvedValue({ output, responseId: "response-1" });
    const findUnique = jest.fn().mockResolvedValue({
      id: "world-snapshot-2",
      worldDefinitionId: "world-definition-1",
      manifest,
      contentHash: manifest.contentHash,
      worldDefinitionRevision: { revisionNumber: 2, name: "Greybridge" },
    });
    const service = new CampaignGenerationService(
      {
        read: jest.fn((fileName: string) =>
          Promise.resolve(
            fileName === "domain-model.md"
              ? "# Age of Wonders domain model"
              : "# Create a Campaign Definition draft",
          ),
        ),
      } as unknown as AiPromptService,
      { respond } as unknown as OpenAiService,
      { worldDefinitionSnapshot: { findUnique } },
    );

    const result = await service.createDraftProposal(
      "world-snapshot-2",
      "gm-1",
      "A mystery beneath a flooded city.",
    );

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "world-snapshot-2",
          worldDefinition: { ownerUserId: "gm-1" },
        },
      }),
    );
    const responseCalls = respond.mock.calls as unknown as Array<
      [{ input: string }]
    >;
    expect(responseCalls[0]?.[0].input).toContain("Greybridge");
    expect(responseCalls[0]?.[0].input).toContain(
      "explicitly selected immutable World snapshot",
    );
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 6_000 }),
    );
    expect(result.draftProposal).toMatchObject({
      sourceWorldDefinitionSnapshotId: "world-snapshot-2",
      name: "The Bells Below",
      content: {
        formatVersion: 1,
        modelSchemaReleaseIds: [],
        preparation: { startingLocationId: "location-1" },
      },
    });
    expect(result.draftProposal.content.gmPremise).toContain("hidden danger");
    expect(result.draftProposal.content.playerIntroduction).toContain(
      "Greybridge",
    );
    expect(result.draftProposal.plots).toHaveLength(2);
    expect(result.draftProposal.plots[1]?.parent.kind).toBe("subplot");
    expect(result.draftProposal.plots[0]?.locationContexts).toHaveLength(1);
    expect(result.draftProposal.plots[0]?.discoveries[0]?.truth.statement).toBe(
      "The river is already rising.",
    );
    expect(result.draftProposal.plots[0]?.discoveries[0]?.rumors).toHaveLength(
      1,
    );
    expect(result.draftProposal.plots[0]?.discoveries[0]?.rumors[0]?.relation).toBe(
      "contradicts",
    );
    expect(result.draftProposal.placements).toHaveLength(2);
    expect(result.draftProposal.placements[0]?.plotDefinitionIds).toHaveLength(
      2,
    );
    expect(
      result.draftProposal.records.map(({ resourceType }) => resourceType),
    ).toEqual(["plots", "plots", "campaign-placements", "campaign-placements"]);
    expect(JSON.stringify(result)).not.toContain('"resource":"campaigns"');
  });

  it("does not generate from a missing or foreign-owned snapshot", async () => {
    const respond = jest.fn();
    const service = new CampaignGenerationService(
      { read: jest.fn() } as unknown as AiPromptService,
      { respond } as unknown as OpenAiService,
      {
        worldDefinitionSnapshot: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    );

    await expect(
      service.createDraftProposal("opaque-snapshot", "gm-1", "An idea"),
    ).rejects.toEqual(
      new NotFoundException(
        "The selected World Definition snapshot was not found.",
      ),
    );
    expect(respond).not.toHaveBeenCalled();
  });

  it("rejects a snapshot whose manifest integrity cannot be verified", async () => {
    const manifest = buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "world", payload: {} },
    ]);
    const service = new CampaignGenerationService(
      { read: jest.fn() } as unknown as AiPromptService,
      { respond: jest.fn() } as unknown as OpenAiService,
      {
        worldDefinitionSnapshot: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-snapshot",
            worldDefinitionId: "world-definition",
            manifest,
            contentHash: "tampered",
            worldDefinitionRevision: { revisionNumber: 1, name: "World" },
          }),
        },
      },
    );

    await expect(
      service.createDraftProposal("world-snapshot", "gm-1", "An idea"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it.each([
    "<script>alert(1)</script>",
    '<p onclick="alert(1)">Premise</p>',
    '<a href="javascript:alert(1)">Premise</a>',
  ])("rejects unsafe rich text returned by the model", async (gmPremise) => {
    const manifest = buildSnapshotManifest(1, [
      {
        resourceType: "locations",
        sourceId: "world",
        payload: { name: "World" },
      },
    ]);
    const service = new CampaignGenerationService(
      {
        read: jest.fn().mockResolvedValue("prompt"),
      } as unknown as AiPromptService,
      {
        respond: jest.fn().mockResolvedValue({
          output: JSON.stringify({
            name: "Unsafe Campaign",
            gmPremise,
            playerIntroduction: "Introduction",
            plots: [{ key: "root", name: "Root Plot" }],
          }),
          responseId: "unsafe-response",
        }),
      } as unknown as OpenAiService,
      {
        worldDefinitionSnapshot: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-snapshot",
            worldDefinitionId: "world-definition",
            manifest,
            contentHash: manifest.contentHash,
            worldDefinitionRevision: { revisionNumber: 1, name: "World" },
          }),
        },
      },
    );

    await expect(
      service.createDraftProposal("world-snapshot", "gm-1", "An idea"),
    ).rejects.toThrow("unsafe Campaign rich text");
  });

  it("bounds captured catalog records sent to the model", async () => {
    const locations = Array.from({ length: 130 }, (_, index) => ({
      resourceType: "locations",
      sourceId: `location-${index}`,
      payload: { name: `Catalog location ${index}`, kind: "site" },
    }));
    const manifest = buildSnapshotManifest(1, locations);
    const respond = jest.fn().mockResolvedValue({
      output: JSON.stringify({
        name: "Bounded Campaign",
        gmPremise: "A compact premise.",
        playerIntroduction: "A compact introduction.",
        partyStartingLocationId: "location-0",
        plots: [{ key: "root", name: "Root Plot" }],
      }),
      responseId: "response-bounded",
    });
    const service = new CampaignGenerationService(
      {
        read: jest.fn().mockResolvedValue("short prompt"),
      } as unknown as AiPromptService,
      { respond } as unknown as OpenAiService,
      {
        worldDefinitionSnapshot: {
          findUnique: jest.fn().mockResolvedValue({
            id: "world-snapshot",
            worldDefinitionId: "world-definition",
            manifest,
            contentHash: manifest.contentHash,
            worldDefinitionRevision: { revisionNumber: 1, name: "World" },
          }),
        },
      },
    );

    await service.createDraftProposal(
      "world-snapshot",
      "gm-1",
      "A bounded request",
    );

    const responseCalls = respond.mock.calls as unknown as Array<
      [{ input: string }]
    >;
    const input = responseCalls[0][0].input;
    expect(input).toContain("Catalog location 124");
    expect(input).not.toContain("Catalog location 125");
  });
});
