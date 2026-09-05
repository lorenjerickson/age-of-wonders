import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import {
  CreateCampaignDefinitionDto,
  PublishCampaignDefinitionRevisionDto,
} from "./dto/campaign-definition-write.dto";

@ApiTags("campaign definitions")
@Controller("campaign-definitions")
@UseGuards(GmGuard)
export class CampaignDefinitionsController {
  constructor(
    @Inject(CampaignDefinitionsService)
    private readonly campaigns: Pick<
      CampaignDefinitionsService,
      "list" | "get" | "create" | "publishRevision"
    >,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List Campaign Definition lineages and current revision metadata",
  })
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.campaigns.list(request.user!.id);
  }

  @Post()
  @ApiOperation({ summary: "Create and publish a Campaign Definition lineage" })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignDefinitionDto,
  ) {
    return this.campaigns.create(dto, request.user!.id);
  }

  @Post(":id/revisions")
  @ApiOperation({ summary: "Publish a complete direct-successor revision" })
  publishRevision(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PublishCampaignDefinitionRevisionDto,
  ) {
    return this.campaigns.publishRevision(id, dto, request.user!.id);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "Campaign Definition lineage ID" })
  @ApiOperation({
    summary: "Get one Campaign Definition and its immutable current revision",
  })
  get(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaigns.get(id, request.user!.id);
  }
}
