import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { WorldDraftProposalService } from "./world-draft-proposal.service";

describe("WorldDraftProposalService", () => {
  const root = {
    resourceType: "locations",
    sourceId: "root-location",
    payload: {
      identity: {
        id: "root-location",
        version: { revision: 1, updatedAt: "2026-09-07T12:00:00.000Z" },
      },
      name: "Known World",
      kind: "world",
      placement: { kind: "root" },
    },
  };
  const draft = {
    storageRevision: 7,
    revisionName: "Known World working draft",
    content: {
      rootLocationId: "root-location",
      locationIds: ["root-location"],
      definitionIds: [],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: [],
      modelSchemaReleaseIds: ["model-release"],
    },
    records: [root],
  };
  const elements = [
    element("creature-concept", "aow:creature", "concept"),
    element("item-concept", "aow:item", "concept"),
    element("aow:attribute-might", "aow:attribute"),
    element("aow:slot-hands", "aow:equipment-slot"),
    element("aow:item-family-tool", "aow:item-family"),
  ];
  function harness(output: string) {
    const authoring = { getActiveDraft: jest.fn().mockResolvedValue(draft) };
    const models = {
      resolveEffectiveRoots: jest
        .fn()
        .mockResolvedValue({ roots: [], elements }),
    };
    const prompts = { read: jest.fn().mockResolvedValue("canonical guide") };
    const openAi = {
      respond: jest.fn().mockResolvedValue({
        output,
        responseId: "provider-response",
        model: "test-model",
      }),
    };
    return {
      service: new WorldDraftProposalService(
        authoring as never,
        models as never,
        prompts as never,
        openAi as never,
      ),
      authoring,
      models,
      prompts,
      openAi,
    };
  }

  it.each([
    [
      "location",
      {
        name: "Glass Marsh",
        description: "A flooded plain.",
        kind: "region",
        profileSummary: "Shimmering wetlands",
        profileTags: ["wetland", "glass"],
        mapSceneNotes: "Keep the horizon low.",
        mapOrientation: "scenic",
      },
      { parentLocationId: "root-location" },
    ],
    [
      "creature",
      {
        name: "Reed Stalker",
        attributes: { "aow:attribute-might": 55 },
        equipmentSlots: ["aow:slot-hands"],
        instanceEmbodimentPolicy: {
          strategy: "one-per-instance",
          maximumPerCampaignInstance: 1,
        },
        artDirection: "Reeds draped over a low silhouette.",
        movement: [{ mode: "walk", distance: { value: 30, unit: "foot" } }],
        progressiveMechanicsNotes: "It learns from repeated encounters.",
      },
      {},
    ],
    [
      "item",
      {
        name: "Survey Lens",
        itemFamilyKey: "aow:item-family-tool",
        category: "tool",
        quality: "fine",
        compatibleEquipmentSlotSets: [["aow:slot-hands"]],
      },
      {},
    ],
  ] as const)(
    "returns a validated editable %s proposal without persistence",
    async (kind, generated, extra) => {
      const { service, authoring, models, openAi } = harness(
        JSON.stringify(generated),
      );

      const result = await service.propose(kind, "owned-world", "owner-1", {
        expectedStorageRevision: 7,
        direction: "Make something memorable",
        ...extra,
      });

      expect(result.proposal).toMatchObject({
        ...generated,
        expectedStorageRevision: 7,
      });
      expect(result.proposal).not.toHaveProperty("identity");
      expect(result.proposal).not.toHaveProperty("conformance");
      expect(result.proposal).not.toHaveProperty("image");
      if (kind === "creature") {
        expect(result.proposal).not.toHaveProperty("skillDefinitionIds");
        expect(result.proposal).not.toHaveProperty("professionDefinitionIds");
      }
      expect(authoring.getActiveDraft).toHaveBeenCalledWith(
        "owned-world",
        "owner-1",
      );
      expect(models.resolveEffectiveRoots).toHaveBeenCalledWith(
        ["model-release"],
        "owner-1",
        "owned-world",
      );
      expect(openAi.respond).toHaveBeenCalledWith(
        expect.objectContaining({ deadlineMs: 60_000, maxOutputTokens: 4_000 }),
      );
      const calls = openAi.respond.mock.calls as unknown as Array<
        [{ input: string }]
      >;
      const input = calls[0]?.[0].input ?? "";
      expect(input.length).toBeLessThanOrEqual(24_000);
      expect(input).not.toContain("## Domain model");
      expect(models.resolveEffectiveRoots).toHaveBeenCalledTimes(1);
      expect(authoring).not.toHaveProperty("save");
      expect(authoring).not.toHaveProperty("createLocation");
    },
  );

  it("loads the bounded proposal guide instead of the complete architecture guide", async () => {
    const prepared = harness(
      JSON.stringify({ name: "Place", kind: "region", profileTags: [] }),
    );

    await prepared.service.propose("location", "owned-world", "owner-1", {
      expectedStorageRevision: 7,
      direction: "A quiet place",
      parentLocationId: "root-location",
    });

    expect(prepared.prompts.read).toHaveBeenCalledWith(
      "world-draft-proposal.md",
      "WORLD_DRAFT_PROPOSAL_PROMPT_PATH",
    );
  });

  it("rejects stale drafts and invalid parent Locations before paid work", async () => {
    const stale = harness("{}");
    await expect(
      stale.service.propose("location", "world", "owner", {
        expectedStorageRevision: 6,
        direction: "A place",
        parentLocationId: "root-location",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.openAi.respond).not.toHaveBeenCalled();

    const invalidParent = harness("{}");
    await expect(
      invalidParent.service.propose("location", "world", "owner", {
        expectedStorageRevision: 7,
        direction: "A place",
        parentLocationId: "not-in-draft",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(invalidParent.openAi.respond).not.toHaveBeenCalled();
  });

  it("stops when the owned active World draft cannot be resolved", async () => {
    const unavailable = harness("{}");
    unavailable.authoring.getActiveDraft.mockRejectedValue(
      new NotFoundException("The selected World Definition was not found."),
    );

    await expect(
      unavailable.service.propose("item", "another-world", "owner-1", {
        expectedStorageRevision: 7,
        direction: "A useful tool",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(unavailable.models.resolveEffectiveRoots).not.toHaveBeenCalled();
    expect(unavailable.openAi.respond).not.toHaveBeenCalled();
  });

  it.each([
    [
      "creature",
      "aow:creature",
      elements.filter((entry) => entry.lineage.semanticRole !== "aow:creature"),
    ],
    [
      "item",
      "aow:item",
      elements.filter((entry) => entry.lineage.semanticRole !== "aow:item"),
    ],
    [
      "item",
      "Item family",
      elements.filter(
        (entry) => entry.lineage.semanticRole !== "aow:item-family",
      ),
    ],
  ] as const)(
    "rejects %s proposals with unavailable %s Models before paid work",
    async (kind, _missing, availableElements) => {
      const unavailable = harness("{}");
      unavailable.models.resolveEffectiveRoots.mockResolvedValue({
        roots: [],
        elements: availableElements,
      });

      await expect(
        unavailable.service.propose(kind, "owned-world", "owner-1", {
          expectedStorageRevision: 7,
          direction: "Something useful",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(unavailable.openAi.respond).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid, oversized, and non-conforming provider output", async () => {
    await expect(
      harness("not json").service.propose("creature", "world", "owner", {
        expectedStorageRevision: 7,
        direction: "A creature",
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      harness("x".repeat(32_001)).service.propose(
        "creature",
        "world",
        "owner",
        {
          expectedStorageRevision: 7,
          direction: "A creature",
        },
      ),
    ).rejects.toThrow("too large");
    await expect(
      harness(
        JSON.stringify({
          name: "Wrong",
          attributes: { "extension:unknown": 10 },
          equipmentSlots: [],
          instanceEmbodimentPolicy: { strategy: "one-per-instance" },
        }),
      ).service.propose("creature", "world", "owner", {
        expectedStorageRevision: 7,
        direction: "A creature",
      }),
    ).rejects.toThrow("Attribute");
    await expect(
      harness(
        JSON.stringify({
          name: "Invented expert",
          attributes: {},
          equipmentSlots: [],
          instanceEmbodimentPolicy: { strategy: "one-per-instance" },
          skillDefinitionIds: ["opaque-invented-reference"],
        }),
      ).service.propose("creature", "world", "owner", {
        expectedStorageRevision: 7,
        direction: "A creature",
      }),
    ).rejects.toThrow("Choose them in the editor");
  });
});

function element(
  key: string,
  semanticRole: string,
  kind = "vocabulary-option",
) {
  return {
    sourceReleaseId: "model-release",
    lineage: {
      id: key,
      registryId: "registry",
      key,
      kind,
      semanticRole,
      applicability: { kind: "global" },
      status: "active",
    },
    revision: {
      identity: {
        id: `${key}-revision`,
        lineageId: key,
        revisionNumber: 1,
        publishedAt: "2026-09-07T12:00:00.000Z",
      },
      payload: {},
      presentation: { label: key },
    },
  };
}
