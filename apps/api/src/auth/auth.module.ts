import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GmGuard, SessionGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ContactProtector } from "../invitations/invitation-security";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, GmGuard, ContactProtector],
  exports: [AuthService, SessionGuard, GmGuard],
})
export class AuthModule {}
