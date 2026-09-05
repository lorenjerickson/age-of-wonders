import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import {
  ApplyCampaignWorldMigrationDto, CreateCampaignDefinitionDto,
  ExpectedCampaignDraftRevisionDto, ExpectedCampaignMetadataRevisionDto,
  ForkCampaignDefinitionDto, PreviewCampaignWorldMigrationDto,
  ResetCampaignDraftDto, SaveCampaignDraftDto, StartCampaignDraftDto,
} from "./dto/campaign-definition-write.dto";

@ApiTags("campaign definitions")
@Controller("campaign-definitions")
@UseGuards(GmGuard)
export class CampaignDefinitionsController {
  constructor(private readonly campaigns: Pick<CampaignDefinitionsService,
    "list" | "get" | "create" | "getDraft" | "startDraft" | "save" |
    "resetDraft" | "validate" | "publish" | "impact" | "archive" | "restore" | "fork" |
    "previewWorldMigration" | "applyWorldMigration">) {}

  @Get() list(@Req() request: Request & AuthenticatedRequest) { return this.campaigns.list(request.user!.id); }

  @Post()
  @ApiOperation({ summary: "Create a Campaign Definition lineage and mutable draft" })
  create(@Req() request: Request & AuthenticatedRequest, @Body() dto: CreateCampaignDefinitionDto) {
    return this.campaigns.create(dto, request.user!.id);
  }

  @Get(":id/draft")
  getDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) {
    return this.campaigns.getDraft(id, request.user!.id);
  }

  @Post(":id/draft")
  startDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: StartCampaignDraftDto) {
    return this.campaigns.startDraft(id, dto, request.user!.id);
  }

  @Put(":id/draft")
  saveDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: SaveCampaignDraftDto) {
    return this.campaigns.save(id, dto, request.user!.id);
  }

  @Post(":id/draft/reset")
  @ApiOperation({ summary: "Discard unpublished edits and restore the exact published base" })
  resetDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ResetCampaignDraftDto) {
    return this.campaigns.resetDraft(id, dto, request.user!.id);
  }

  @Post(":id/draft/validate")
  validateDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ExpectedCampaignDraftRevisionDto) {
    return this.campaigns.validate(id, dto, request.user!.id);
  }

  @Post(":id/draft/publish")
  publishDraft(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ExpectedCampaignDraftRevisionDto) {
    return this.campaigns.publish(id, dto, request.user!.id);
  }

  @Get(":id/draft/impact")
  impact(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) { return this.campaigns.impact(id, request.user!.id); }

  @Post(":id/archive")
  archive(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ExpectedCampaignMetadataRevisionDto) { return this.campaigns.archive(id, dto, request.user!.id); }

  @Post(":id/restore")
  restore(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ExpectedCampaignMetadataRevisionDto) { return this.campaigns.restore(id, dto, request.user!.id); }

  @Post(":id/forks")
  fork(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ForkCampaignDefinitionDto) { return this.campaigns.fork(id, dto, request.user!.id); }

  @Post(":id/world-migrations/preview")
  previewWorldMigration(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: PreviewCampaignWorldMigrationDto) { return this.campaigns.previewWorldMigration(id, dto, request.user!.id); }

  @Post(":id/world-migrations/apply")
  applyWorldMigration(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest, @Body() dto: ApplyCampaignWorldMigrationDto) { return this.campaigns.applyWorldMigration(id, dto, request.user!.id); }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) { return this.campaigns.get(id, request.user!.id); }
}
