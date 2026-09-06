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
import { CampaignSessionsController } from "./campaign-sessions.controller";
import { LegacyApiDeprecationInterceptor } from "./legacy-api-deprecation.interceptor";
import {
  CampaignInvitationEntryController,
  CampaignSessionMeController,
  CampaignSessionMeOverviewController,
} from "./campaign-participation.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [
    CampaignInstancesController,
    CampaignInstanceParticipationController,
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
    InvitationTokenService,
    ContactProtector,
    LegacyApiDeprecationInterceptor,
  ],
  exports: [CampaignInstancesService],
})
export class CampaignInstancesModule {}
