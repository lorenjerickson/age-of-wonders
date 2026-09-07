import { Module } from "@nestjs/common";
import { QuickStartController } from "./quick-start.controller";
import { QuickStartService } from "./quick-start.service";
import { CampaignInstancesModule } from "../campaign-instances/campaign-instances.module";

@Module({
  imports: [CampaignInstancesModule],
  controllers: [QuickStartController],
  providers: [QuickStartService],
})
export class QuickStartModule {}
