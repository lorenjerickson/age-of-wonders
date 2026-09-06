import { Module } from "@nestjs/common";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { CampaignAuthoringController } from "./campaign-authoring.controller";

@Module({
  imports: [ModelRegistryModule],
  controllers: [CampaignAuthoringController],
  providers: [CampaignDefinitionsService],
  exports: [CampaignDefinitionsService],
})
export class CampaignDefinitionsModule {}
