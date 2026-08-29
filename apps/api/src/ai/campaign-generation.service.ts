import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import { ListDomainResourcesDto } from "../domain/dto/domain-resource.dto";
import { AiPromptService } from "./ai-prompt.service";
import { logInvalidAiOutput } from "./ai-failure-logging";
import { OpenAiService } from "./openai.service";

interface DomainRecordLike {
  readonly id: string;
  readonly name: string | null;
  readonly kind: string | null;
  readonly data: unknown;
}

@Injectable()
export class CampaignGenerationService {
  private readonly logger = new Logger(CampaignGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly domain: DomainService,
  ) {}

  async create(worldId: string, userContext: string) {
    const world = await this.domain.get("locations", worldId);
    if (world.kind !== "world" || !isObject(world.data)) {
      throw new BadGatewayException(
        "Campaign creation requires a valid root world.",
      );
    }

    const [allLocations, creatures, items, template, domainModel] =
      await Promise.all([
        this.domain.list("locations", this.query()),
        this.domain.list("creatures", this.query({ worldId })),
        this.domain.list("definitions", this.query({ worldId, kind: "item" })),
        this.prompts.read("create-campaign.md", "CREATE_CAMPAIGN_PROMPT_PATH"),
        this.prompts.read("domain-model.md", "CREATE_CAMPAIGN_PROMPT_PATH"),
      ]);

    const locations = this.locationsInWorld(worldId, allLocations.items);
    const context = {
      world: this.contextRecord(world),
      locations: locations.map((record) => this.contextRecord(record)),
      creatures: creatures.items.map((record) => this.contextRecord(record)),
      items: items.items.map((record) => this.contextRecord(record)),
    };
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Authoritative world catalogs",
      "Use only the human-readable content and identifiers supplied here:",
      JSON.stringify(context, null, 2),
      "",
      "## GM's campaign idea",
      userContext.trim(),
      "",
      "Return exactly one campaign JSON object. Do not include Markdown or commentary.",
    ].join("\n");

