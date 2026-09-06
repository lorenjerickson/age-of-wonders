import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { setSessionCookie } from "../auth/auth.controller";
import { SessionGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import { CampaignSessionService } from "./campaign-session.service";
import {
  InstanceInvitationTokenDto,
  PresenceConnectionDto,
  SessionInvitationResponseDto,
} from "./dto/campaign-participation.dto";

@Controller("invitations")
export class CampaignInvitationEntryController {
  constructor(
    private readonly invitations: CampaignInstanceInvitationsService,
    private readonly sessions: CampaignSessionService,
  ) {}

  @Post("instance/resolve")
  resolveInstance(@Body() dto: InstanceInvitationTokenDto) {
    return this.invitations.resolve(dto.token);
  }

  @Post("instance/accept")
  async acceptInstance(
    @Body() dto: InstanceInvitationTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.invitations.accept(dto.token);
    setSessionCookie(response, result.sessionToken);
    return {
      user: result.user,
      campaignInstanceId: result.campaignInstanceId,
      campaignInstanceName: result.campaignInstanceName,
    };
  }

  @Post("session/resolve")
  resolveSession(
    @Body() dto: InstanceInvitationTokenDto,
    @Req() request: Request,
  ) {
    return this.sessions.resolveInvitation(dto.token, request.ip ?? "unknown");
  }

  @Post("session/respond")
  async respondToSession(
    @Body() dto: SessionInvitationResponseDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.sessions.respondToInvitation(
      dto.token,
      dto.response,
      dto.message,
      request.ip ?? "unknown",
    );
    if (result.sessionToken) setSessionCookie(response, result.sessionToken);
    return {
      campaignInstanceName: result.campaignInstanceName,
      sessionName: result.sessionName,
      participantName: result.participantName,
      response: result.response,
      lobbyHref: result.lobbyHref,
    };
  }
}

@Controller("me")
@UseGuards(SessionGuard)
export class CampaignSessionMeOverviewController {
  constructor(private readonly sessions: CampaignSessionService) {}

  @Get("resumable-session")
  resumableSession(@Req() request: Request & AuthenticatedRequest) {
    return this.sessions.resumableForGm(request.user!.id);
  }
}

@Controller("me/campaign-instances/:instanceId/sessions/:sessionId")
@UseGuards(SessionGuard)
export class CampaignSessionMeController {
  constructor(private readonly sessions: CampaignSessionService) {}

  @Get()
  session(
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.sessions.participantProjection(
      instanceId,
      sessionId,
      request.user!.id,
    );
  }

  @Get("events")
  events(
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("afterSequence") afterSequence?: string,
  ) {
    const parsed = afterSequence ? Number.parseInt(afterSequence, 10) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new BadRequestException("The event cursor is invalid.");
    }
    return this.sessions.participantEvents(
      instanceId,
      sessionId,
      request.user!.id,
      parsed,
    );
  }

  @Post("presence/join")
  join(
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PresenceConnectionDto,
  ) {
    return this.sessions.join(
      instanceId,
      sessionId,
      request.user!.id,
      dto.connectionKey,
    );
  }

  @Post("presence/heartbeat")
  heartbeat(
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PresenceConnectionDto,
  ) {
    return this.sessions.heartbeat(
      instanceId,
      sessionId,
      request.user!.id,
      dto.connectionKey,
    );
  }

  @Post("presence/leave")
  leave(
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PresenceConnectionDto,
  ) {
    return this.sessions.leave(
      instanceId,
      sessionId,
      request.user!.id,
      dto.connectionKey,
    );
  }
}
