import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignSessionService } from "./campaign-session.service";
import {
  CampaignSessionLifecycleDto,
  CreateCampaignSessionDto,
  UpdateCampaignSessionDto,
  UpdateCampaignSessionParticipantsDto,
  UpdateCampaignSessionSummaryDto,
} from "./dto/campaign-session.dto";

@ApiTags("campaign sessions")
@Controller(
  "campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions",
)
@UseGuards(GmGuard)
export class CampaignSessionsController {
  constructor(
    @Inject(CampaignInstanceManagementService)
    private readonly management: CampaignInstanceManagementService,
    @Inject(CampaignSessionService)
    private readonly sessions: CampaignSessionService,
  ) {}

  private async scope(
    campaignDefinitionId: string,
    campaignInstanceId: string,
    request: Request & AuthenticatedRequest,
  ) {
    await this.sessions.assertCampaignDefinitionParent(
      campaignDefinitionId,
      campaignInstanceId,
      request.user!.id,
    );
  }

  @Get()
  async list(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.sessions(campaignInstanceId, request.user!.id);
  }

  @Post()
  async create(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignSessionDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.create(campaignInstanceId, request.user!.id, dto);
  }

  @Get(":sessionId")
  async detail(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.detail(
      campaignInstanceId,
      sessionId,
      request.user!.id,
    );
  }

  @Patch(":sessionId")
  async update(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.update(
      campaignInstanceId,
      sessionId,
      request.user!.id,
      dto,
    );
  }

  @Put(":sessionId/participants")
  async replaceParticipants(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionParticipantsDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.replaceParticipants(
      campaignInstanceId,
      sessionId,
      request.user!.id,
      dto,
    );
  }

  @Post(":sessionId/participants/:participationId/actions/eject")
  async eject(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Param("participationId") participationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CampaignSessionLifecycleDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.eject(
      campaignInstanceId,
      sessionId,
      participationId,
      request.user!.id,
      dto.expectedMetadataRevision,
    );
  }

  @Get(":sessionId/readiness")
  async readiness(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.readiness(
      campaignInstanceId,
      sessionId,
      request.user!.id,
    );
  }

  @Post(":sessionId/invitations")
  async issueInvitations(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.issueInvitations(
      campaignInstanceId,
      sessionId,
      request.user!.id,
    );
  }

  @Post(":sessionId/invitations/:invitationId/actions/retry")
  async retryInvitation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.retryInvitation(
      campaignInstanceId,
      sessionId,
      invitationId,
      request.user!.id,
    );
  }

  @Delete(":sessionId/invitations/:invitationId")
  async revokeInvitation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.revokeInvitation(
      campaignInstanceId,
      sessionId,
      invitationId,
      request.user!.id,
    );
  }

  @Get(":sessionId/events")
  async events(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("afterSequence") afterSequence?: string,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    const parsed = parseEventCursor(afterSequence);
    return this.sessions.events(
      campaignInstanceId,
      sessionId,
      request.user!.id,
      parsed,
    );
  }

  @Get(":sessionId/summary")
  async summary(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.summary(
      campaignInstanceId,
      sessionId,
      request.user!.id,
    );
  }

  @Put(":sessionId/summary")
  async updateSummary(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionSummaryDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.updateSummary(
      campaignInstanceId,
      sessionId,
      request.user!.id,
      dto,
    );
  }

  @Post(":sessionId/actions/:command")
  async command(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("sessionId") sessionId: string,
    @Param("command") command: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CampaignSessionLifecycleDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.sessions.command(
      campaignInstanceId,
      sessionId,
      request.user!.id,
      command,
      dto,
    );
  }
}

function parseEventCursor(value?: string) {
  const parsed = value ? Number.parseInt(value, 10) : 0;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BadRequestException("The event cursor is invalid.");
  }
  return parsed;
}
