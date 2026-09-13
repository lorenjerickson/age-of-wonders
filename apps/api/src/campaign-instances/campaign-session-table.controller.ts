import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignSessionTableService } from "./campaign-session-table.service";

@ApiTags("campaign sessions")
@Controller(
  "campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions",
)
@UseGuards(GmGuard)
export class CampaignSessionTableController {
  constructor(
    @Inject(CampaignSessionTableService)
    private readonly tables: CampaignSessionTableService,
  ) {}

  @Get(":sessionId/table")
  table(
    @Param("campaignDefinitionId") definitionId: string,
    @Param("campaignInstanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Query("locationId") locationId: string | undefined,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.tables.table(
      definitionId,
      instanceId,
      sessionId,
      request.user!.id,
      locationId,
    );
  }
}
