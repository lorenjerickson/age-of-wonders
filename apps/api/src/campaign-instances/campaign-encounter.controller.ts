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
import type { Request } from "express";
import { GmGuard, SessionGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  CampaignEncounterService,
  type EncounterRequest,
} from "./campaign-encounter.service";
@Controller(
  "campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/encounter",
)
@UseGuards(GmGuard)
export class CampaignEncounterController {
  constructor(
    @Inject(CampaignEncounterService)
    private readonly service: CampaignEncounterService,
  ) {}
  @Get() read(
    @Param()
    p: {
      campaignDefinitionId: string;
      campaignInstanceId: string;
      sessionId: string;
    },
    @Req() r: Request & AuthenticatedRequest,
  ) {
    return this.service.read({
      definitionId: p.campaignDefinitionId,
      instanceId: p.campaignInstanceId,
      sessionId: p.sessionId,
      userId: r.user!.id,
    });
  }
  @Post() execute(
    @Param()
    p: {
      campaignDefinitionId: string;
      campaignInstanceId: string;
      sessionId: string;
    },
    @Req() r: Request & AuthenticatedRequest,
    @Body() input: EncounterRequest,
  ) {
    return this.service.execute(
      {
        definitionId: p.campaignDefinitionId,
        instanceId: p.campaignInstanceId,
        sessionId: p.sessionId,
        userId: r.user!.id,
      },
      input,
    );
  }
}
@Controller("me/campaign-instances/:instanceId/sessions/:sessionId/encounter")
@UseGuards(SessionGuard)
export class PlayerEncounterController {
  constructor(
    @Inject(CampaignEncounterService)
    private readonly service: CampaignEncounterService,
  ) {}
  @Get() read(
    @Param() p: { instanceId: string; sessionId: string },
    @Req() r: Request & AuthenticatedRequest,
  ) {
    return this.service.read({ ...p, userId: r.user!.id, player: true });
  }
  @Post() execute(
    @Param() p: { instanceId: string; sessionId: string },
    @Req() r: Request & AuthenticatedRequest,
    @Body() input: EncounterRequest,
  ) {
    return this.service.execute(
      { ...p, userId: r.user!.id, player: true },
      input,
    );
  }
}
