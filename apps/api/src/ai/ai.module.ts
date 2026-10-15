import { WorldArtworkController } from "./world-artwork.controller";
import {
  WorldLocationMapController,
  WorldDraftLocationMapController,
} from "./world-location-map.controller";
import { Module } from "@nestjs/common";
import { DomainModule } from "../domain/domain.module";
import { MediaModule } from "../media/media.module";
import { AiPromptService } from "./ai-prompt.service";
import { AiController } from "./ai.controller";
import { GeneratedMapService } from "./generated-map.service";
import { OpenAiService } from "./openai.service";
import { GeneratedCreatureImagesService } from "./generated-creature-images.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { GenerationAuditService } from "./generation-audit.service";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import { WorldDefinitionsModule } from "../world-definitions/world-definitions.module";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { WorldDraftProposalService } from "./world-draft-proposal.service";

@Module({
  imports: [
    DomainModule,
    MediaModule,
    WorldDefinitionsModule,
    ModelRegistryModule,
  ],
  controllers: [
    AiController,
    WorldLocationMapController,
    WorldDraftLocationMapController,
    WorldArtworkController,
  ],
  // Legacy direct-to-DomainRecord generators are intentionally not injectable.
  // Their retained codecs/fixtures decode old content; current generation uses
  // scoped proposals and explicit owner-validated apply.
  providers: [
    AiPromptService,
    OpenAiService,
    GeneratedMapService,
    GeneratedCreatureImagesService,
    GeneratedItemImageService,
    CampaignGenerationService,
    GenerationAuditService,
    PaidAiRequestGate,
    WorldDraftProposalService,
  ],
  exports: [OpenAiService, PaidAiRequestGate, GenerationAuditService],
})
export class AiModule {}
