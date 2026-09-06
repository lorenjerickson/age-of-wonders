import { Module } from "@nestjs/common";
import { ContactProtector } from "../invitations/invitation-security";
import { PlayersController } from "./players.controller";
import { PlayersService } from "./players.service";

@Module({
  controllers: [PlayersController],
  providers: [PlayersService, ContactProtector],
})
export class PlayersModule {}
