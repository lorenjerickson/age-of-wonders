import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { GmGuard } from "../auth/auth.guard";
import { ChangePlayerStandingDto } from "./dto/player.dto";
import { PlayersService } from "./players.service";

@ApiTags("players")
@Controller("players")
@UseGuards(GmGuard)
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  list(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("standing") standing?: string,
    @Query("q") search?: string,
  ) {
    const page = pagination(limit, offset);
    return this.players.list(page.limit, page.offset, standing, search);
  }

  @Get(":playerId")
  detail(@Param("playerId") playerId: string) {
    return this.players.detail(playerId);
  }

  @Post(":playerId/actions/change-standing")
  @HttpCode(HttpStatus.OK)
  changeStanding(
    @Param("playerId") playerId: string,
    @Body() dto: ChangePlayerStandingDto,
  ) {
    return this.players.changeStanding(playerId, dto);
  }
}

function pagination(limitValue?: string, offsetValue?: string) {
  const limit = limitValue === undefined ? 50 : Number(limitValue);
  const offset = offsetValue === undefined ? 0 : Number(offsetValue);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new BadRequestException("Pagination values are invalid.");
  }
  return { limit, offset };
}
