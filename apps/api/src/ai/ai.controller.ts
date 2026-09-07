import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CampaignGenerationService } from "./campaign-generation.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import {
  GenerationAuditService,
  type RecordGenerationAuditInput,
} from "./generation-audit.service";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import { CreateWorldDraftProposalDto } from "./dto/create-world-draft-proposal.dto";
import {
  WorldDraftProposalService,
  type WorldDraftProposalKind,
} from "./world-draft-proposal.service";

@ApiTags("ai")
@Controller("ai")
@UseGuards(GmGuard)
export class AiController {
  constructor(
    private readonly campaignGeneration: CampaignGenerationService,
    private readonly paidRequests: PaidAiRequestGate,
    private readonly generationAudit: GenerationAuditService,
    private readonly worldDraftProposals: WorldDraftProposalService,
  ) {}

  @Post(
    "world-definition-snapshots/:worldDefinitionSnapshotId/campaign-definition-draft-proposals",
  )
  @ApiOperation({
    summary:
      "Propose Campaign Definition draft content from an immutable World capture",
  })
  @ApiParam({
    name: "worldDefinitionSnapshotId",
    description: "Explicit immutable World Definition snapshot ID",
  })
  async createCampaign(
    @Param("worldDefinitionSnapshotId") worldDefinitionSnapshotId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateCampaignDto,
  ) {
    const userId = request.user!.id;
    const requestFingerprint = createHash("sha256")
      .update(worldDefinitionSnapshotId)
      .update("\0")
      .update(dto.prompt.trim())
      .digest("hex");
    return this.paidRequests
      .execute(
        {
          operationKind: "campaign-definition-proposal",
          userId,
          clientAddress:
            request.ip ?? request.socket.remoteAddress ?? "unknown",
          idempotencyKey,
          requestFingerprint,
        },
        async () => {
          const result = await this.campaignGeneration.createDraftProposal(
            worldDefinitionSnapshotId,
            userId,
            dto.prompt,
          );
          return {
            draftProposal: result.draftProposal,
            model: result.model,
            providerResponseId: result.responseId,
          };
        },
        async (result) => {
          await this.recordGeneration({
            kind: "campaign-definition-proposal",
            model: result.model,
            providerResponseId: result.providerResponseId,
            ownerUserId: userId,
            contextType: "world-definition-snapshot",
            contextId: worldDefinitionSnapshotId,
          });
        },
      )
      .then((result) => ({
        draftProposal: result.draftProposal,
        model: result.model,
      }));
  }

  @Post("worlds/:worldId/draft/location-proposals")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Propose editable Location fields for an owned World draft",
  })
  createLocationProposal(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateWorldDraftProposalDto,
  ) {
    return this.createWorldDraftProposal(
      "location",
      worldId,
      request,
      idempotencyKey,
      dto,
    );
  }

  @Post("worlds/:worldId/draft/creature-proposals")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Propose editable Creature fields for an owned World draft",
  })
  createCreatureProposal(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateWorldDraftProposalDto,
  ) {
    return this.createWorldDraftProposal(
      "creature",
      worldId,
      request,
      idempotencyKey,
      dto,
    );
  }

  @Post("worlds/:worldId/draft/item-proposals")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Propose editable Item fields for an owned World draft",
  })
  createItemProposal(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateWorldDraftProposalDto,
  ) {
    return this.createWorldDraftProposal(
      "item",
      worldId,
      request,
      idempotencyKey,
      dto,
    );
  }

  @Get("generations")
  @ApiOperation({ summary: "List recent generated content" })
  async listGenerations(@Req() request: Request & AuthenticatedRequest) {
    return this.generationAudit.listForOwner(request.user!.id);
  }

  private async createWorldDraftProposal(
    kind: WorldDraftProposalKind,
    worldId: string,
    request: Request & AuthenticatedRequest,
    idempotencyKey: string | undefined,
    dto: CreateWorldDraftProposalDto,
  ) {
    const userId = request.user!.id;
    const fingerprint = createHash("sha256")
      .update(kind)
      .update("\0")
      .update(worldId)
      .update("\0")
      .update(String(dto.expectedStorageRevision))
      .update("\0")
      .update(dto.parentLocationId ?? "")
      .update("\0")
      .update(dto.direction.trim())
      .digest("hex");
    return this.paidRequests
      .executePrepared(
        {
          operationKind: `world-${kind}-proposal`,
          userId,
          clientAddress:
            request.ip ?? request.socket.remoteAddress ?? "unknown",
          idempotencyKey,
          requestFingerprint: fingerprint,
        },
        () => this.worldDraftProposals.prepare(kind, worldId, userId, dto),
        async (prepared) => {
          const result =
            await this.worldDraftProposals.proposePrepared(prepared);
          return {
            proposal: result.proposal,
            model: result.provider.model,
            providerResponseId: result.provider.responseId,
          };
        },
        async (result) => {
          await this.recordGeneration({
            kind: `world-${kind}-proposal`,
            ownerUserId: userId,
            contextType: "world-definition-draft",
            contextId: worldId,
            model: result.model,
            providerResponseId: result.providerResponseId,
          });
        },
      )
      .then((result) => ({
        proposal: result.proposal,
        model: result.model,
      }));
  }

  private async recordGeneration(
    input: RecordGenerationAuditInput,
  ): Promise<void> {
    try {
      await this.generationAudit.record(input);
    } catch {
      throw new ServiceUnavailableException(
        "The AI proposal was prepared, but its private audit could not be recorded. Retry with the same request key.",
      );
    }
  }
}
