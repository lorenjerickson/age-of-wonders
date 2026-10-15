import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Prisma } from "@prisma/client";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
class CreateAccessDto {
  @IsString() @MinLength(1) @MaxLength(240) playerId!: string;
  @IsIn(["viewer", "editor"]) role!: "viewer" | "editor";
}
class AccessRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
class UpdateAccessDto extends AccessRevisionDto {
  @IsIn(["viewer", "editor"]) role!: "viewer" | "editor";
}
@Controller("worlds/:worldId/access")
@UseGuards(GmGuard)
export class WorldAccessController {
  constructor(private readonly prisma: PrismaService) {}
  private async owner(worldId: string, userId: string) {
    const world = await this.prisma.worldDefinition.findFirst({
      where: { id: worldId, ownerUserId: userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!world) throw new NotFoundException("The World was not found.");
  }
  @Get() async list(
    @Param("worldId") worldId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.owner(worldId, req.user!.id);
    const entries = await this.prisma.worldAccessEntry.findMany({
      where: { worldDefinitionId: worldId },
      include: { player: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: entries.map((e) => ({
        id: e.id,
        playerId: e.playerId,
        displayName: e.player.displayName,
        role: e.role,
        revision: e.revision,
      })),
    };
  }
  @Post() async create(
    @Param("worldId") worldId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAccessDto,
  ) {
    await this.owner(worldId, req.user!.id);
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: dto.playerId, standing: "ACTIVE" },
      select: { id: true },
    });
    if (!player) throw new BadRequestException("Choose an active Player.");
    try {
      await this.prisma.worldAccessEntry.create({
        data: {
          worldDefinitionId: worldId,
          playerId: dto.playerId,
          role: dto.role,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "This Player is already listed for this World.",
        );
      throw error;
    }
    return this.list(worldId, req);
  }
  @Put(":id") async update(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateAccessDto,
  ) {
    await this.owner(worldId, req.user!.id);
    const result = await this.prisma.worldAccessEntry.updateMany({
      where: { id, worldDefinitionId: worldId, revision: dto.expectedRevision },
      data: { role: dto.role, revision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException(
        "The access entry changed. Reload before saving.",
      );
    return this.list(worldId, req);
  }
  @Delete(":id") async remove(
    @Param("worldId") worldId: string,
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: AccessRevisionDto,
  ) {
    await this.owner(worldId, req.user!.id);
    const result = await this.prisma.worldAccessEntry.deleteMany({
      where: { id, worldDefinitionId: worldId, revision: dto.expectedRevision },
    });
    if (result.count !== 1)
      throw new ConflictException(
        "The access entry changed. Reload before deleting.",
      );
    return this.list(worldId, req);
  }
}
