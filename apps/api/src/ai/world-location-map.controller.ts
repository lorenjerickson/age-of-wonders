import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn } from "class-validator";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { isObject } from "../domain/domain-resource";
import { WorldDefinitionAuthoringService } from "../world-definitions/world-definition-authoring.service";
import { GeneratedMapService } from "./generated-map.service";
import { GenerationAuditService } from "./generation-audit.service";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import { CreateWorldDraftProposalDto } from "./dto/create-world-draft-proposal.dto";

export class GenerateLocationMapDto extends CreateWorldDraftProposalDto {
  @IsIn(["scenic", "overhead", "side-on"])
  orientation!: "scenic" | "overhead" | "side-on";
}

@Controller("ai/worlds/:worldId/atlas/locations/:locationId/map-proposals")
@UseGuards(GmGuard)
export class WorldLocationMapController {
  constructor(
    private readonly authoring: WorldDefinitionAuthoringService,
    private readonly maps: GeneratedMapService,
    private readonly paidRequests: PaidAiRequestGate,
    private readonly audit: GenerationAuditService,
  ) {}

  @Post()
  @HttpCode(200)
  generate(
    @Param("worldId") worldId: string,
    @Param("locationId") locationId: string,
    @Req() request: Request & AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: GenerateLocationMapDto,
  ) {
    const userId = request.user!.id;
    return this.paidRequests.executePrepared(
      {
        operationKind: "world-location-map",
        userId,
        clientAddress: request.ip ?? "unknown",
        idempotencyKey,
        requestFingerprint: createHash("sha256")
          .update(
            JSON.stringify([
              worldId,
              locationId,
              dto.expectedStorageRevision,
              dto.direction.trim(),
              dto.orientation,
            ]),
          )
          .digest("hex"),
      },
      async () => {
        const draft = await this.authoring.getActiveDraft(worldId, userId);
        if (draft.storageRevision !== dto.expectedStorageRevision)
          throw new ConflictException(
            "This World draft changed. Reload before generating a Map.",
          );
        const records: unknown[] = Array.isArray(draft.records)
          ? draft.records
          : [];
        const record = records.find(
          (record) =>
            isObject(record) &&
            record.resourceType === "locations" &&
            record.sourceId === locationId,
        );
        if (!isObject(record) || !isObject(record.payload))
          throw new NotFoundException(
            "The Location was not found in this World draft.",
          );
        // Only public description and the GM's explicit image direction enter the prompt.
        return {
          name: record.payload.name,
          description: record.payload.description,
          kind: record.payload.kind,
          image: { orientation: dto.orientation },
        };
      },
      async (location) => {
        const result = await this.maps.generate(
          location,
          ["location-map"],
          `${dto.orientation} view. ${dto.direction.trim()}`,
          { worldId, userId },
        );
        return {
          image: result.data.image,
          asset: {
            id: result.asset.id,
            originalName: result.asset.originalName,
            mimeType: result.asset.mimeType,
          },
          responseId: result.imageResponseId,
          storageRevision: dto.expectedStorageRevision,
        };
      },
      async (result) => {
        await this.audit.record({
          kind: "world-location-map",
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
