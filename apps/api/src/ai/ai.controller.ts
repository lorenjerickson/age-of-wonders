import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { CampaignProposalRequestGate } from "./campaign-proposal-request-gate";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { OpenAiService } from "./openai.service";

const GENERATION_OUTPUT_PREVIEW_LENGTH = 600;

@ApiTags("ai")
@Controller("ai")
@UseGuards(GmGuard)
export class AiController {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly campaignGeneration: CampaignGenerationService,
    private readonly campaignProposalGate: CampaignProposalRequestGate,
    private readonly prisma: PrismaService,
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
    return this.campaignProposalGate.execute(
      {
        userId,
        clientAddress: request.ip ?? request.socket.remoteAddress ?? "unknown",
        idempotencyKey,
        requestFingerprint,
      },
      async () => {
        const result = await this.campaignGeneration.createDraftProposal(
          worldDefinitionSnapshotId,
          userId,
          dto.prompt,
        );
        const generation = await this.prisma.generation.create({
          data: {
            kind: "create-campaign",
            prompt: result.combinedPrompt,
            output: result.output,
            model: result.model,
            responseId: result.responseId,
            createdByUserId: userId,
            contextType: "world-definition-snapshot",
            contextId: worldDefinitionSnapshotId,
          },
        });
        return {
          draftProposal: result.draftProposal,
          generationId: generation.id,
          model: result.model,
          outputPreview: preview(result.output),
          outputTruncated:
            result.output.length > GENERATION_OUTPUT_PREVIEW_LENGTH,
        };
      },
    );
  }

  @Get("generations")
  @ApiOperation({ summary: "List recent generated content" })
  async listGenerations(@Req() request: Request & AuthenticatedRequest) {
    const generations = await this.prisma.generation.findMany({
      where: { createdByUserId: request.user!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        output: true,
        model: true,
        createdAt: true,
      },
    });
    return generations.map(({ output, ...generation }) => ({
      ...generation,
      outputPreview: preview(output),
      outputTruncated: output.length > GENERATION_OUTPUT_PREVIEW_LENGTH,
    }));
  }
}

function preview(value: string): string {
  return value.slice(0, GENERATION_OUTPUT_PREVIEW_LENGTH);
}
