import {
  Body,
  Controller,
  Get,
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
import { CharacterDraftsService } from "./character-drafts.service";
import {
  CreateCharacterDraftDto,
  ExpectedCharacterDraftRevisionDto,
  UpdateCharacterDraftDto,
} from "./dto/character-draft.dto";

@ApiTags("character creation")
@Controller()
@UseGuards(SessionGuard)
export class CharacterDraftsController {
  constructor(private readonly drafts: CharacterDraftsService) {}

  @Get("character-drafts")
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.drafts.list(request.user!.id);
  }

  @Post("character-drafts")
  createForCurrentCampaign(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCharacterDraftDto,
  ) {
    return this.drafts.create(request.user!.id, undefined, dto.name);
  }

  @Get("character-drafts/:id")
  get(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) {
    return this.drafts.get(id, request.user!.id);
  }

  @Patch("character-drafts/:id")
  update(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCharacterDraftDto,
  ) {
    return this.drafts.update(id, request.user!.id, dto);
  }

  @Post("character-drafts/:id/attribute-rolls")
  rollAttributes(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedCharacterDraftRevisionDto,
  ) {
    return this.drafts.rollAttributes(
      id,
      request.user!.id,
      dto.expectedRevision,
    );
  }

  @Get("character-drafts/:id/options")
  options(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.drafts.options(id, request.user!.id);
  }
}
