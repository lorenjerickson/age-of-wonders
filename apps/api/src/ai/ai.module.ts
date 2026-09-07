import { Module } from "@nestjs/common";
import { DomainModule } from "../domain/domain.module";
import { MediaModule } from "../media/media.module";
import { AiPromptService } from "./ai-prompt.service";
import { AiController } from "./ai.controller";
import { GeneratedMapService } from "./generated-map.service";
import { LocationGenerationService } from "./location-generation.service";
import { OpenAiService } from "./openai.service";
import { ContentPipeline } from "./pipelines/content.pipeline";
import { WorldGenerationService } from "./world-generation.service";
import { CreatureGenerationService } from "./creature-generation.service";
import { GeneratedCreatureImagesService } from "./generated-creature-images.service";
import { ArmorGenerationService } from "./armor-generation.service";
import { ItemGenerationService } from "./item-generation.service";
import { GeneratedItemImageService } from "./generated-item-image.service";
import { WeaponGenerationService } from "./weapon-generation.service";
import { CampaignGenerationService } from "./campaign-generation.service";
import { GenerationAuditService } from "./generation-audit.service";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import { WorldDefinitionsModule } from "../world-definitions/world-definitions.module";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { WorldDraftProposalService } from "./world-draft-proposal.service";

@Module({
  imports: [DomainModule, MediaModule, WorldDefinitionsModule, ModelRegistryModule],
  controllers: [AiController],
  providers: [
    AiPromptService,
    OpenAiService,
    GeneratedMapService,
    GeneratedCreatureImagesService,
    CreatureGenerationService,
    ArmorGenerationService,
    ItemGenerationService,
    GeneratedItemImageService,
    WeaponGenerationService,
    LocationGenerationService,
    ContentPipeline,
    WorldGenerationService,
    CampaignGenerationService,
    GenerationAuditService,
    PaidAiRequestGate,
    WorldDraftProposalService,
  ],
  exports: [OpenAiService],
})
export class AiModule {}
