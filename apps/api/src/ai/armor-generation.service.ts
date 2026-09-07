import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ITEM_QUALITIES, type ItemQuality } from "@aow/common";
import { randomUUID } from "node:crypto";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { logInvalidAiOutput } from "./ai-failure-logging";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { OpenAiService } from "./openai.service";
import { assertScientificItemClassification } from "./scientific-item-validation";

const ARMOR_SLOTS = ["head", "chest", "arms", "hands", "legs", "feet"] as const;
type ArmorSlot = (typeof ARMOR_SLOTS)[number];
const equipmentSlotKey = (slot: ArmorSlot) => `aow:equipment-slot-${slot}`;

interface GeneratedArmor {
  slot: ArmorSlot;
  definition: Record<string, unknown>;
  output: string;
  responseId: string;
  imageResponseId: string;
  asset: { id: string };
  combinedPrompt: string;
}

@Injectable()
export class ArmorGenerationService {
  private readonly logger = new Logger(ArmorGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly images: GeneratedItemImageService,
    private readonly media: MediaService,
    private readonly domain: DomainService,
  ) {}

  async createSet(worldId: string, creatureId: string, userContext = "") {
    const [world, creature, template, domainModel] = await Promise.all([
      this.domain.get("locations", worldId),
      this.domain.get("creatures", creatureId),
      this.prompts.read("create-armor.md", "CREATE_ARMOR_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_ARMOR_PROMPT_PATH"),
    ]);
    if (world.kind !== "world" || !isObject(world.data)) {
      throw new BadRequestException(
        `Location '${worldId}' is not a root world and cannot provide armor context`,
      );
    }
    if (!isObject(creature.data) || creature.data.worldId !== worldId) {
      throw new BadRequestException(
        `Creature '${creatureId}' does not belong to world '${worldId}'`,
      );
    }
    const equipment = isObject(creature.data.equipment)
      ? creature.data.equipment
      : {};
    const slots = isObject(equipment.slots) ? equipment.slots : {};
    const occupied = ARMOR_SLOTS.filter(
      (slot) =>
        typeof slots[equipmentSlotKey(slot)] === "string" ||
        typeof slots[slot] === "string",
    );
    if (occupied.length) {
      throw new BadRequestException(
        `Creature '${creatureId}' already has armor in: ${occupied.join(", ")}`,
      );
    }

    const authored = await Promise.all(
      ARMOR_SLOTS.map((slot) =>
        this.generateArmor(
          slot,
          worldId,
          creatureId,
          world,
          creature,
          template,
          domainModel,
          userContext,
        ),
      ),
    );

    const generated: GeneratedArmor[] = [];
    try {
      for (const armor of authored) {
        const rendered = await this.images.generate(armor.definition, worldId);
        generated.push({
          ...armor,
          definition: rendered.data,
          asset: rendered.asset,
          imageResponseId: rendered.responseId,
        });
      }
    } catch (error) {
      await Promise.all(
        generated.map((armor) =>
          this.media.remove(armor.asset.id).catch(() => undefined),
        ),
      );
      throw error;
    }

    const createdDefinitions: Array<{ id: string }> = [];
    const createdItems: Array<{ id: string }> = [];
    try {
      const identity = isObject(creature.data.identity)
        ? creature.data.identity
        : {};
      const entityId = creature.data.entityId;
      if (typeof identity.id !== "string" || typeof entityId !== "string") {
        throw new BadRequestException(
          `Creature '${creatureId}' has invalid identity data`,
        );
      }
      const itemIds: string[] = [];
      const nextSlots: Record<string, unknown> = { ...slots };
      const contributions: Record<string, unknown>[] = [];

      for (const armor of generated) {
        const slotKey = equipmentSlotKey(armor.slot);
        const definition = await this.domain.create(
          "definitions",
          armor.definition,
        );
        createdDefinitions.push(definition);
        const definitionIdentity = isObject(armor.definition.identity)
          ? armor.definition.identity
          : {};
        const itemId = randomUUID();
        const definitionComponents = isObject(armor.definition.components)
          ? armor.definition.components
          : {};
        const quality = ITEM_QUALITIES.includes(
          definitionComponents.quality as ItemQuality,
        )
          ? definitionComponents.quality
          : "standard";
        const item = await this.domain.create("items", {
          id: itemId,
          definitionId: definition.id,
          nameOverride:
            typeof definitionIdentity.name === "string"
              ? definitionIdentity.name
              : undefined,
          quantity: 1,
          quality,
          location: { kind: "inventory", ownerId: entityId },
          analyzed: true,
          extensions: {
            "aow:worldId": worldId,
            "aow:creatureId": creatureId,
            "aow:equipmentSlot": slotKey,
          },
        });
        createdItems.push(item);
        itemIds.push(itemId);
        nextSlots[slotKey] = itemId;
        const armorComponent = isObject(definitionComponents.armor)
          ? definitionComponents.armor
          : {};
        contributions.push({
          itemId,
          equipmentSlots: [slotKey],
          dice: armorComponent.defenseDice,
        });
      }

      const inventory = isObject(creature.data.inventory)
        ? creature.data.inventory
        : {};
      const previousItemIds = Array.isArray(inventory.itemIds)
        ? inventory.itemIds
        : [];
      const defenseRating = isObject(creature.data.defenseRating)
        ? creature.data.defenseRating
        : {};
      const previousContributions = Array.isArray(defenseRating.contributions)
        ? defenseRating.contributions
        : [];
      const data = {
        ...creature.data,
        inventory: {
          ...inventory,
          itemIds: [...previousItemIds, ...itemIds],
          currencies: Array.isArray(inventory.currencies)
            ? inventory.currencies
            : [],
          attunementLimit:
            typeof inventory.attunementLimit === "number"
              ? inventory.attunementLimit
              : 0,
        },
        equipment: {
          ...equipment,
          slots: nextSlots,
          containers: Array.isArray(equipment.containers)
            ? equipment.containers
            : [],
        },
        defenseRating: {
          ...defenseRating,
          contributions: [...previousContributions, ...contributions],
        },
      };
      const updatedCreature = await this.domain.replace(
        "creatures",
        creatureId,
        { data, expectedRevision: creature.revision },
      );
      return {
        creature: updatedCreature,
        definitions: createdDefinitions,
        items: createdItems,
        generations: generated.map(
          ({ slot, output, responseId, imageResponseId }) => ({
            slot,
            output,
            responseId,
            imageResponseId,
          }),
        ),
        combinedPrompts: generated.map(({ slot, combinedPrompt }) => ({
          slot,
          combinedPrompt,
        })),
      };
    } catch (error) {
      for (const item of createdItems.toReversed()) {
        await this.domain.remove("items", item.id).catch(() => undefined);
      }
      for (const definition of createdDefinitions.toReversed()) {
        await this.domain
          .remove("definitions", definition.id)
          .catch(() => undefined);
      }
      await Promise.all(
        generated.map((armor) =>
          this.media.remove(armor.asset.id).catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  private async generateArmor(
    slot: ArmorSlot,
    worldId: string,
    creatureId: string,
    world: { data: unknown },
    creature: { data: unknown },
    template: string,
    domainModel: string,
    userContext: string,
  ): Promise<Omit<GeneratedArmor, "asset" | "imageResponseId">> {
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Authoritative world record",
      JSON.stringify(world, null, 2),
      "",
      "## Authoritative creature record",
      JSON.stringify(creature, null, 2),
      "",
      "## Authoritative target equipment slot",
      slot,
      "",
      "## User-provided context",
      userContext.trim() || "No additional direction.",
      "",
      "Return exactly one complete armor ItemDefinition JSON object. Do not include Markdown or commentary.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let definition: Record<string, unknown>;
    try {
      definition = this.normalizeDefinition(
        this.parseObject(result.output),
        slot,
        worldId,
        creatureId,
      );
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        `create-armor:${slot}`,
        result.responseId,
        result.output.length,
      );
      throw error;
    }
    return {
      slot,
      definition,
      ...result,
      combinedPrompt,
    };
  }

  private normalizeDefinition(
    generated: Record<string, unknown>,
    slot: ArmorSlot,
    worldId: string,
    creatureId: string,
  ) {
    const identity = isObject(generated.identity) ? generated.identity : {};
    const name =
      typeof identity.name === "string" && identity.name.trim()
        ? identity.name.trim()
        : undefined;
    if (!name) {
      throw new BadGatewayException(
        `The AI response did not include a name for ${slot} armor.`,
      );
    }
    const components = isObject(generated.components)
      ? generated.components
      : {};
    const armor = isObject(components.armor) ? components.armor : {};
    const defenseDice = isObject(armor.defenseDice) ? armor.defenseDice : {};
    const terms = Array.isArray(defenseDice.terms) ? defenseDice.terms : [];
    if (
      terms.length === 0 ||
      terms.some((value) => {
        const term = isObject(value) ? value : {};
        return (
          term.kind !== "dice" ||
          typeof term.count !== "number" ||
          term.count < 1 ||
          typeof term.size !== "number" ||
          term.size < 2
        );
      })
    ) {
      throw new BadGatewayException(
        `The AI response did not include valid defense dice for ${slot} armor.`,
      );
    }
    assertScientificItemClassification(components);
    const definitionId = randomUUID();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const normalizedArmor: Record<string, unknown> = {
      ...armor,
      category:
        armor.category === "light" ||
        armor.category === "medium" ||
        armor.category === "heavy"
          ? armor.category
          : "medium",
      defenseDice: { ...defenseDice, terms },
    };
    const quality = ITEM_QUALITIES.includes(components.quality as ItemQuality)
      ? components.quality
      : "standard";
    delete normalizedArmor.armorClass;
    return {
      ...generated,
      identity: {
        ...identity,
        id: definitionId,
        key: `aow:${slug || `${slot}-armor`}-${definitionId.slice(0, 8)}`,
        name,
        source: {
          namespace: "aow",
          edition: "homebrew:age-of-wonders",
          license: "private",
        },
        tags: Array.from(
          new Set([
            "armor",
            slot,
            ...(Array.isArray(identity.tags)
              ? identity.tags.filter(
                  (value): value is string => typeof value === "string",
                )
              : []),
          ]),
        ),
      },
      kind: "item",
      components: {
        ...components,
        category: "armor",
        quality,
        equippable: { compatibleSlotSets: [[equipmentSlotKey(slot)]] },
        armor: normalizedArmor,
      },
      extensions: {
        ...(isObject(generated.extensions) ? generated.extensions : {}),
        "aow:worldId": worldId,
        "aow:creatureId": creatureId,
        "aow:equipmentSlot": equipmentSlotKey(slot),
      },
    };
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
      // Keep the gateway response stable and avoid leaking model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid armor definition JSON object.",
    );
  }
}
