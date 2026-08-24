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
export class LocationGenerationService {
  private readonly logger = new Logger(LocationGenerationService.name);

  constructor(
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
    private readonly maps: GeneratedMapService,
    private readonly media: MediaService,
    private readonly domain: DomainService,
  ) {}

  async create(parentId: string, userContext: string) {
    const parent = await this.domain.get("locations", parentId);
    if (!isObject(parent.data)) {
      throw new BadGatewayException(
        `Parent location '${parentId}' does not contain an object aggregate.`,
      );
    }
    const [template, domainModel] = await Promise.all([
      this.prompts.read("create-location.md", "CREATE_LOCATION_PROMPT_PATH"),
      this.prompts.read("domain-model.md", "CREATE_LOCATION_PROMPT_PATH"),
    ]);
    const combinedPrompt = [
      template.trim(),
      "",
      "## Referenced domain model",
      domainModel.trim(),
      "",
      "## Parent location record",
      "The generated location must be a direct child of this authoritative parent record:",
      JSON.stringify(parent, null, 2),
      "",
      "## User-provided context",
      userContext.trim(),
      "",
      "Return exactly one complete LocationState JSON object. Do not include Markdown or commentary.",
    ].join("\n");
    const result = await this.openAi.respond({ input: combinedPrompt });
    let data: Record<string, unknown>;
    try {
      data = this.normalizeChild(this.parseObject(result.output), parentId);
    } catch (error) {
      logInvalidAiOutput(
        this.logger,
        "create-location",
        result.responseId,
        result.output,
      );
      throw error;
    }
    const mapped = await this.maps.generate(data, [
      "ai-generated",
      "location-map",
      `parent:${parentId}`,
    ]);
    try {
      const location = await this.domain.create("locations", mapped.data);
      return {
        location,
        ...result,
        imageResponseId: mapped.imageResponseId,
        combinedPrompt,
      };
    } catch (error) {
      await this.media.remove(mapped.asset.id).catch(() => undefined);
      throw error;
    }
  }

  async generateMap(locationId: string, additionalContext?: string) {
    const record = await this.domain.get("locations", locationId);
    if (!isObject(record.data)) {
      throw new BadGatewayException(
        `Location '${locationId}' does not contain an object aggregate.`,
      );
    }
    const mapped = await this.maps.generate(
      record.data,
      ["ai-generated", "location-map", `location:${locationId}`],
      additionalContext,
    );
    const previousImage = isObject(record.data.image) ? record.data.image : {};
    const previousAssetId =
      typeof previousImage.assetId === "string"
        ? previousImage.assetId
        : undefined;
    try {
      const location = await this.domain.replace("locations", locationId, {
        data: mapped.data,
        expectedRevision: record.revision,
      });
      if (previousAssetId && previousAssetId !== mapped.asset.id) {
        const previousAsset = await this.media
          .get(previousAssetId)
          .catch(() => undefined);
        if (previousAsset?.tags.includes("ai-generated")) {
          await this.media.remove(previousAssetId).catch(() => undefined);
        }
      }
      return {
        location,
        imageResponseId: mapped.imageResponseId,
        prompt: additionalContext ?? "",
      };
    } catch (error) {
      await this.media.remove(mapped.asset.id).catch(() => undefined);
      throw error;
    }
  }

  private normalizeChild(
    generated: Record<string, unknown>,
    parentId: string,
  ): Record<string, unknown> {
    if (typeof generated.name !== "string" || !generated.name.trim()) {
      throw new BadGatewayException(
        "The AI response did not include a location name.",
      );
    }
    const now = new Date().toISOString();
    const placement = isObject(generated.placement) ? generated.placement : {};
    const border = isObject(placement.border)
      ? placement.border
      : this.unplacedBorder();
    const profile = isObject(generated.profile) ? generated.profile : {};
    const terrain = isObject(profile.terrain) ? profile.terrain : {};
    const culture = isObject(profile.culture) ? profile.culture : {};
    const politics = isObject(profile.politics) ? profile.politics : {};
    const kind =
      typeof generated.kind === "string" && generated.kind !== "world"
        ? generated.kind
        : "region";
    const physicalEnvironment = isObject(generated.physicalEnvironment)
      ? generated.physicalEnvironment
      : {};
    if (
      kind === "plane" &&
      (typeof physicalEnvironment.kind !== "string" ||
        typeof physicalEnvironment.understanding !== "string" ||
        !Array.isArray(physicalEnvironment.observedProperties) ||
        physicalEnvironment.observedProperties.length === 0 ||
        physicalEnvironment.observedProperties.some(
          (value) => typeof value !== "string" || !value.trim(),
        ))
    ) {
      throw new BadGatewayException(
        "A generated plane requires a physical environment with observed properties.",
      );
    }
    return {
      ...generated,
      identity: {
        id: randomUUID(),
        version: { revision: 1, updatedAt: now },
      },
      name: generated.name.trim(),
      kind,
      placement: { kind: "within-parent", parentLocationId: parentId, border },
      image: isObject(generated.image) ? generated.image : {},
      profile: {
        ...profile,
        terrain: {
          ...terrain,
          aspect: this.normalizeAspect(terrain.aspect),
          terrainTypes: Array.isArray(terrain.terrainTypes)
            ? terrain.terrainTypes
            : [],
        },
        culture: {
          ...culture,
          aspect: this.normalizeAspect(culture.aspect),
          cultures: Array.isArray(culture.cultures) ? culture.cultures : [],
          heritageCandidateIds: Array.isArray(culture.heritageCandidateIds)
            ? culture.heritageCandidateIds
            : [],
          languages: Array.isArray(culture.languages) ? culture.languages : [],
        },
        politics: {
          ...politics,
          aspect: this.normalizeAspect(politics.aspect),
          influences: Array.isArray(politics.influences)
            ? politics.influences
            : [],
        },
      },
      sceneIds: Array.isArray(generated.sceneIds) ? generated.sceneIds : [],
    };
  }

  private unplacedBorder() {
    return {
      coordinateSpace: { kind: "custom", key: "aow:unplaced" },
      geometry: {
        kind: "polygon",
        polygon: {
          exterior: [
            {
              kind: "custom",
              coordinateSystem: "aow:unplaced",
              value: { x: 0, y: 0 },
            },
            {
              kind: "custom",
              coordinateSystem: "aow:unplaced",
              value: { x: 1, y: 0 },
            },
            {
              kind: "custom",
              coordinateSystem: "aow:unplaced",
              value: { x: 0, y: 1 },
            },
          ],
        },
      },
    };
  }

  private normalizeAspect(value: unknown) {
    const aspect = isObject(value) ? value : {};
    return {
      ...aspect,
      tags: Array.isArray(aspect.tags) ? aspect.tags : [],
      traitIds: Array.isArray(aspect.traitIds) ? aspect.traitIds : [],
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
      // Use a stable response and avoid leaking a potentially large model output.
    }
    throw new BadGatewayException(
      "The AI response was not a valid location JSON object.",
    );
  }
}
