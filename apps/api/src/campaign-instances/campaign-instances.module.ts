import { Module } from "@nestjs/common";
import { CampaignInstancesController } from "./campaign-instances.controller";
import { CampaignInstancesService } from "./campaign-instances.service";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import { NotificationsModule } from "../notifications/notifications.module";
import {
  ContactProtector,
  InvitationTokenService,
} from "../invitations/invitation-security";
import { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";
import { CampaignSessionService } from "./campaign-session.service";
import { CampaignInstanceParticipationController } from "./campaign-instance-participation.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [
    CampaignInstancesController,
    CampaignInstanceParticipationController,
  ],
  providers: [
    CampaignInstancesService,
    CampaignInstanceManagementService,
    CampaignInstanceInvitationsService,
    CampaignInstanceMigrationsService,
    CampaignSessionService,
    InvitationTokenService,
    ContactProtector,
  ],
  exports: [CampaignInstancesService],
})
export class CampaignInstancesModule {}
