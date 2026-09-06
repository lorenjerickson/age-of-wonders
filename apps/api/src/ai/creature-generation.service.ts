import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { CORE_ATTRIBUTE_KEYS, isAttributeScore } from "@aow/common";
import { randomUUID } from "node:crypto";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { logInvalidAiOutput } from "./ai-failure-logging";
import { GeneratedCreatureImagesService } from "./generated-creature-images.service";
import { OpenAiService } from "./openai.service";

const LEGACY_CREATURE_NATURES = new Set([
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
]);

const LEGACY_ATTRIBUTE_NAMES = [
  "might",
  "intellect",
  "will",
  "hardiness",
  "charisma",
  "agility",
  "fortune",
  "sanity",
] as const;

@Injectable()
export class CreatureGenerationService {
  private readonly logger = new Logger(CreatureGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly images: GeneratedCreatureImagesService,
    private readonly media: MediaService,
    private readonly domain: DomainService,
  ) {}

  async create(worldId: string, userContext: string) {
    const world = await this.domain.get("locations", worldId);
    if (world.kind !== "world" || !isObject(world.data)) {
      throw new BadRequestException(
        `Location '${worldId}' is not a root world and cannot own creatures`,
      );
    }
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-creature.md", "CREATE_CREATURE_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_CREATURE_PROMPT_PATH"),
    ]);
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Authoritative world record",
      "Create the creature for this root world and set worldId to its data.identity.id:",
      JSON.stringify(world, null, 2),
      "",
      "## User-provided context",
      userContext.trim(),
      "",
      "Return exactly one complete CreatureState JSON object. Do not include Markdown or commentary.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let data: Record<string, unknown>;
    try {
      data = this.normalize(this.parseObject(result.output), worldId);
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-creature",
        result.responseId,
        result.output,
      );
      throw error;
    }
    const rendered = await this.images.generate(data, worldId);
    try {
      const creature = await this.domain.create("creatures", rendered.data);
      return {
        creature,
        ...result,
        imageResponseIds: rendered.responseIds,
        combinedPrompt,
      };
    } catch (error) {
      await Promise.all(
        rendered.assets.map((asset) =>
          this.media.remove(asset.id).catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  private normalize(
    generated: Record<string, unknown>,
    worldId: string,
  ): Record<string, unknown> {
    if (typeof generated.name !== "string" || !generated.name.trim()) {
      throw new BadGatewayException(
        "The AI response did not include a creature name.",
      );
    }
    const classification = isObject(generated.classification)
      ? generated.classification
      : {};
    if (
      typeof classification.nature !== "string" ||
      !classification.nature.trim() ||
      LEGACY_CREATURE_NATURES.has(classification.nature) ||
      !Array.isArray(classification.aliases)
    ) {
      throw new BadGatewayException(
        "The AI response did not include a valid physical creature classification.",
      );
    }
    const senses = Array.isArray(generated.senses) ? generated.senses : [];
    if (
      senses.some((value) => {
        if (
          !isObject(value) ||
          typeof value.sense !== "string" ||
          value.sense === "truesight"
        )
          return true;
        return (
          value.sense !== "normal" &&
          (typeof value.operatingBasis !== "string" ||
            typeof value.understanding !== "string")
        );
      })
    ) {
      throw new BadGatewayException(
        "Every extraordinary sense requires an operating basis and understanding state.",
      );
    }
    const conditions = Array.isArray(generated.conditions)
      ? generated.conditions
      : [];
    if (conditions.includes("charmed") || conditions.includes("petrified")) {
      throw new BadGatewayException(
        "The AI response used a legacy fantasy condition.",
      );
    }
    const damageAdjustments = Array.isArray(generated.damageAdjustments)
      ? generated.damageAdjustments
      : [];
    if (
      damageAdjustments.some(
        (value) => isObject(value) && "bypassedBy" in value,
      )
    ) {
      throw new BadGatewayException(
        "Damage-defense bypasses must use a structured predicate.",
      );
    }
    const now = new Date().toISOString();
    const attributes = isObject(generated.attributes)
      ? generated.attributes
      : {};
    const standard = isObject(attributes.standard) ? attributes.standard : {};
    const suppliedScores = CORE_ATTRIBUTE_KEYS.map((key, index) => {
      const legacyKey = LEGACY_ATTRIBUTE_NAMES[index];
      const attribute = isObject(attributes[key])
        ? attributes[key]
        : isObject(standard[legacyKey])
          ? standard[legacyKey]
          : {};
      return attribute.score;
    });
    const usesTwentyPointScale = suppliedScores.every(
      (score) =>
        typeof score === "number" &&
        Number.isInteger(score) &&
        score >= 1 &&
        score <= 20,
    );
    const normalizedAttributes = Object.fromEntries(
      CORE_ATTRIBUTE_KEYS.map((key, index) => {
        const legacyKey = LEGACY_ATTRIBUTE_NAMES[index];
        const supplied = isObject(attributes[key])
          ? attributes[key]
          : isObject(standard[legacyKey])
            ? standard[legacyKey]
            : {};
        const rawScore = supplied.score;
        const score =
          typeof rawScore === "number" && Number.isInteger(rawScore)
            ? usesTwentyPointScale
              ? rawScore * 5
              : rawScore
            : 50;
        if (!isAttributeScore(score)) {
          throw new BadGatewayException(
            `The AI response included an invalid ${legacyKey} score; attribute scores must be integers from 0 through 100.`,
          );
        }
        return [
          key,
          {
            ...supplied,
            score,
            modifier:
              typeof supplied.modifier === "number" ? supplied.modifier : 0,
            savingThrow:
              typeof supplied.savingThrow === "number"
                ? supplied.savingThrow
                : 0,
            proficientInSave: supplied.proficientInSave === true,
          },
        ];
      }),
    );
    const normalized: Record<string, unknown> = {
      ...generated,
      identity: {
        id: randomUUID(),
        version: { revision: 1, updatedAt: now },
      },
      entityId: randomUUID(),
      worldId,
      name: generated.name.trim(),
      images: isObject(generated.images) ? generated.images : {},
      controllerIds: Array.isArray(generated.controllerIds)
        ? generated.controllerIds
        : [],
      size: typeof generated.size === "string" ? generated.size : "medium",
      classification,
      attributes: normalizedAttributes,
      skills: Array.isArray(generated.skills) ? generated.skills : [],
      proficiencies: Array.isArray(generated.proficiencies)
        ? generated.proficiencies
        : [],
      proficiencyBonus:
        typeof generated.proficiencyBonus === "number"
          ? generated.proficiencyBonus
          : 0,
      defenseRating: { contributions: [] },
      initiativeBonus:
        typeof generated.initiativeBonus === "number"
          ? generated.initiativeBonus
          : 0,
      hitPoints: isObject(generated.hitPoints)
        ? generated.hitPoints
        : { current: 1, maximum: 1, temporary: 0 },
      speeds: Array.isArray(generated.speeds) ? generated.speeds : [],
      senses,
      languages: Array.isArray(generated.languages) ? generated.languages : [],
      communicationCapabilities: Array.isArray(
        generated.communicationCapabilities,
      )
        ? generated.communicationCapabilities
        : [],
      inventory: { itemIds: [], currencies: [], attunementLimit: 0 },
      equipment: { slots: {}, containers: [] },
      actions: Array.isArray(generated.actions) ? generated.actions : [],
      activeEffects: Array.isArray(generated.activeEffects)
        ? generated.activeEffects
        : [],
      conditions,
      resources: isObject(generated.resources) ? generated.resources : {},
      damageAdjustments,
    };
    delete normalized.armorClass;
    delete normalized.creatureType;
    delete normalized.telepathy;
    return normalized;
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
      // Keep the gateway error stable and avoid leaking model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid creature JSON object.",
    );
  }
}
