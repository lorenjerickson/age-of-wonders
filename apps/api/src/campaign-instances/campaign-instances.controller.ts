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
  UseInterceptors,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignInstancesService } from "./campaign-instances.service";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";
import {
  ApplyCampaignInstanceMigrationDto,
  ApplyCampaignInstanceRestoreDto,
  PreviewCampaignInstanceMigrationDto,
  PreviewCampaignInstanceRestoreDto,
} from "./dto/campaign-instance-migration.dto";
import {
  ConfigureCampaignInstanceAgentDto,
  CreateCampaignInstanceInvitationDto,
  DecideCampaignInstancePlacementDto,
  UpdateCampaignInstanceAgentStatusDto,
  UpdateCampaignInstanceLifecycleDto,
  UpdateCampaignInstancePlotDto,
  UpdateCampaignInstancePreparationDto,
} from "./dto/campaign-instance-management.dto";
import { CreateCampaignInstanceDto } from "./dto/create-campaign-instance.dto";
import { CampaignSessionService } from "./campaign-session.service";
import {
  CampaignSessionLifecycleDto,
  CreateCampaignSessionDto,
  UpdateCampaignSessionDto,
  UpdateCampaignSessionParticipantsDto,
  UpdateCampaignSessionSummaryDto,
} from "./dto/campaign-session.dto";
import { LegacyApiDeprecationInterceptor } from "./legacy-api-deprecation.interceptor";

