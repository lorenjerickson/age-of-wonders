import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { setSessionCookie } from "../auth/auth.controller";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  CreateCampaignInvitationDto,
  InvitationTokenDto,
} from "./dto/invitation.dto";
import { InvitationsService } from "./invitations.service";

@ApiTags("campaign invitations")
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post("campaigns/:campaignId/invitations")
  @UseGuards(GmGuard)
  create(
    @Param("campaignId") campaignId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInvitationDto,
  ) {
    return this.invitations.create(campaignId, request.user!.id, dto);
  }

  @Get("campaigns/:campaignId/invitations")
  @UseGuards(GmGuard)
  list(@Param("campaignId") campaignId: string) {
    return this.invitations.list(campaignId);
  }

  @Get("campaigns/:campaignId/participants")
  @UseGuards(GmGuard)
  participants(@Param("campaignId") campaignId: string) {
    return this.invitations.participants(campaignId);
  }

  @Delete("campaigns/:campaignId/invitations/:invitationId")
  @UseGuards(GmGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param("campaignId") campaignId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.revoke(campaignId, invitationId);
  }

  @Post("campaigns/:campaignId/invitations/:invitationId/reissue")
  @UseGuards(GmGuard)
  reissue(
    @Param("campaignId") campaignId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.invitations.reissue(campaignId, invitationId, request.user!.id);
  }

  @Post("campaign-invitations/resolve")
  resolve(@Body() dto: InvitationTokenDto) {
    return this.invitations.resolve(dto.token);
  }

  @Post("campaign-invitations/accept")
  async accept(
    @Body() dto: InvitationTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.invitations.accept(dto.token);
    setSessionCookie(response, result.sessionToken);
    return { user: result.user, draftId: result.draftId };
  }
}
