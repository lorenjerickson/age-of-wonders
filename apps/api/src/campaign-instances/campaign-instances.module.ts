import { Module } from "@nestjs/common";
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
import {
  CampaignInstanceHierarchyController,
  CampaignInstanceMeController,
} from "./campaign-instance-hierarchy.controller";
import { CampaignSessionsController } from "./campaign-sessions.controller";
import {
  CampaignInvitationEntryController,
  CampaignSessionMeController,
  CampaignSessionMeOverviewController,
} from "./campaign-participation.controller";
import { CampaignInstanceCharactersService } from "./campaign-instance-characters.service";

@Module({
  imports: [NotificationsModule],
  controllers: [
    CampaignInstanceHierarchyController,
    CampaignInstanceMeController,
    CampaignSessionsController,
    CampaignInvitationEntryController,
    CampaignSessionMeOverviewController,
    CampaignSessionMeController,
  ],
  providers: [
    CampaignInstancesService,
    CampaignInstanceManagementService,
    CampaignInstanceInvitationsService,
    CampaignInstanceMigrationsService,
    CampaignSessionService,
    CampaignInstanceCharactersService,
    InvitationTokenService,
    ContactProtector,
  ],
  exports: [CampaignInstancesService],
})
export class CampaignInstancesModule {}
