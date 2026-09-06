import { Module } from "@nestjs/common";
import { CampaignInstancesController } from "./campaign-instances.controller";
import { CampaignInstancesService } from "./campaign-instances.service";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ContactProtector, InvitationTokenService } from "../invitations/invitation-security";
import { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";

@Module({
  imports: [NotificationsModule],
  controllers: [CampaignInstancesController],
  providers: [
    CampaignInstancesService,
    CampaignInstanceManagementService,
    CampaignInstanceInvitationsService,
    CampaignInstanceMigrationsService,
    InvitationTokenService,
    ContactProtector,
  ],
  exports: [CampaignInstancesService],
})
export class CampaignInstancesModule {}
