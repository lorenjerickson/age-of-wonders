import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GmGuard, SessionGuard, SystemAdministratorGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ContactProtector } from "../invitations/invitation-security";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionGuard,
    GmGuard,
    SystemAdministratorGuard,
    ContactProtector,
  ],
  exports: [AuthService, SessionGuard, GmGuard, SystemAdministratorGuard],
})
export class AuthModule {}
