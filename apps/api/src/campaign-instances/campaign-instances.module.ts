import { Module } from "@nestjs/common";
import { CampaignInstancesController } from "./campaign-instances.controller";
import { CampaignInstancesService } from "./campaign-instances.service";

@Module({
  controllers: [CampaignInstancesController],
  providers: [CampaignInstancesService],
  exports: [CampaignInstancesService],
})
export class CampaignInstancesModule {}
