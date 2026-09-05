import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { GenerateContentDto } from "./dto/generate-content.dto";
import { CreateWorldDto } from "./dto/create-world.dto";
import { CreateLocationDto } from "./dto/create-location.dto";
import { GenerateMapDto } from "./dto/generate-map.dto";
import { RunPipelineDto } from "./dto/run-pipeline.dto";
import { OpenAiService } from "./openai.service";
import { ContentPipeline } from "./pipelines/content.pipeline";
import { WorldGenerationService } from "./world-generation.service";
import { LocationGenerationService } from "./location-generation.service";
import { CreatureGenerationService } from "./creature-generation.service";
import { CreateCreatureDto } from "./dto/create-creature.dto";
import { ArmorGenerationService } from "./armor-generation.service";
import { CreateArmorSetDto } from "./dto/create-armor-set.dto";
import { CreateItemDto } from "./dto/create-item.dto";
import { ItemGenerationService } from "./item-generation.service";
import { WeaponGenerationService } from "./weapon-generation.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { GmGuard } from "../auth/auth.guard";

@ApiTags("ai")
@Controller("ai")
@UseGuards(GmGuard)
export class AiController {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly contentPipeline: ContentPipeline,
    private readonly worldGeneration: WorldGenerationService,
    private readonly locationGeneration: LocationGenerationService,
    private readonly creatureGeneration: CreatureGenerationService,
    private readonly armorGeneration: ArmorGenerationService,
    private readonly itemGeneration: ItemGenerationService,
    private readonly weaponGeneration: WeaponGenerationService,
    private readonly campaignGeneration: CampaignGenerationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("worlds/:worldId/campaigns")
  @ApiOperation({
    summary:
      "Create a campaign foundation using create-campaign.md and world context",
  })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  async createCampaign(
    @Param("worldId") worldId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    const result = await this.campaignGeneration.create(worldId, dto.prompt);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-campaign",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      campaign: result.campaign,
      output: result.output,
      responseId: result.responseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds/:worldId/weapons")
  @ApiOperation({
    summary:
      "Create a world-scoped weapon definition using create-weapon.md and world context",
  })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  async createWeapon(
    @Param("worldId") worldId: string,
    @Body() dto: CreateItemDto,
  ) {
    const result = await this.weaponGeneration.create(worldId, dto.prompt);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-weapon",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      definition: result.definition,
      output: result.output,
      responseId: result.responseId,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds/:worldId/items")
  @ApiOperation({
    summary:
      "Create a world-scoped item definition using create-item.md and world context",
  })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  async createItem(
    @Param("worldId") worldId: string,
    @Body() dto: CreateItemDto,
  ) {
    const result = await this.itemGeneration.create(worldId, dto.prompt);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-item",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      definition: result.definition,
      output: result.output,
      responseId: result.responseId,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds/:worldId/items/:itemId/image")
  @ApiOperation({ summary: "Regenerate and replace an item's inventory image" })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  @ApiParam({ name: "itemId", description: "ItemDefinition ID" })
  async generateItemImage(
    @Param("worldId") worldId: string,
    @Param("itemId") itemId: string,
  ) {
    const result = await this.itemGeneration.regenerateImage(worldId, itemId);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "generate-item-image",
        prompt: result.imagePrompt,
        output: JSON.stringify(result.definition.data),
        model: this.openAi.model,
        responseId: result.imageResponseId,
      },
    });
    return {
      definition: result.definition,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds/:worldId/creatures/:creatureId/armor-set")
  @ApiOperation({
    summary:
      "Generate, inventory, and equip one armor item for each creature armor slot",
  })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  @ApiParam({ name: "creatureId", description: "CreatureState ID" })
  async createArmorSet(
    @Param("worldId") worldId: string,
    @Param("creatureId") creatureId: string,
    @Body() dto: CreateArmorSetDto,
  ) {
    const result = await this.armorGeneration.createSet(
      worldId,
      creatureId,
      dto.prompt,
    );
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-armor-set",
        prompt: result.combinedPrompts
          .map(({ slot, combinedPrompt }) => `## ${slot}\n${combinedPrompt}`)
          .join("\n\n"),
        output: JSON.stringify(result.generations),
        model: this.openAi.model,
        responseId: result.generations.at(-1)?.responseId,
      },
    });
    return {
      creature: result.creature,
      definitions: result.definitions,
      items: result.items,
      generations: result.generations,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds/:worldId/creatures")
  @ApiOperation({
    summary:
      "Create a creature using create-creature.md, user input, and its world record",
  })
  @ApiParam({ name: "worldId", description: "Root LocationState ID" })
  async createCreature(
    @Param("worldId") worldId: string,
    @Body() dto: CreateCreatureDto,
  ) {
    const result = await this.creatureGeneration.create(worldId, dto.prompt);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-creature",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      creature: result.creature,
      output: result.output,
      responseId: result.responseId,
      imageResponseIds: result.imageResponseIds,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("worlds")
  @ApiOperation({
    summary: "Create a world using prompts/create-world.md and user input",
  })
  async createWorld(@Body() dto: CreateWorldDto) {
    const result = await this.worldGeneration.create(dto.prompt);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-world",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      world: result.world,
      output: result.output,
      responseId: result.responseId,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("locations/:parentId")
  @ApiOperation({
    summary:
      "Create a child location using create-location.md, user input, and its parent record",
  })
  @ApiParam({ name: "parentId", description: "Parent LocationState ID" })
  async createLocation(
    @Param("parentId") parentId: string,
    @Body() dto: CreateLocationDto,
  ) {
    const result = await this.locationGeneration.create(
      parentId,
      dto.prompt,
      dto.mapX !== undefined && dto.mapY !== undefined
        ? { kind: "normalized-map", x: dto.mapX, y: dto.mapY }
        : undefined,
    );
    const generation = await this.prisma.generation.create({
      data: {
        kind: "create-location",
        prompt: result.combinedPrompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return {
      location: result.location,
      output: result.output,
      responseId: result.responseId,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("locations/:locationId/map")
  @ApiOperation({ summary: "Generate, store, and attach a map to a location" })
  @ApiParam({ name: "locationId", description: "LocationState ID" })
  async generateLocationMap(
    @Param("locationId") locationId: string,
    @Body() dto: GenerateMapDto,
  ) {
    const result = await this.locationGeneration.generateMap(
      locationId,
      dto.prompt,
    );
    const generation = await this.prisma.generation.create({
      data: {
        kind: "location-map",
        prompt: result.prompt,
        output: JSON.stringify({
          locationId,
          imageResponseId: result.imageResponseId,
        }),
        model: this.openAi.model,
        responseId: result.imageResponseId,
      },
    });
    return {
      location: result.location,
      imageResponseId: result.imageResponseId,
      generationId: generation.id,
      model: this.openAi.model,
    };
  }

  @Post("generate")
  @ApiOperation({ summary: "Generate content with the OpenAI Responses API" })
  async generate(@Body() dto: GenerateContentDto) {
    const result = await this.openAi.respond({
      input: dto.prompt,
      instructions: dto.instructions,
    });
    const generation = await this.prisma.generation.create({
      data: {
        kind: "single",
        prompt: dto.prompt,
        output: result.output,
        model: this.openAi.model,
        responseId: result.responseId,
      },
    });
    return { ...result, generationId: generation.id, model: this.openAi.model };
  }

  @Post("pipelines/content")
  @ApiOperation({
    summary: "Run a multi-stage outline, draft, and review pipeline",
  })
  async runContentPipeline(@Body() dto: RunPipelineDto) {
    const result = await this.contentPipeline.run(dto.topic, dto.audience);
    const generation = await this.prisma.generation.create({
      data: {
        kind: "content-pipeline",
        prompt: dto.topic,
        output: result.output,
        model: this.openAi.model,
        responseId: result.stages.at(-1)?.responseId,
      },
    });
    return { ...result, generationId: generation.id, model: this.openAi.model };
  }

  @Get("generations")
  @ApiOperation({ summary: "List recent generated content" })
  listGenerations() {
    return this.prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
}
