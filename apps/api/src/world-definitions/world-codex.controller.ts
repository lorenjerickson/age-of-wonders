import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsObject,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { WorldAccessGuard } from "./world-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldCodexService } from "./world-codex.service";
export class CodexRevisionDto {
  @IsString() @MinLength(1) @MaxLength(240) expectedDraftId!: string;
  @IsInt() @Min(1) expectedStorageRevision!: number;
}
export class SaveCodexEntryDto extends CodexRevisionDto {
  @IsObject() entry!: Record<string, unknown>;
}
@Controller("worlds/:worldId/codex/:collection")
@UseGuards(WorldAccessGuard)
export class WorldCodexController {
  constructor(private readonly codex: WorldCodexService) {}
  @Get() list(
    @Param("worldId") worldId: string,
    @Param("collection") collection: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.codex.list(worldId, req.user!.id, collection);
  }
  @Post() create(
    @Param("worldId") worldId: string,
    @Param("collection") collection: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveCodexEntryDto,
  ) {
    return this.codex.upsert(worldId, req.user!.id, collection, dto, dto.entry);
  }
  @Put(":id") update(
    @Param("worldId") worldId: string,
    @Param("collection") collection: string,
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveCodexEntryDto,
  ) {
    return this.codex.upsert(
      worldId,
      req.user!.id,
      collection,
      dto,
      dto.entry,
      id,
    );
  }
  @Delete(":id") remove(
    @Param("worldId") worldId: string,
    @Param("collection") collection: string,
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CodexRevisionDto,
  ) {
    return this.codex.remove(worldId, req.user!.id, collection, dto, id);
  }
}
