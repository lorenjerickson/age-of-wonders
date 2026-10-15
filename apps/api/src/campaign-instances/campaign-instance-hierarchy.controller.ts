import { ChangeActorEquipmentDto } from "./dto/campaign-instance-management.dto";
import { PlaceCampaignInstanceActorDto } from "./dto/campaign-instance-management.dto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";
import { CampaignInstancesService } from "./campaign-instances.service";
import { CampaignInstanceCharactersService } from "./campaign-instance-characters.service";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";
import {
  ReviewCampaignInstanceCharacterDto,
  UpdatePlayerCampaignInstanceCharacterDraftDto,
  ExpectedPlayerCharacterDraftRevisionDto,
} from "./dto/campaign-instance-character-draft.dto";
import {
  ApplyCampaignInstanceMigrationDto,
  ApplyCampaignInstanceRestoreDto,
  PreviewCampaignInstanceMigrationDto,
  PreviewCampaignInstanceRestoreDto,
} from "./dto/campaign-instance-migration.dto";
import {
  ConfigureCampaignInstanceAgentDto,
  CreateCampaignInstanceCharacterDto,
  CreateCampaignInstanceInvitationDto,
  DecideCampaignInstancePlacementDto,
  ImportCampaignInstanceCharacterDto,
  SelectCampaignInstanceCharacterDto,
  UpdateCampaignInstanceAgentStatusDto,
  UpdateCampaignInstanceLifecycleDto,
  UpdateCampaignInstanceCharacterStatusDto,
  UpdateCampaignInstanceMembershipStatusDto,
  UpdateCampaignInstancePlotDto,
  UpdateCampaignInstancePreparationDto,
} from "./dto/campaign-instance-management.dto";
import { CreateCampaignInstanceDto } from "./dto/create-campaign-instance.dto";

@ApiTags("campaign instances")
@Controller("campaigns/:campaignDefinitionId/instances")
@UseGuards(GmGuard)
export class CampaignInstanceHierarchyController {
  constructor(
    @Inject(CampaignInstancesService)
    private readonly instances: CampaignInstancesService,
    @Inject(CampaignInstanceManagementService)
    private readonly management: CampaignInstanceManagementService,
    @Inject(CampaignInstanceInvitationsService)
    private readonly invitations: CampaignInstanceInvitationsService,
    @Inject(CampaignInstanceMigrationsService)
    private readonly migrations: CampaignInstanceMigrationsService,
    @Inject(CampaignInstanceCharactersService)
    private readonly charactersService: CampaignInstanceCharactersService,
    @Inject(CampaignInstanceCharacterDraftsService)
    private readonly characterDraftsService: CampaignInstanceCharacterDraftsService,
  ) {}

  private async scope(
    campaignDefinitionId: string,
    campaignInstanceId: string,
    request: Request & AuthenticatedRequest,
  ) {
    await this.instances.assertParent(
      campaignDefinitionId,
      campaignInstanceId,
      request.user!.id,
    );
  }