    const result = await this.openAi.respond({ input: combinedPrompt });
    let data: Record<string, unknown>;
    try {
      data = this.normalize(
        this.parseObject(result.output),
        worldId,
        locations,
        creatures.items,
        items.items,
      );
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-campaign",
        result.responseId,
        result.output,
      );
      throw error;
    }

    const campaign = await this.domain.create("campaigns", data);
    return { campaign, ...result, combinedPrompt };
  }

  private query(options?: { worldId?: string; kind?: string }) {
    const query = new ListDomainResourcesDto();
    query.limit = 200;
    query.sort = "name";
    query.order = "asc";
    query.worldId = options?.worldId;
    query.kind = options?.kind;
    return query;
  }

  private contextRecord(record: DomainRecordLike) {
    const data = isObject(record.data) ? record.data : {};
    const identity = isObject(data.identity) ? data.identity : {};
    return {
      id: record.id,
      name:
        record.name ??
        (typeof identity.name === "string" ? identity.name : "Unnamed content"),
      kind: record.kind,
      description:
        typeof data.description === "string"
          ? data.description
          : typeof identity.description === "string"
            ? identity.description
            : undefined,
    };
  }

  private locationsInWorld(
    worldId: string,
    records: DomainRecordLike[],
  ): DomainRecordLike[] {
    const included = new Set([worldId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const record of records) {
        const data = isObject(record.data) ? record.data : {};
        const placement = isObject(data.placement) ? data.placement : {};
        const parentId =
          placement.kind === "within-parent" &&
          typeof placement.parentLocationId === "string"
            ? placement.parentLocationId
            : undefined;
        if (parentId && included.has(parentId) && !included.has(record.id)) {
          included.add(record.id);
          changed = true;
        }
      }
    }
    return records.filter((record) => included.has(record.id));
  }

  private normalize(
    generated: Record<string, unknown>,
    worldId: string,
    locations: DomainRecordLike[],
    creatures: DomainRecordLike[],
    items: DomainRecordLike[],
  ) {
    const name = this.requiredString(generated.name, "campaign name");
    const gmPremise = this.requiredString(generated.gmPremise, "GM premise");
    const playerIntroduction = this.requiredString(
      generated.playerIntroduction,
      "player introduction",
    );
    const locationIds = new Set(locations.map(({ id }) => id));
    const creatureIds = new Set(creatures.map(({ id }) => id));
    const itemIds = new Set(items.map(({ id }) => id));
    const requestedStart =
      typeof generated.partyStartingLocationId === "string"
        ? generated.partyStartingLocationId
        : "";
    const partyStartingLocationId = locationIds.has(requestedStart)
      ? requestedStart
      : (locations.find(({ id }) => id !== worldId)?.id ?? worldId);
    const now = new Date().toISOString();
    const creaturePlacements = this.placements(
      generated.creaturePlacements,
      "creatureId",
      creatureIds,
      locationIds,
    );
    const itemPlacements = this.placements(
      generated.itemPlacements,
      "itemDefinitionId",
      itemIds,
      locationIds,
    );
    const discoveries = this.discoveries(
      generated.discoveries,
      locationIds,
      itemIds,
    );
    const requestedLocations = Array.isArray(generated.locationIds)
      ? generated.locationIds.filter(
          (id): id is string => typeof id === "string" && locationIds.has(id),
        )
      : [];
    const campaignLocationIds = [
      ...new Set([
        ...requestedLocations,
        partyStartingLocationId,
        ...creaturePlacements.map((placement) => placement.locationId),
        ...itemPlacements.map((placement) => placement.locationId),
        ...discoveries.map((discovery) => discovery.locationId),
      ]),
    ];

    return {
      identity: {
        id: randomUUID(),
        version: { revision: 1, updatedAt: now },
      },
      name,
      worldId,
      gmPremise,
      playerIntroduction,
      locationIds: campaignLocationIds,
      partyStartingLocationId,
      creaturePlacements,
      itemPlacements,
      objectPlacements: [],
      discoveries,
      locationCanvases: [],
    };
  }

  private placements(
    value: unknown,
    sourceKey: "creatureId" | "itemDefinitionId",
    sourceIds: Set<string>,
    locationIds: Set<string>,
  ) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      if (!isObject(candidate)) return [];
      const sourceId = candidate[sourceKey];
      const locationId = candidate.locationId;
      if (
        typeof sourceId !== "string" ||
        !sourceIds.has(sourceId) ||
        typeof locationId !== "string" ||
        !locationIds.has(locationId)
      ) {
        return [];
      }
      return [{ id: randomUUID(), [sourceKey]: sourceId, locationId }];
    });
  }

  private discoveries(
    value: unknown,
    locationIds: Set<string>,
    itemIds: Set<string>,
  ) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      if (!isObject(candidate)) return [];
      const name =
        typeof candidate.name === "string" ? candidate.name.trim() : "";
      const locationId = candidate.locationId;
      if (
        !name ||
        typeof locationId !== "string" ||
        !locationIds.has(locationId)
      ) {
        return [];
      }
      const grants = Array.isArray(candidate.grants)
        ? candidate.grants.flatMap((grant) =>
            this.discoveryGrant(grant, itemIds),
          )
        : [];
      return [{ id: randomUUID(), name, locationId, grants }];
    });
  }

  private discoveryGrant(
    value: unknown,
    itemIds: Set<string>,
  ): Record<string, unknown>[] {
    if (!isObject(value)) return [];
    if (
      value.kind === "rumor" ||
      value.kind === "fact" ||
      value.kind === "general-knowledge"
    ) {
      const text = typeof value.text === "string" ? value.text.trim() : "";
      return text ? [{ kind: value.kind, text }] : [];
    }
    if (
      value.kind === "item" &&
      typeof value.itemDefinitionId === "string" &&
      itemIds.has(value.itemDefinitionId)
    ) {
      return [{ kind: "item", itemDefinitionId: value.itemDefinitionId }];
    }
    if (value.kind === "money" && isObject(value.value)) {
      const amount = value.value.amount;
      const denomination = value.value.denomination;
      if (
        typeof amount === "number" &&
        Number.isFinite(amount) &&
        amount >= 0 &&
        typeof denomination === "string" &&
        denomination.trim()
      ) {
        return [
          {
            kind: "money",
            value: { amount, denomination: denomination.trim() },
          },
        ];
      }
    }
    return [];
  }

  private requiredString(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadGatewayException(
        `The AI response did not include a ${label}.`,
      );
    }
    return value.trim();
  }

  private parseObject(output: string): Record<string, unknown> {
    const withoutFence = output
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      const value: unknown = JSON.parse(withoutFence);
      if (isObject(value)) return value;
    } catch {
      // The stable error below avoids exposing a potentially large model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid campaign JSON object.",
    );
  }
}
