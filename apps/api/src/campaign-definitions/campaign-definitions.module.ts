import { Module } from "@nestjs/common";
import { CampaignDefinitionsController } from "./campaign-definitions.controller";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { LegacyApiDeprecationInterceptor } from "../api-compat/legacy-api-deprecation.interceptor";
import { CampaignAuthoringController } from "./campaign-authoring.controller";

@Module({
  imports: [ModelRegistryModule],
  controllers: [CampaignAuthoringController, CampaignDefinitionsController],
  providers: [CampaignDefinitionsService, LegacyApiDeprecationInterceptor],
  exports: [CampaignDefinitionsService],
})
export class CampaignDefinitionsModule {}
