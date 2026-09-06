import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { SessionGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";
import {
  CreatePlayerCampaignInstanceCharacterDto,
  ExpectedPlayerCharacterDraftRevisionDto,
  UpdatePlayerCampaignInstanceCharacterDraftDto,
} from "./dto/campaign-instance-character-draft.dto";

@ApiTags("player campaign instance characters")
@Controller("me/campaign-instances/:campaignInstanceId/characters")
@UseGuards(SessionGuard)
export class CampaignInstanceCharacterDraftsController {
  constructor(
    private readonly drafts: CampaignInstanceCharacterDraftsService,
  ) {}

  @Get()
  list(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.drafts.list(campaignInstanceId, request.user!.id);
  }

  @Post()
  create(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreatePlayerCampaignInstanceCharacterDto,
  ) {
    return this.drafts.create(campaignInstanceId, request.user!.id, dto);
  }

  @Get("options")
  options(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.drafts.options(campaignInstanceId, request.user!.id);
  }

  @Get(":characterId")
  get(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.drafts.get(campaignInstanceId, characterId, request.user!.id);
  }

  @Patch(":characterId")
  update(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
  ) {
    return this.drafts.update(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto,
    );
  }

  @Post(":characterId/attribute-rolls")
  rollAttributes(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedPlayerCharacterDraftRevisionDto,
  ) {
    return this.drafts.rollAttributes(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto.expectedRevision,
    );
  }

  @Post(":characterId/actions/submit-for-review")
  @HttpCode(HttpStatus.OK)
  submitForReview(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedPlayerCharacterDraftRevisionDto,
  ) {
    return this.drafts.submitForReview(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto.expectedRevision,
    );
  }
}
