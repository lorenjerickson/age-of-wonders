import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { LegacyApiDeprecationInterceptor } from "../api-compat/legacy-api-deprecation.interceptor";
import {
  CreateWorldDraftDto,
  ExpectedDraftRevisionDto,
  ExpectedWorldMetadataRevisionDto,
  ForkWorldDefinitionDto,
  SaveWorldDraftDto,
  StartWorldDraftDto,
} from "./dto/world-definition-authoring.dto";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { WorldDefinitionsService } from "./world-definitions.service";

@ApiTags("world definitions")
@Controller("world-definitions")
@UseGuards(GmGuard)
@UseInterceptors(LegacyApiDeprecationInterceptor)
export class WorldDefinitionsController {
  constructor(
    @Inject(WorldDefinitionsService)
    private readonly worlds: Pick<WorldDefinitionsService, "list" | "get">,
    private readonly authoring: WorldDefinitionAuthoringService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List World Definition lineages and current revision metadata",
  })
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.worlds.list(request.user!.id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a World Definition lineage and mutable draft",
  })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateWorldDraftDto,
  ) {
    return this.authoring.create(dto, request.user!.id);
  }

  @Get(":id/draft")
  getDraft(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.getDraft(id, request.user!.id);
  }

  @Post(":id/draft")
  @ApiOperation({
    summary:
      "Start or resume a mutable draft from the selected current World revision",
  })
  startDraft(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: StartWorldDraftDto,
  ) {
    return this.authoring.startDraft(id, dto, request.user!.id);
  }

  @Put(":id/draft")
  saveDraft(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: SaveWorldDraftDto,
  ) {
    return this.authoring.save(id, dto, request.user!.id);
  }

  @Post(":id/draft/validate")
  validateDraft(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedDraftRevisionDto,
  ) {
    return this.authoring.validate(id, dto, request.user!.id);
  }

  @Post(":id/draft/publish")
  publishDraft(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedDraftRevisionDto,
  ) {
    return this.authoring.publish(id, dto, request.user!.id);
  }

  @Get(":id/draft/impact")
  impact(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.authoring.impact(id, request.user!.id);
  }

  @Post(":id/archive")
  archive(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedWorldMetadataRevisionDto,
  ) {
    return this.authoring.archive(id, dto, request.user!.id);
  }

  @Post(":id/restore")
  restore(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedWorldMetadataRevisionDto,
  ) {
    return this.authoring.restore(id, dto, request.user!.id);
  }

  @Post(":id/forks")
  fork(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ForkWorldDefinitionDto,
  ) {
    return this.authoring.fork(id, dto, request.user!.id);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "World Definition lineage ID" })
  @ApiOperation({
    summary: "Get one World Definition lineage, its revisions, and snapshots",
  })
  get(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) {
    return this.worlds.get(id, request.user!.id);
  }
}