  @Get(":campaignInstanceId/creature-embodiments/:actorId/equipment")
  async equipment(
    @Param("campaignDefinitionId") campaignId: string,
    @Param("campaignInstanceId") instanceId: string,
    @Param("actorId") actorId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignId, instanceId, request);
    return this.management.equipment(instanceId, request.user!.id, actorId);
  }
  @Post(":campaignInstanceId/creature-embodiments/:actorId/equipment")
  @HttpCode(HttpStatus.OK)
  async changeEquipment(
    @Param("campaignDefinitionId") campaignId: string,
    @Param("campaignInstanceId") instanceId: string,
    @Param("actorId") actorId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ChangeActorEquipmentDto,
  ) {
    await this.scope(campaignId, instanceId, request);
    return this.management.changeEquipment(
      instanceId,
      request.user!.id,
      actorId,
      dto,
    );
  }

  @Get()
  list(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    return this.instances.list(
      request.user!.id,
      campaignDefinitionId,
      page.limit,
      page.offset,
    );
  }

  @Post()
  create(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceDto,
  ) {
    return this.instances.create(
      dto,
      request.user!.id,
      request.user!.displayName,
      campaignDefinitionId,
    );
  }

  @Get(":campaignInstanceId")
  detail(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.instances.get(
      campaignInstanceId,
      request.user!.id,
      campaignDefinitionId,
    );
  }

  @Post(":campaignInstanceId/actions/validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.validate(campaignInstanceId, request.user!.id);
  }

  @Post(":campaignInstanceId/actions/change-status")
  @HttpCode(HttpStatus.OK)
  async updateLifecycle(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceLifecycleDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.updateLifecycle(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/runtime/preparation")
  async preparation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.preparation(campaignInstanceId, request.user!.id);
  }

  @Put(":campaignInstanceId/runtime/preparation")
  async updatePreparation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstancePreparationDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.updatePreparation(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/plots")
  async plots(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.plots(campaignInstanceId, request.user!.id);
  }

  @Patch(":campaignInstanceId/plots/:plotDefinitionId")
  async updatePlot(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("plotDefinitionId") plotDefinitionId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstancePlotDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.updatePlot(
      campaignInstanceId,
      plotDefinitionId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/placements")
  async placements(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.placements(campaignInstanceId, request.user!.id);
  }

  @Post(":campaignInstanceId/placements/:realizationId/actions/:action")
  @HttpCode(HttpStatus.OK)
  async decidePlacement(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("realizationId") realizationId: string,
    @Param("action") action: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: DecideCampaignInstancePlacementDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    if (action !== dto.action) {
      throw new BadRequestException(
        "The placement action does not match the request path.",
      );
    }
    return this.management.decidePlacement(
      campaignInstanceId,
      realizationId,
      request.user!.id,
      dto,
    );
  }

  @Put(":campaignInstanceId/creature-embodiments/:actorId/position")
  async placeActor(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("actorId") actorId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PlaceCampaignInstanceActorDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.placeActor(
      campaignInstanceId,
      request.user!.id,
      actorId,
      dto,
    );
  }

  @Get(":campaignInstanceId/creature-embodiments")
  async embodiments(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.embodiments(campaignInstanceId, request.user!.id);
  }

  @Get(":campaignInstanceId/roster")
  async roster(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.roster(campaignInstanceId, request.user!.id);
  }

  @Get(":campaignInstanceId/memberships")
  async memberships(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    const roster = await this.management.roster(
      campaignInstanceId,
      request.user!.id,
    );
    return {
      campaignInstanceId: roster.campaignInstanceId,
      campaignInstanceName: roster.campaignInstanceName,
      items: roster.memberships,
      total: roster.memberships.length,
    };
  }

  @Get(":campaignInstanceId/memberships/:membershipId")
  async membershipDetail(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("membershipId") membershipId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.membershipDetail(
      campaignInstanceId,
      membershipId,
      request.user!.id,
    );
  }

  @Get(":campaignInstanceId/characters")
  async characters(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    const roster = await this.management.roster(
      campaignInstanceId,
      request.user!.id,
    );
    return {
      campaignInstanceId: roster.campaignInstanceId,
      campaignInstanceName: roster.campaignInstanceName,
      items: roster.characters,
      total: roster.characters.length,
    };
  }

  @Get(":campaignInstanceId/characters/:characterId")
  async characterDetail(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.characterDetail(
      campaignInstanceId,
      characterId,
      request.user!.id,
    );
  }

  @Post(":campaignInstanceId/characters")
  async createCharacter(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceCharacterDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.createCharacter(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Post(":campaignInstanceId/character-imports")
  async importCharacter(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ImportCampaignInstanceCharacterDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.importCharacter(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/character-imports/options")
  async characterImportOptions(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    const page = parsePagination(limit, offset);
    return this.charactersService.characterImportOptions(
      campaignInstanceId,
      request.user!.id,
      page.limit,
      page.offset,
    );
  }

  @Post(":campaignInstanceId/characters/:characterId/actions/change-status")
  @HttpCode(HttpStatus.OK)
  async changeCharacterStatus(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceCharacterStatusDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.changeCharacterStatus(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/character-options")
  async gmCharacterOptions(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.options(
      campaignInstanceId,
      request.user!.id,
      true,
    );
  }

  @Get(":campaignInstanceId/characters/:characterId/draft")
  async gmCharacterGet(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.get(
      campaignInstanceId,
      characterId,
      request.user!.id,
      true,
    );
  }

  @Patch(":campaignInstanceId/characters/:characterId/draft")
  async gmCharacterUpdate(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.update(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto,
      true,
    );
  }

  @Post(":campaignInstanceId/characters/:characterId/draft/attribute-rolls")
  async gmCharacterRollAttributes(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedPlayerCharacterDraftRevisionDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.rollAttributes(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto.expectedRevision,
      true,
    );
  }

  @Post(
    ":campaignInstanceId/characters/:characterId/draft/actions/submit-for-review",
  )
  async gmCharacterSubmitForReview(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ExpectedPlayerCharacterDraftRevisionDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.submitForReview(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto.expectedRevision,
      true,
    );
  }

  @Get(":campaignInstanceId/characters/:characterId/review")
  async characterReview(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.reviewDetail(
      campaignInstanceId,
      characterId,
      request.user!.id,
    );
  }

  @Post(":campaignInstanceId/characters/:characterId/actions/review")
  @HttpCode(HttpStatus.OK)
  async reviewCharacter(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ReviewCampaignInstanceCharacterDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.characterDraftsService.review(
      campaignInstanceId,
      characterId,
      request.user!.id,
      dto,
    );
  }

  @Post(":campaignInstanceId/memberships/:membershipId/actions/change-status")
  @HttpCode(HttpStatus.OK)
  async changeMembershipStatus(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("membershipId") membershipId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceMembershipStatusDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.changeMembershipStatus(
      campaignInstanceId,
      membershipId,
      request.user!.id,
      dto,
    );
  }

  @Post(
    ":campaignInstanceId/memberships/:membershipId/actions/select-character",
  )
  @HttpCode(HttpStatus.OK)
  async selectCharacter(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("membershipId") membershipId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: SelectCampaignInstanceCharacterDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.charactersService.selectCharacter(
      campaignInstanceId,
      membershipId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/agents/available")
  async availableAgents(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.availableAgents(
      campaignInstanceId,
      request.user!.id,
    );
  }

  @Post(":campaignInstanceId/invitations")
  async createInvitation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceInvitationDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.invitations.create(campaignInstanceId, request.user!.id, dto);
  }

  @Post(":campaignInstanceId/invitations/:invitationId/actions/retry")
  async retryInvitation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.invitations.retry(
      campaignInstanceId,
      invitationId,
      request.user!.id,
    );
  }

  @Delete(":campaignInstanceId/invitations/:invitationId")
  async revokeInvitation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.invitations.revoke(
      campaignInstanceId,
      invitationId,
      request.user!.id,
    );
  }

  @Post(":campaignInstanceId/agents")
  async configureAgent(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ConfigureCampaignInstanceAgentDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.configureAgent(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Patch(":campaignInstanceId/agents/:agentParticipationId/capabilities")
  async agentCapabilities(
    @Param("campaignDefinitionId") definitionId: string,
    @Param("campaignInstanceId") instanceId: string,
    @Param("agentParticipationId") participationId: string,
    @Body()
    input: {
      expectedObserve: string[];
      expectedAct: string[];
      observe: string[];
      act: string[];
    },
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(definitionId, instanceId, request);
    return this.management.updateAgentCapabilities(
      instanceId,
      participationId,
      request.user!.id,
      input,
    );
  }

  @Patch(":campaignInstanceId/agents/:agentParticipationId")
  async updateAgentStatus(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Param("agentParticipationId") agentParticipationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: UpdateCampaignInstanceAgentStatusDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.updateAgentStatus(
      campaignInstanceId,
      agentParticipationId,
      request.user!.id,
      dto,
    );
  }

  @Get(":campaignInstanceId/continuation")
  async continuation(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.continuation(campaignInstanceId, request.user!.id);
  }

  @Get(":campaignInstanceId/snapshots")
  async snapshots(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.management.versions(campaignInstanceId, request.user!.id);
  }

  @Post(":campaignInstanceId/migrations/preview")
  @HttpCode(HttpStatus.OK)
  async previewMigration(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PreviewCampaignInstanceMigrationDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.migrations.preview(
      campaignInstanceId,
      request.user!.id,
      dto,
      "migration",
    );
  }

  @Post(":campaignInstanceId/migrations")
  async applyMigration(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ApplyCampaignInstanceMigrationDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.migrations.apply(
      campaignInstanceId,
      request.user!.id,
      dto,
      "migration",
    );
  }

  @Post(":campaignInstanceId/restores/preview")
  @HttpCode(HttpStatus.OK)
  async previewRestore(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PreviewCampaignInstanceRestoreDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.migrations.previewRestore(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }

  @Post(":campaignInstanceId/restores")
  async applyRestore(
    @Param("campaignDefinitionId") campaignDefinitionId: string,
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: ApplyCampaignInstanceRestoreDto,
  ) {
    await this.scope(campaignDefinitionId, campaignInstanceId, request);
    return this.migrations.applyRestore(
      campaignInstanceId,
      request.user!.id,
      dto,
    );
  }
}

@ApiTags("current GM campaign instances")
@Controller("me/campaign-instances")
@UseGuards(GmGuard)
export class CampaignInstanceMeController {
  constructor(
    @Inject(CampaignInstancesService)
    private readonly instances: CampaignInstancesService,
  ) {}

  @Get()
  list(
    @Req() request: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = parsePagination(limit, offset);
    return this.instances.list(
      request.user!.id,
      undefined,
      page.limit,
      page.offset,
    );
  }

  @Get(":campaignInstanceId")
  detail(
    @Param("campaignInstanceId") campaignInstanceId: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.instances.get(campaignInstanceId, request.user!.id);
  }
}

function parsePagination(limitValue?: string, offsetValue?: string) {
  const limit =
    limitValue === undefined ? 200 : Number.parseInt(limitValue, 10);
  const offset =
    offsetValue === undefined ? 0 : Number.parseInt(offsetValue, 10);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new BadRequestException("The Campaign Instance page is invalid.");
  }
  return { limit, offset };
}
