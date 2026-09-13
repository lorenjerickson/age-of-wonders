import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from "class-validator";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldDefinitionAuthoringService } from "../world-definitions/world-definition-authoring.service";
import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { OpenAiService } from "./openai.service";
import { roleSettings } from "./generated-creature-images.service";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import { GenerationAuditService } from "./generation-audit.service";

export class GenerateWorldArtworkDto {
  @IsInt() @Min(1) expectedStorageRevision!: number;
  @IsIn(["portrait", "overheadToken", "paperDollToken", "item"])
  role!: "portrait" | "overheadToken" | "paperDollToken" | "item";
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/) name!: string;
  @IsString() @MaxLength(8000) description!: string;
  @IsString() @MaxLength(4000) direction!: string;
}

@Controller("ai/worlds/:worldId/artwork-proposals")
@UseGuards(GmGuard)
export class WorldArtworkController {
  constructor(
    private readonly authoring: WorldDefinitionAuthoringService,
    private readonly openAi: OpenAiService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaService,
    private readonly paid: PaidAiRequestGate,
    private readonly audit: GenerationAuditService,
  ) {}

  @Post()
  @HttpCode(200)
  generate(
    @Param("worldId") worldId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: GenerateWorldArtworkDto,
  ) {
    const userId = request.user!.id;
    return this.paid.executePrepared(
      {
        operationKind: "world-artwork",
        userId,
        clientAddress: request.ip ?? "unknown",
        idempotencyKey,
        requestFingerprint: createHash("sha256")
          .update(JSON.stringify([worldId, dto]))
          .digest("hex"),
      },
      async () => {
        const draft = await this.authoring.getActiveDraft(worldId, userId);
        if (draft.storageRevision !== dto.expectedStorageRevision)
          throw new ConflictException(
            "This World draft changed. Reload before generating artwork.",
          );
      },
      async () => {
        const settings =
          dto.role === "item"
            ? {
                size: "1024x1024" as const,
                background: "transparent" as const,
                fallback:
                  "Create a square inventory illustration of one complete standalone item, centered with generous padding at a clear three-quarter product angle. No person, hands, scenery, frame, text, or UI.",
              }
            : roleSettings[dto.role];
        const prompt = [
          `Create the ${dto.role === "item" ? "inventory image" : dto.role} for ${dto.name.trim()}.`,
          dto.description,
          dto.direction,
          "Preserve the described anatomy, materials, palette, clothing, equipment, and identifying marks. Render only the requested subject; no labels or prose.",
          settings.fallback,
        ]
          .filter(Boolean)
          .join("\n\n");
        const generated = await this.openAi.generateImage(prompt, settings);
        const tags = [
          "ai-generated",
          dto.role === "item" ? "item-image" : "creature-image",
          `role:${dto.role}`,
        ];
        const upload = await this.storage.upload(
          Readable.from(generated.buffer),
          `${dto.name}-${dto.role}.webp`,
          generated.mimeType,
          dto.role === "item" ? "items" : "creatures",
          tags,
        );
        const asset = await this.media.createForWorld(
          worldId,
          userId,
          upload,
          tags,
        );
        const label = {
          portrait: "Portrait",
          overheadToken: "Overhead token",
          paperDollToken: "Side-view token",
          item: "Inventory image",
        }[dto.role];
        return {
          image: {
            assetId: asset.id,
            altText: `${label} of ${dto.name.trim()}`,
            width: generated.width,
            height: generated.height,
            mimeType: generated.mimeType,
          },
          storageRevision: dto.expectedStorageRevision,
          responseId: generated.responseId,
        };
      },
      async (result) => {
        await this.audit.record({
          kind: "world-artwork",
          ownerUserId: userId,
          contextType: "world-definition-draft",
          contextId: worldId,
          model: "image-generation",
          providerResponseId: result.responseId,
        });
      },
    );
  }
}
