import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GmGuard, SessionGuard, SystemAdministratorGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ContactProtector } from "../invitations/invitation-security";
import { Auth0Service } from "./auth0.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    Auth0Service,
    SessionGuard,
    GmGuard,
    SystemAdministratorGuard,
    ContactProtector,
  ],
  exports: [
    AuthService,
    SessionGuard,
    GmGuard,
    SystemAdministratorGuard,
    ContactProtector,
  ],
})
export class AuthModule {}
