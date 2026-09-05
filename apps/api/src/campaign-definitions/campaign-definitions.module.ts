import { Module } from "@nestjs/common";
import { CampaignDefinitionsController } from "./campaign-definitions.controller";
import { CampaignDefinitionsService } from "./campaign-definitions.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";

@Module({
  imports: [ModelRegistryModule],
  controllers: [CampaignDefinitionsController],
  providers: [CampaignDefinitionsService],
  exports: [CampaignDefinitionsService],
})
export class CampaignDefinitionsModule {}
