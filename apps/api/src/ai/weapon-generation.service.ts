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
import { logInvalidAiOutput } from "./ai-failure-logging";
import { AiPromptService } from "./ai-prompt.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { OpenAiService } from "./openai.service";
import { assertScientificItemClassification } from "./scientific-item-validation";

@Injectable()
export class WeaponGenerationService {
  private readonly logger = new Logger(WeaponGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly images: GeneratedItemImageService,
    private readonly media: MediaService,
    private readonly domain: DomainService,
  ) {}

  async create(worldId: string, userContext: string) {
    const world = await this.domain.get("locations", worldId);
    if (world.kind !== "world" || !isObject(world.data)) {
      throw new BadRequestException(
        `Location '${worldId}' is not a root world and cannot own weapon definitions`,
      );
    }
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-weapon.md", "CREATE_WEAPON_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_WEAPON_PROMPT_PATH"),
    ]);
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Authoritative world record",
      JSON.stringify(world, null, 2),
      "",
      "## Authoritative weapon concept",
      userContext.trim(),
      "",
      "Return exactly one complete weapon ItemDefinition JSON object. Do not include Markdown or commentary.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let data: Record<string, unknown>;
    try {
      data = this.normalize(this.parseObject(result.output), worldId);
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-weapon",
        result.responseId,
        result.output,
      );
      throw error;
    }
    const rendered = await this.images.generate(data, worldId);
    try {
      const definition = await this.domain.create("definitions", rendered.data);
      return {
        definition,
        ...result,
        imageResponseId: rendered.responseId,
        combinedPrompt,
      };
    } catch (error) {
      await this.media.remove(rendered.asset.id).catch(() => undefined);
      throw error;
    }
  }

  private normalize(generated: Record<string, unknown>, worldId: string) {
    const identity = isObject(generated.identity) ? generated.identity : {};
    const name =
      typeof identity.name === "string" && identity.name.trim()
        ? identity.name.trim()
        : undefined;
    if (!name) {
      throw new BadGatewayException(
        "The AI response did not include a weapon name.",
      );
    }
    const components = isObject(generated.components)
      ? generated.components
      : {};
    const weapon = isObject(components.weapon) ? components.weapon : {};
    if (weapon.hitDice !== undefined) {
      const hitDice = isObject(weapon.hitDice) ? weapon.hitDice : {};
      if (!Array.isArray(hitDice.terms) || hitDice.terms.length === 0) {
        throw new BadGatewayException(
          "Weapon hit dice must be omitted or contain at least one die.",
        );
      }
    }
    const range = isObject(weapon.range) ? weapon.range : {};
    if (
      (range.kind !== "melee" && range.kind !== "ranged") ||
      !isObject(range.minimum) ||
      !isObject(range.maximum)
    ) {
      throw new BadGatewayException(
        "The AI response did not include a valid weapon range.",
      );
    }
    const damage = Array.isArray(weapon.damage) ? weapon.damage : [];
    if (
      !damage.length ||
      damage.some((value) => {
        const component = isObject(value) ? value : {};
        const expression = isObject(component.damage) ? component.damage : {};
        return (
          typeof component.damageType !== "string" ||
          !Array.isArray(expression.terms) ||
          expression.terms.length === 0
        );
      })
    ) {
      throw new BadGatewayException(
        "The AI response did not include valid weapon damage components.",
      );
    }
    const wieldingModes = Array.isArray(weapon.wieldingModes)
      ? weapon.wieldingModes
      : [];
    const normalizedModes = wieldingModes.filter((value) => {
      const mode = isObject(value) ? value : {};
      return (
        (mode.kind === "one-handed" ||
          mode.kind === "two-handed" ||
          mode.kind === "dual-wield") &&
        (mode.handsRequired === 1 || mode.handsRequired === 2)
      );
    });
    if (
      !normalizedModes.length ||
      normalizedModes.length !== wieldingModes.length
    ) {
      throw new BadGatewayException(
        "The AI response did not include valid weapon wielding modes.",
      );
    }
    assertScientificItemClassification(components);
    const supportsOneHand = normalizedModes.some(
      (value) => isObject(value) && value.kind === "one-handed",
    );
    const supportsTwoHands = normalizedModes.some(
      (value) => isObject(value) && value.kind === "two-handed",
    );
    if (
      normalizedModes.some(
        (value) => isObject(value) && value.kind === "dual-wield",
      ) &&
      !supportsOneHand
    ) {
      throw new BadGatewayException(
        "A dual-wield mode requires a one-handed wielding mode.",
      );
    }
    const compatibleSlotSets = [
      ...(supportsOneHand ? [["main-hand"], ["off-hand"]] : []),
      ...(supportsTwoHands ? [["main-hand", "off-hand"]] : []),
    ];
    const quality = ITEM_QUALITIES.includes(components.quality as ItemQuality)
      ? components.quality
      : "standard";
    const id = randomUUID();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 56);
    return {
      ...generated,
      identity: {
        ...identity,
        id,
        key: `aow:${slug || "weapon"}-${id.slice(0, 8)}`,
        name,
        source: {
          namespace: "aow",
          edition: "homebrew:age-of-wonders",
          license: "private",
        },
        tags: Array.from(
          new Set([
            "weapon",
            range.kind,
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
        category: "weapon",
        quality,
        equippable: { compatibleSlotSets },
        weapon: { ...weapon, range, damage, wieldingModes: normalizedModes },
      },
      extensions: {
        ...(isObject(generated.extensions) ? generated.extensions : {}),
        "aow:worldId": worldId,
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
      // Keep the gateway response stable; diagnostics are emitted by create().
    }
    throw new BadGatewayException(
      "The AI response was not a valid weapon definition JSON object.",
    );
  }
}
