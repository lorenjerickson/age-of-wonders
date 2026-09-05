import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GmGuard, SessionGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, GmGuard],
  exports: [AuthService, SessionGuard, GmGuard],
})
export class AuthModule {}
