import { CodexRevisionDto } from "./world-codex.controller";
import {
  SaveLocationTerrainDto,
  UploadTerrainChunkDto,
} from "./dto/location-terrain.dto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { WorldAccessGuard } from "./world-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  CreateWorldDraftDto,
  ExpectedDraftRevisionDto,
  ExpectedWorldMetadataRevisionDto,
  ForkWorldDefinitionDto,
  SaveWorldDraftDto,
  StartWorldDraftDto,
  UpsertWorldCreatureDraftDto,
  UpsertWorldItemDraftDto,
  UpsertWorldLocationDraftDto,
} from "./dto/world-definition-authoring.dto";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { WorldDefinitionsService } from "./world-definitions.service";
import { ModelRegistryService } from "../model-registry/model-registry.service";

interface DraftRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly payload: unknown;
}

@ApiTags("worlds")
@Controller("worlds")
@UseGuards(WorldAccessGuard)
export class WorldAuthoringController {
  constructor(
    @Inject(WorldDefinitionsService)
    private readonly worlds: Pick<WorldDefinitionsService, "list" | "get">,
    private readonly authoring: WorldDefinitionAuthoringService,
    private readonly modelRegistries: ModelRegistryService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List World lineages" })
  async list(
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const result = await this.worlds.list(request.user!.id);
    return {
      ...result,
      items: result.items.slice(page.offset, page.offset + page.limit),
      limit: page.limit,
      offset: page.offset,
    };
  }

  @Post()
  @ApiOperation({ summary: "Create a World lineage and mutable draft" })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateWorldDraftDto,
  ) {
    return this.authoring.create(dto, request.user!.id);
  }

  @Get(":worldId")
  get(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.worlds.get(worldId, request.user!.id);
  }

  @Get(":worldId/revisions")
  async revisions(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const world = await this.worlds.get(worldId, request.user!.id);
    return {
      items: world.revisions.slice(page.offset, page.offset + page.limit),
      total: world.revisions.length,
      limit: page.limit,
      offset: page.offset,
    };
  }

  @Get(":worldId/revisions/:revisionId")
  async revision(
    @Param("worldId") worldId: string,
    @Param("revisionId") revisionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    const world = await this.worlds.get(worldId, request.user!.id);
    const revision = world.revisions.find(
      (candidate) => candidate.id === revisionId,
    );
    if (!revision) throw worldChildNotFound("revision");
    return revision;
  }

