import { Module } from "@nestjs/common";
import { DomainModule } from "../domain/domain.module";
import { NotificationsModule } from "../notifications/notifications.module";
import {
  ContactProtector,
  InvitationTokenService,
} from "./invitation-security";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  imports: [DomainModule, NotificationsModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationTokenService, ContactProtector],
  exports: [InvitationsService],
})
export class InvitationsModule {}