@ApiTags("campaign instances")
@Controller("campaign-instances")
@UseGuards(GmGuard)
export class CampaignInstancesController {
  constructor(
    @Inject(CampaignInstancesService)
    private readonly instances: Pick<
      CampaignInstancesService,
      "list" | "get" | "create"
    >,
    @Inject(CampaignInstanceManagementService)
    private readonly management: CampaignInstanceManagementService,
    @Inject(CampaignInstanceInvitationsService)
    private readonly invitations: CampaignInstanceInvitationsService,
    @Inject(CampaignInstanceMigrationsService)
    private readonly migrations: CampaignInstanceMigrationsService,
    @Inject(CampaignSessionService)
    private readonly campaignSessions: CampaignSessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List Campaign Instances and captured provenance" })
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.instances.list(request.user!.id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a Campaign Instance from an immutable Definition snapshot",
  })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceDto,
  ) {
    return this.instances.create(
      dto,
      request.user!.id,
      request.user!.displayName,
    );
  }

  @Get("resumable-session")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  resumableSession(@Req() request: Request & AuthenticatedRequest) {
    return this.campaignSessions.resumableForGm(request.user!.id);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "Campaign Instance ID" })
  @ApiOperation({
    summary: "Get one Campaign Instance without exposing runtime state",
  })
  get(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) {
    return this.instances.get(id, request.user!.id);
  }

  @Post(":id/validate")
  validate(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.validate(id, request.user!.id);
  }

  @Patch(":id/lifecycle")
  updateLifecycle(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceLifecycleDto,
  ) {
    return this.management.updateLifecycle(id, request.user!.id, dto);
  }

  @Get(":id/preparation")
  preparation(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.preparation(id, request.user!.id);
  }

  @Put(":id/preparation")
  updatePreparation(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstancePreparationDto,
  ) {
    return this.management.updatePreparation(id, request.user!.id, dto);
  }

  @Get(":id/plots")
  plots(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.plots(id, request.user!.id);
  }

  @Patch(":id/plots/:plotDefinitionId")
  updatePlot(
    @Param("id") id: string,
    @Param("plotDefinitionId") plotDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstancePlotDto,
  ) {
    return this.management.updatePlot(
      id,
      plotDefinitionId,
      request.user!.id,
      dto,
    );
  }

  @Get(":id/placements")
  placements(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.placements(id, request.user!.id);
  }

  @Post(":id/placements/:realizationId/:action")
  decidePlacement(
    @Param("id") id: string,
    @Param("realizationId") realizationId: string,
    @Param("action") action: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: DecideCampaignInstancePlacementDto,
  ) {
    if (action !== dto.action) {
      throw new BadRequestException(
        "The placement action does not match the request path.",
      );
    }
    return this.management.decidePlacement(
      id,
      realizationId,
      request.user!.id,
      dto,
    );
  }

  @Get(":id/embodiments")
  embodiments(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.embodiments(id, request.user!.id);
  }

  @Get(":id/roster")
  roster(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.roster(id, request.user!.id);
  }

  @Get(":id/available-agents")
  availableAgents(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.availableAgents(id, request.user!.id);
  }

  @Post(":id/invitations")
  createInvitation(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceInvitationDto,
  ) {
    return this.invitations.create(id, request.user!.id, dto);
  }

  @Post(":id/invitations/:invitationId/retry")
  retryInvitation(
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.invitations.retry(id, invitationId, request.user!.id);
  }

  @Delete(":id/invitations/:invitationId")
  revokeInvitation(
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.invitations.revoke(id, invitationId, request.user!.id);
  }

  @Post(":id/agents")
  configureAgent(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ConfigureCampaignInstanceAgentDto,
  ) {
    return this.management.configureAgent(id, request.user!.id, dto);
  }

  @Patch(":id/agents/:agentParticipationId")
  updateAgentStatus(
    @Param("id") id: string,
    @Param("agentParticipationId") agentParticipationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceAgentStatusDto,
  ) {
    return this.management.updateAgentStatus(
      id,
      agentParticipationId,
      request.user!.id,
      dto,
    );
  }

  @Get(":id/sessions")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessions(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.sessions(id, request.user!.id);
  }

  @Post(":id/sessions")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  planSession(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignSessionDto,
  ) {
    return this.campaignSessions.create(id, request.user!.id, dto);
  }

  @Get(":id/sessions/:sessionId")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessionDetail(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.detail(id, sessionId, request.user!.id);
  }

  @Patch(":id/sessions/:sessionId")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  updateSession(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionDto,
  ) {
    return this.campaignSessions.update(id, sessionId, request.user!.id, dto);
  }

  @Put(":id/sessions/:sessionId/participants")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  updateSessionParticipants(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionParticipantsDto,
  ) {
    return this.campaignSessions.replaceParticipants(
      id,
      sessionId,
      request.user!.id,
      dto,
    );
  }

  @Post(":id/sessions/:sessionId/participants/:participationId/eject")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  ejectSessionParticipant(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Param("participationId") participationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CampaignSessionLifecycleDto,
  ) {
    return this.campaignSessions.eject(
      id,
      sessionId,
      participationId,
      request.user!.id,
      dto.expectedMetadataRevision,
    );
  }

  @Get(":id/sessions/:sessionId/readiness")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessionReadiness(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.readiness(id, sessionId, request.user!.id);
  }

  @Post(":id/sessions/:sessionId/invitations")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  issueSessionInvitations(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.issueInvitations(
      id,
      sessionId,
      request.user!.id,
    );
  }

  @Post(":id/sessions/:sessionId/invitations/:invitationId/retry")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  retrySessionInvitation(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.retryInvitation(
      id,
      sessionId,
      invitationId,
      request.user!.id,
    );
  }

  @Delete(":id/sessions/:sessionId/invitations/:invitationId")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  revokeSessionInvitation(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.revokeInvitation(
      id,
      sessionId,
      invitationId,
      request.user!.id,
    );
  }

  @Get(":id/sessions/:sessionId/events")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessionEvents(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("afterSequence") afterSequence?: string,
  ) {
    const parsed = afterSequence ? Number.parseInt(afterSequence, 10) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 0)
      throw new BadRequestException("The event cursor is invalid.");
    return this.campaignSessions.events(
      id,
      sessionId,
      request.user!.id,
      parsed,
    );
  }

  @Get(":id/sessions/:sessionId/summary")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessionSummary(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.campaignSessions.summary(id, sessionId, request.user!.id);
  }

  @Post(":id/sessions/:sessionId/:command")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  sessionCommand(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Param("command") command: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CampaignSessionLifecycleDto,
  ) {
    return this.campaignSessions.command(
      id,
      sessionId,
      request.user!.id,
      command,
      dto,
    );
  }

  @Put(":id/sessions/:sessionId/summary")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  updateSessionSummary(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignSessionSummaryDto,
  ) {
    return this.campaignSessions.updateSummary(
      id,
      sessionId,
      request.user!.id,
      dto,
    );
  }

  @Get(":id/continuation")
  continuation(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.continuation(id, request.user!.id);
  }

  @Get(":id/versions")
  versions(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.management.versions(id, request.user!.id);
  }

  @Post(":id/migrations/preview")
  previewMigration(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PreviewCampaignInstanceMigrationDto,
  ) {
    return this.migrations.preview(id, request.user!.id, dto, "migration");
  }

  @Post(":id/migrations/apply")
  applyMigration(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ApplyCampaignInstanceMigrationDto,
  ) {
    return this.migrations.apply(id, request.user!.id, dto, "migration");
  }

  @Post(":id/restores/preview")
  previewRestore(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PreviewCampaignInstanceRestoreDto,
  ) {
    return this.migrations.previewRestore(id, request.user!.id, dto);
  }

  @Post(":id/restores/apply")
  applyRestore(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ApplyCampaignInstanceRestoreDto,
  ) {
    return this.migrations.applyRestore(id, request.user!.id, dto);
  }
}
