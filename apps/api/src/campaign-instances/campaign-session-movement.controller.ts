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
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type {
  SessionMovementRequest,
  SessionMovementDecisionRequest,
} from "@aow/common";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignSessionMovementService } from "./campaign-session-movement.service";

@ApiTags("campaign sessions")
@Controller(
  "campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/movement",
)
@UseGuards(GmGuard)
export class CampaignSessionMovementController {
  constructor(
    @Inject(CampaignSessionMovementService)
    private readonly movement: CampaignSessionMovementService,
  ) {}
  private scope(
    params: Record<string, string>,
    request: Request & AuthenticatedRequest,
  ) {
    return {
      definitionId: params.campaignDefinitionId,
      instanceId: params.campaignInstanceId,
      sessionId: params.sessionId,
      userId: request.user!.id,
    };
  }
  @Get()
  context(
    @Param() params: Record<string, string>,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.movement.context(this.scope(params, request));
  }
  @Post()
  preview(
    @Param() params: Record<string, string>,
    @Req() request: Request & AuthenticatedRequest,
    @Body() body: SessionMovementRequest,
  ) {
    return this.movement.preview(this.scope(params, request), body);
  }
  @Post(":proposalId/approve")
  approve(
    @Param() params: Record<string, string>,
    @Req() request: Request & AuthenticatedRequest,
    @Body() body: SessionMovementDecisionRequest,
  ) {
    return this.movement.decide(
      this.scope(params, request),
      params.proposalId,
      "approved",
      body?.idempotencyKey,
    );
  }
  @Post(":proposalId/reject")
  reject(
    @Param() params: Record<string, string>,
    @Req() request: Request & AuthenticatedRequest,
    @Body() body: SessionMovementDecisionRequest,
  ) {
    return this.movement.decide(
      this.scope(params, request),
      params.proposalId,
      "rejected",
      body?.idempotencyKey,
    );
  }
}