  @Get(":worldId/draft")
  getDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.getDraft(worldId, request.user!.id);
  }

  @Get(":worldId/draft/export")
  exportDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.exportDraft(worldId, request.user!.id);
  }

  @Post(":worldId/draft")
  @HttpCode(HttpStatus.OK)
  startDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: StartWorldDraftDto,
  ) {
    return this.authoring.startDraft(worldId, dto, request.user!.id);
  }

  @Put(":worldId/draft")
  saveDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: SaveWorldDraftDto,
  ) {
    return this.authoring.save(worldId, dto, request.user!.id);
  }

  @Post(":worldId/draft/validate")
  @HttpCode(HttpStatus.OK)
  validateDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedDraftRevisionDto,
  ) {
    return this.authoring.validate(worldId, dto, request.user!.id);
  }

  @Post(":worldId/draft/publish")
  @HttpCode(HttpStatus.OK)
  publishDraft(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedDraftRevisionDto,
  ) {
    return this.authoring.publish(worldId, dto, request.user!.id);
  }

  @Get(":worldId/draft/impact")
  impact(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.impact(worldId, request.user!.id);
  }

  @Post(":worldId/archive")
  @HttpCode(HttpStatus.OK)
  archive(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedWorldMetadataRevisionDto,
  ) {
    return this.authoring.archive(worldId, dto, request.user!.id);
  }

  @Post(":worldId/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedWorldMetadataRevisionDto,
  ) {
    return this.authoring.restore(worldId, dto, request.user!.id);
  }

  @Post(":worldId/forks")
  fork(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ForkWorldDefinitionDto,
  ) {
    return this.authoring.fork(worldId, dto, request.user!.id);
  }

  @Get(":worldId/atlas/locations")
  locations(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.library(worldId, request.user!.id, "locations", limit, offset);
  }

  @Post(":worldId/atlas/locations")
  createLocation(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldLocationDraftDto,
  ) {
    return this.authoring.createLocation(worldId, dto, request.user!.id);
  }

  @Get(":worldId/atlas/locations/:locationId")
  location(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.libraryRecord(
      worldId,
      request.user!.id,
      "locations",
      locationId,
    );
  }

  @Put(":worldId/atlas/locations/:locationId")
  updateLocation(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldLocationDraftDto,
  ) {
    return this.authoring.updateLocation(
      worldId,
      locationId,
      dto,
      request.user!.id,
    );
  }

  @Post(":worldId/atlas/locations/:locationId/map/chunks")
  uploadTerrainChunk(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UploadTerrainChunkDto,
  ) {
    return this.authoring.uploadTerrainChunk(
      worldId,
      locationId,
      dto,
      request.user!.id,
    );
  }

  @Get(":worldId/atlas/locations/:locationId/map/chunks/:contentHash")
  terrainChunk(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Param("contentHash") contentHash: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.getTerrainChunk(
      worldId,
      locationId,
      contentHash,
      request.user!.id,
    );
  }

  @Get(":worldId/atlas/locations/:locationId/map")
  getTerrain(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.getLocationTerrain(
      worldId,
      locationId,
      request.user!.id,
    );
  }

  @Put(":worldId/atlas/locations/:locationId/map")
  saveTerrain(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: SaveLocationTerrainDto,
  ) {
    return this.authoring.saveLocationTerrain(
      worldId,
      locationId,
      dto,
      request.user!.id,
    );
  }

  @Get(":worldId/bestiary/creatures")
  creatures(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.library(worldId, request.user!.id, "creatures", limit, offset);
  }

  @Post(":worldId/bestiary/creatures")
  createCreature(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldCreatureDraftDto,
  ) {
    return this.authoring.createCreature(worldId, dto, request.user!.id);
  }

  @Get(":worldId/bestiary/creatures/:creatureId")
  creature(
    @Param("worldId") worldId: string,
    @Param("creatureId") creatureId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.libraryRecord(
      worldId,
      request.user!.id,
      "creatures",
      creatureId,
    );
  }

  @Put(":worldId/bestiary/creatures/:creatureId")
  updateCreature(
    @Param("worldId") worldId: string,
    @Param("creatureId") creatureId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldCreatureDraftDto,
  ) {
    return this.authoring.updateCreature(
      worldId,
      creatureId,
      dto,
      request.user!.id,
    );
  }

  @Post(":worldId/bestiary/creatures/:creatureId/upgrade")
  @HttpCode(HttpStatus.OK)
  upgradeLegacyCreature(
    @Param("worldId") worldId: string,
    @Param("creatureId") creatureId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldCreatureDraftDto,
  ) {
    return this.authoring.upgradeLegacyCreature(
      worldId,
      creatureId,
      dto,
      request.user!.id,
    );
  }

  @Get(":worldId/item-compendium/items")
  items(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.library(worldId, request.user!.id, "items", limit, offset);
  }

  @Post(":worldId/item-compendium/items")
  createItem(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldItemDraftDto,
  ) {
    return this.authoring.createItem(worldId, dto, request.user!.id);
  }

  @Get(":worldId/item-compendium/items/:itemId")
  item(
    @Param("worldId") worldId: string,
    @Param("itemId") itemId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.libraryRecord(worldId, request.user!.id, "items", itemId);
  }

  @Put(":worldId/item-compendium/items/:itemId")
  updateItem(
    @Param("worldId") worldId: string,
    @Param("itemId") itemId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpsertWorldItemDraftDto,
  ) {
    return this.authoring.updateItem(worldId, itemId, dto, request.user!.id);
  }

  @Delete(":worldId/atlas/locations/:id")
  deleteLocations(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      "locations",
      id,
      dto,
    );
  }

  @Delete(":worldId/bestiary/creatures/:id")
  deleteCreature(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      "creature",
      id,
      dto,
    );
  }

  @Delete(":worldId/item-compendium/items/:id")
  deleteItem(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      "item",
      id,
      dto,
    );
  }

  @Delete(":worldId/bestiary/catalog-monsters/:id")
  deleteCatalogMonster(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      "monster",
      id,
      dto,
    );
  }

  @Delete(":worldId/characters/catalog-characters/:id")
  deleteCatalogCharacter(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      "character-template",
      id,
      dto,
    );
  }

  @Delete(":worldId/characters/:definitionKind/:definitionId")
  deleteCharacterOption(
    @Param("worldId") worldId: string,
    @Param("definitionKind") definitionKind: string,
    @Param("definitionId") definitionId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    const kinds = {
      skills: "skill",
      professions: "profession",
      backgrounds: "background",
    } as const;
    if (!Object.hasOwn(kinds, definitionKind))
      throw worldChildNotFound("Character option");
    return this.authoring.deleteAuthoredRecord(
      worldId,
      request.user!.id,
      kinds[definitionKind as keyof typeof kinds],
      definitionId,
      dto,
    );
  }

  @Get(":worldId/character-model/:definitionKind")
  async characterModel(
    @Param("worldId") worldId: string,
    @Param("definitionKind") definitionKind: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const draft = await this.authoring.getDraft(worldId, request.user!.id);
    const items = recordsOf(draft.records).filter(
      (record) =>
        record.resourceType === "definitions" &&
        definitionKindOf(record) === definitionKind,
    );
    return {
      items: items.slice(page.offset, page.offset + page.limit),
      total: items.length,
      limit: page.limit,
      offset: page.offset,
    };
  }

  @Get(":worldId/model-adoptions")
  modelAdoptions(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.modelRegistries.effective(worldId, request.user!.id);
  }

  @Get(":worldId/character-model/:definitionKind/:definitionId")
  async characterModelDefinition(
    @Param("worldId") worldId: string,
    @Param("definitionKind") definitionKind: string,
    @Param("definitionId") definitionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    const draft = await this.authoring.getDraft(worldId, request.user!.id);
    const record = recordsOf(draft.records).find(
      (candidate) =>
        candidate.resourceType === "definitions" &&
        candidate.sourceId === definitionId &&
        definitionKindOf(candidate) === definitionKind,
    );
    if (!record) throw worldChildNotFound("Character model definition");
    return record;
  }

  private async library(
    worldId: string,
    userId: string,
    library: "locations" | "creatures" | "items",
    limit?: string,
    offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const draft = await this.authoring.getDraft(worldId, userId);
    const items = recordsOf(draft.records).filter((record) =>
      inLibrary(record, library),
    );
    return {
      items: items.slice(page.offset, page.offset + page.limit),
      total: items.length,
      limit: page.limit,
      offset: page.offset,
    };
  }

  private async libraryRecord(
    worldId: string,
    userId: string,
    library: "locations" | "creatures" | "items",
    id: string,
  ) {
    const draft = await this.authoring.getDraft(worldId, userId);
    const record = recordsOf(draft.records).find(
      (candidate) => inLibrary(candidate, library) && candidate.sourceId === id,
    );
    if (!record) throw worldChildNotFound(library.slice(0, -1));
    return record;
  }
}

function inLibrary(
  record: DraftRecord,
  library: "locations" | "creatures" | "items",
): boolean {
  if (library === "locations") return record.resourceType === "locations";
  if (library === "creatures" && record.resourceType === "creatures")
    return true;
  if (record.resourceType !== "definitions") return false;
  return (
    definitionKindOf(record) === (library === "creatures" ? "creature" : "item")
  );
}

function definitionKindOf(record: DraftRecord): string | undefined {
  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return undefined;
  const object = payload as Record<string, unknown>;
  const kind = object.kind ?? object.definitionType;
  return typeof kind === "string" ? kind : undefined;
}

function recordsOf(value: unknown): DraftRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is DraftRecord => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return false;
    }
    const record = candidate as Record<string, unknown>;
    return (
      typeof record.resourceType === "string" &&
      typeof record.sourceId === "string" &&
      "payload" in record
    );
  });
}

function worldChildNotFound(noun: string) {
  return new NotFoundException(`The selected World ${noun} was not found.`);
}

function parsePagination(limit?: string, offset?: string) {
  return {
    limit: integerInRange(limit, 200, 1, 200),
    offset: integerInRange(offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function integerInRange(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException("The World collection page is invalid.");
  }
  return parsed;
}
