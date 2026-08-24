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

@Injectable()
export class ItemGenerationService {
  private readonly logger = new Logger(ItemGenerationService.name);

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
        `Location '${worldId}' is not a root world and cannot own item definitions`,
      );
    }
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-item.md", "CREATE_ITEM_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_ITEM_PROMPT_PATH"),
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
      "## User-provided context",
      userContext.trim(),
      "",
      "Return exactly one complete ItemDefinition JSON object. Do not include Markdown or commentary.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let data: Record<string, unknown>;
    try {
      data = this.normalize(this.parseObject(result.output), worldId);
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-item",
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

  async regenerateImage(worldId: string, definitionId: string) {
    const [world, definition] = await Promise.all([
      this.domain.get("locations", worldId),
      this.domain.get("definitions", definitionId),
    ]);
    if (world.kind !== "world" || !isObject(world.data)) {
      throw new BadRequestException(
        `Location '${worldId}' is not a root world and cannot own item definitions`,
      );
    }
    if (!isObject(definition.data)) {
      throw new BadRequestException("The item definition is invalid.");
    }
    const extensions = isObject(definition.data.extensions)
      ? definition.data.extensions
      : {};
    if (definition.kind !== "item" || extensions["aow:worldId"] !== worldId) {
      throw new BadRequestException(
        "The item definition does not belong to the selected world.",
      );
    }

    const previousImage = isObject(definition.data.image)
      ? definition.data.image
      : {};
    const previousAssetId =
      typeof previousImage.assetId === "string"
        ? previousImage.assetId
        : undefined;
    const rendered = await this.images.generate(definition.data, worldId);
    try {
      const updated = await this.domain.replace("definitions", definitionId, {
        data: rendered.data,
        expectedRevision: definition.revision,
      });
      if (previousAssetId && previousAssetId !== rendered.asset.id) {
        await this.media.remove(previousAssetId).catch(() => undefined);
      }
      return {
        definition: updated,
        imageResponseId: rendered.responseId,
        imagePrompt: rendered.prompt,
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
        "The AI response did not include an item name.",
      );
    }
    const components = isObject(generated.components)
      ? generated.components
      : {};
    if (
      typeof components.category !== "string" ||
      !components.category.trim()
    ) {
      throw new BadGatewayException(
        "The AI response did not include an item category.",
      );
    }
    if (components.category === "armor") {
      const armor = isObject(components.armor) ? components.armor : {};
      const defenseDice = isObject(armor.defenseDice) ? armor.defenseDice : {};
      if (!Array.isArray(defenseDice.terms) || defenseDice.terms.length === 0) {
        throw new BadGatewayException(
          "Generated armor must include at least one defense die.",
        );
      }
    }
    assertScientificItemClassification(components);
    const id = randomUUID();
    const quality = ITEM_QUALITIES.includes(components.quality as ItemQuality)
      ? components.quality
      : "standard";
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
        key: `aow:${slug || "item"}-${id.slice(0, 8)}`,
        name,
        source: {
          namespace: "aow",
          edition: "homebrew:age-of-wonders",
          license: "private",
        },
      },
      kind: "item",
      components: { ...components, quality },
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
      // Return a stable gateway error without exposing model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid item definition JSON object.",
    );
  }
}
