import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { logInvalidAiOutput } from "./ai-failure-logging";
import { GeneratedMapService } from "./generated-map.service";
import { OpenAiService } from "./openai.service";

@Injectable()
export class WorldGenerationService {
  private readonly logger = new Logger(WorldGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly maps: GeneratedMapService,
    private readonly media: MediaService,
    private readonly domain: DomainService,
  ) {}

  async create(prompt: string) {
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-world.md", "CREATE_WORLD_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_WORLD_PROMPT_PATH"),
    ]);
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## User's world concept",
      prompt.trim(),
      "",
      "Return one JSON object. Include at least a non-empty name and a two-sentence description.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let generated: Record<string, unknown>;
    try {
      generated = this.parseObject(result.output);
      if (typeof generated.name !== "string" || !generated.name.trim()) {
        throw new BadGatewayException(
          "The AI response did not include a world name.",
        );
      }
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-world",
        result.responseId,
        result.output.length,
      );
      throw error;
    }
    const now = new Date().toISOString();

    const data = {
      ...generated,
      identity: {
        id: randomUUID(),
        version: { revision: 1, updatedAt: now },
      },
      name: generated.name.trim(),
      kind: "world",
      placement: { kind: "root" },
    };
    const mapped = await this.maps.generate(data, [
      "ai-generated",
      "world-map",
      `world:${stringAtIdentity(data)}`,
    ]);
    try {
      const world = await this.domain.create("locations", mapped.data);
      return {
        world,
        ...result,
        imageResponseId: mapped.imageResponseId,
        combinedPrompt,
      };
    } catch (error) {
      await this.media.remove(mapped.asset.id).catch(() => undefined);
      throw error;
    }
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
      // The error below provides a stable API response without exposing output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid world JSON object.",
    );
  }
}

function stringAtIdentity(data: Record<string, unknown>): string {
  const identity = isObject(data.identity) ? data.identity : {};
  return typeof identity.id === "string" ? identity.id : "unknown";
}
