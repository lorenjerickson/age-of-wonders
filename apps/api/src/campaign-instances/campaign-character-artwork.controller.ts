import {
  Body,
  ConflictException,
  Controller,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsOptional,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { OpenAiService } from "../ai/openai.service";
import { PaidAiRequestGate } from "../ai/paid-ai-request-gate";
import { GenerationAuditService } from "../ai/generation-audit.service";
import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";
import { roleSettings } from "../ai/generated-creature-images.service";

export class GenerateCharacterPortraitDto {
  @IsOptional()
  @IsIn(["portrait", "overheadToken", "paperDollToken"])
  role?: "portrait" | "overheadToken" | "paperDollToken";
  @IsInt() @Min(1) expectedRevision!: number;
  @IsString() @MinLength(1) @MaxLength(4000) direction!: string;
}
@Controller(
  "campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId/draft",
)
@UseGuards(GmGuard)
export class CampaignCharacterArtworkController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: CampaignInstanceCharacterDraftsService,
    private readonly openAi: OpenAiService,
    private readonly paid: PaidAiRequestGate,
    private readonly media: MediaService,
    private readonly storage: ObjectStorageService,
    private readonly audit: GenerationAuditService,
  ) {}
  @Post(["portrait", "artwork"])
  async generate(
    @Param("campaignDefinitionId") definitionId: string,
    @Param("campaignInstanceId") instanceId: string,
    @Param("characterId") characterId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: GenerateCharacterPortraitDto,
  ) {
    const userId = request.user!.id;
    const role = dto.role ?? "portrait";
    const instance = await this.prisma.campaignInstance.findFirst({
      where: {
        id: instanceId,
        campaignDefinitionId: definitionId,
        ownerUserId: userId,
      },
      select: { id: true },
    });
    if (!instance)
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    // Recheck access even on a cached paid-request response.
    await this.drafts.get(instanceId, characterId, userId, true);
    return this.paid.executePrepared(
      {
        operationKind: "character-artwork",
        userId,
        clientAddress: request.ip ?? "unknown",
        idempotencyKey,
        requestFingerprint: createHash("sha256")
          .update(JSON.stringify([definitionId, instanceId, characterId, dto]))
          .digest("hex"),
      },
      async () => {
        const draft = await this.drafts.get(
          instanceId,
          characterId,
          userId,
          true,
        );
        if (
          draft.revision !== dto.expectedRevision ||
          draft.status !== "in-progress"
        )
          throw new ConflictException(
            "Reload an editable Character draft before generating artwork.",
          );
        return draft;
      },
      async (draft) => {
        const image = await this.openAi.generateImage(
          `Create ${role} artwork for the role-playing Character ${draft.name || "the Character"}.\n${draft.biography || ""}\n${dto.direction}\n${roleSettings[role].fallback}`,
          roleSettings[role],
        );
        const tags = ["ai-generated", `character-${role}`];
        const upload = await this.storage.upload(
          Readable.from(image.buffer),
          `character-${role}.webp`,
          image.mimeType,
          "creatures",
          tags,
        );
        const asset = await this.media.create(upload, tags, {
          userId,
          scopeType: "character-draft",
          scopeId: characterId,
        });
        return { assetId: asset.id, responseId: image.responseId };
      },
      async (result) => {
        await this.audit.record({
          kind: `character-${role}`,
          ownerUserId: userId,
          contextType: "character-draft",
          contextId: characterId,
          model: "image-generation",
          providerResponseId: result.responseId,
        });
      },
    );
  }
}
