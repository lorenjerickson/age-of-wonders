import { CampaignSessionTableController } from "./campaign-session-table.controller";
import { CampaignSessionTableService } from "./campaign-session-table.service";
import { TerrainExplorationStore } from "./terrain-exploration-store.service";
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
import { CampaignInstanceCharacterDraftsController } from "./campaign-instance-character-drafts.controller";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";

@Module({
  imports: [NotificationsModule],
  controllers: [
    CampaignSessionTableController,
    CampaignInstanceHierarchyController,
    CampaignInstanceMeController,
    CampaignSessionsController,
    CampaignInvitationEntryController,
    CampaignSessionMeOverviewController,
    CampaignSessionMeController,
    CampaignInstanceCharacterDraftsController,
  ],
  providers: [
    CampaignSessionTableService,
    TerrainExplorationStore,
    CampaignInstancesService,
    CampaignInstanceManagementService,
    CampaignInstanceInvitationsService,
    CampaignInstanceMigrationsService,
    CampaignSessionService,
    CampaignInstanceCharactersService,
    CampaignInstanceCharacterDraftsService,
    InvitationTokenService,
    ContactProtector,
  ],
  exports: [CampaignInstancesService, CampaignSessionService],
})
export class CampaignInstancesModule {}
