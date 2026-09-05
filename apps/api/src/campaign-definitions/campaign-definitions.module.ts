import { Module } from "@nestjs/common";
import { CampaignDefinitionsController } from "./campaign-definitions.controller";
import { CampaignDefinitionsService } from "./campaign-definitions.service";

@Module({
  controllers: [CampaignDefinitionsController],
  providers: [CampaignDefinitionsService],
  exports: [CampaignDefinitionsService],
})
export class CampaignDefinitionsModule {}
