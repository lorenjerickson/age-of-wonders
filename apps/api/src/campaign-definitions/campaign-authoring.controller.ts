import {
  BadRequestException,
  Body,
  Controller,
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
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  ApplyCampaignWorldMigrationDto,
  CreateCampaignDefinitionDto,
  ExpectedCampaignDraftRevisionDto,
  ExpectedCampaignMetadataRevisionDto,
  ForkCampaignDefinitionDto,
  PreviewCampaignWorldMigrationDto,
  ResetCampaignDraftDto,
  SaveCampaignDraftDto,
  StartCampaignDraftDto,
} from "./dto/campaign-definition-write.dto";
import { CampaignDefinitionsService } from "./campaign-definitions.service";

@ApiTags("campaigns")
@Controller("campaigns")
@UseGuards(GmGuard)
export class CampaignAuthoringController {
  constructor(
    @Inject(CampaignDefinitionsService)
    private readonly campaigns: CampaignDefinitionsService,
  ) {}

  @Get()
  async list(
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const result = await this.campaigns.list(request.user!.id);
    return {
      ...result,
      items: result.items.slice(page.offset, page.offset + page.limit),
      limit: page.limit,
      offset: page.offset,
    };
  }

  @Post()
  @ApiOperation({
    summary: "Create a Campaign Definition lineage and mutable draft",
  })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignDefinitionDto,
  ) {
    return this.campaigns.create(dto, request.user!.id);
  }

  @Get(":campaignDefinitionId")
  get(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaigns.get(campaignDefinitionId, request.user!.id);
  }

  @Get(":campaignDefinitionId/revisions")
  async revisions(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const campaign = await this.campaigns.get(
      campaignDefinitionId,
      request.user!.id,
    );
    return {
      items: campaign.revisions.slice(page.offset, page.offset + page.limit),
      total: campaign.revisions.length,
      limit: page.limit,
      offset: page.offset,
    };
  }

  @Get(":campaignDefinitionId/revisions/:revisionId")
  async revision(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("revisionId") revisionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    const campaign = await this.campaigns.get(
      campaignDefinitionId,
      request.user!.id,
    );
    const revision = campaign.revisions.find(
      (candidate) => candidate.id === revisionId,
    );
    if (!revision) throw campaignChildNotFound("revision");
    return revision;
  }

  @Get(":campaignDefinitionId/draft")
  getDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaigns.getDraft(campaignDefinitionId, request.user!.id);
  }

  @Post(":campaignDefinitionId/draft")
  @HttpCode(HttpStatus.OK)
  startDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: StartCampaignDraftDto,
  ) {
    return this.campaigns.startDraft(
      campaignDefinitionId,
      dto,
      request.user!.id,
    );
  }

  @Put(":campaignDefinitionId/draft")
  saveDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: SaveCampaignDraftDto,
  ) {
    return this.campaigns.save(campaignDefinitionId, dto, request.user!.id);
  }

  @Post(":campaignDefinitionId/draft/reset")
  @HttpCode(HttpStatus.OK)
  resetDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ResetCampaignDraftDto,
  ) {
    return this.campaigns.resetDraft(
      campaignDefinitionId,
      dto,
      request.user!.id,
    );
  }

  @Post(":campaignDefinitionId/draft/validate")
  @HttpCode(HttpStatus.OK)
  validateDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedCampaignDraftRevisionDto,
  ) {
    return this.campaigns.validate(campaignDefinitionId, dto, request.user!.id);
  }

  @Post(":campaignDefinitionId/draft/publish")
  @HttpCode(HttpStatus.OK)
  publishDraft(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedCampaignDraftRevisionDto,
  ) {
    return this.campaigns.publish(campaignDefinitionId, dto, request.user!.id);
  }

  @Get(":campaignDefinitionId/draft/impact")
  impact(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaigns.impact(campaignDefinitionId, request.user!.id);
  }

  @Get(":campaignDefinitionId/plots")
  plots(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.draftRecords(
      campaignDefinitionId,
      request.user!.id,
      "plots",
      limit,
      offset,
    );
  }

  @Get(":campaignDefinitionId/plots/:plotDefinitionId")
  async plot(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("plotDefinitionId") plotDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.draftRecord(
      campaignDefinitionId,
      request.user!.id,
      "plots",
      plotDefinitionId,
      "Plot",
    );
  }

  @Get(":campaignDefinitionId/placements")
  placements(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.draftRecords(
      campaignDefinitionId,
      request.user!.id,
      "campaign-placements",
      limit,
      offset,
    );
  }

  @Get(":campaignDefinitionId/placements/:placementId")
  placement(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("placementId") placementId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.draftRecord(
      campaignDefinitionId,
      request.user!.id,
      "campaign-placements",
      placementId,
      "placement",
    );
  }

  @Post(":campaignDefinitionId/archive")
  @HttpCode(HttpStatus.OK)
  archive(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedCampaignMetadataRevisionDto,
  ) {
    return this.campaigns.archive(campaignDefinitionId, dto, request.user!.id);
  }

  @Post(":campaignDefinitionId/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedCampaignMetadataRevisionDto,
  ) {
    return this.campaigns.restore(campaignDefinitionId, dto, request.user!.id);
  }

  @Post(":campaignDefinitionId/forks")
  fork(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ForkCampaignDefinitionDto,
  ) {
    return this.campaigns.fork(campaignDefinitionId, dto, request.user!.id);
  }

  @Post(":campaignDefinitionId/world-migrations/preview")
  @HttpCode(HttpStatus.OK)
  previewWorldMigration(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PreviewCampaignWorldMigrationDto,
  ) {
    return this.campaigns.previewWorldMigration(
      campaignDefinitionId,
      dto,
      request.user!.id,
    );
  }

  @Post(":campaignDefinitionId/world-migrations/apply")
  @HttpCode(HttpStatus.OK)
  applyWorldMigration(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ApplyCampaignWorldMigrationDto,
  ) {
    return this.campaigns.applyWorldMigration(
      campaignDefinitionId,
      dto,
      request.user!.id,
    );
  }

  private async draftRecords(
    campaignDefinitionId: string,
    userId: string,
    resourceType: string,
    limit?: string,
    offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    const draft = await this.campaigns.getDraft(campaignDefinitionId, userId);
    const items = recordsOf(draft.records).filter(
      (record) => record.resourceType === resourceType,
    );
    return {
      items: items.slice(page.offset, page.offset + page.limit),
      total: items.length,
      limit: page.limit,
      offset: page.offset,
    };
  }

  private async draftRecord(
    campaignDefinitionId: string,
    userId: string,
    resourceType: string,
    sourceId: string,
    noun: string,
  ) {
    const draft = await this.campaigns.getDraft(campaignDefinitionId, userId);
    const record = recordsOf(draft.records).find(
      (candidate) =>
        candidate.resourceType === resourceType &&
        candidate.sourceId === sourceId,
    );
    if (!record) throw campaignChildNotFound(noun);
    return record;
  }
}

interface DraftRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly payload: unknown;
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

function campaignChildNotFound(noun: string) {
  return new NotFoundException(`The selected Campaign ${noun} was not found.`);
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
    throw new BadRequestException(
      "The Campaign Definition collection page is invalid.",
    );
  }
  return parsed;
}
