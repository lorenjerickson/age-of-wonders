import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PlayerServerStanding as PrismaStanding } from "@prisma/client";
import { ContactProtector } from "../invitations/invitation-security";
import { PrismaService } from "../prisma/prisma.service";
import type { ChangePlayerStandingDto } from "./dto/player.dto";

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactProtector,
  ) {}

  async list(
    limit: number,
    offset: number,
    standing?: string,
    search?: string,
  ) {
    const normalizedStanding = standing ? standing.toUpperCase() : undefined;
    if (
      normalizedStanding &&
      !["ACTIVE", "INACTIVE", "BANNED"].includes(normalizedStanding)
    ) {
      throw new BadRequestException("Player standing filter is invalid.");
    }
    const query = search?.trim();
    if (query && query.length > 120) {
      throw new BadRequestException("Player search is too long.");
    }
    const where = {
      ...(normalizedStanding
        ? { standing: normalizedStanding as PrismaStanding }
        : {}),
      ...(query
        ? { displayName: { contains: query, mode: "insensitive" as const } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.playerProfile.findMany({
        where,
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          displayName: true,
          standing: true,
          emailEncrypted: true,
          phoneEncrypted: true,
          campaignMemberships: {
            select: { _count: { select: { characters: true } } },
          },
        },
      }),
      this.prisma.playerProfile.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        playerId: row.id,
        displayName: row.displayName,
        standing: row.standing.toLowerCase(),
        hasEmail: Boolean(row.emailEncrypted),
        hasPhone: Boolean(row.phoneEncrypted),
        membershipCount: row.campaignMemberships.length,
        characterCount: row.campaignMemberships.reduce(
          (totalCharacters, membership) =>
            totalCharacters + membership._count.characters,
          0,
        ),
      })),
      total,
      limit,
      offset,
    };
  }

  async detail(playerId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      include: {
        providerAssociations: {
          orderBy: [{ providerKey: "asc" }, { createdAt: "asc" }],
          select: {
            providerKey: true,
            status: true,
            associatedAt: true,
          },
        },
        campaignMemberships: {
          orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
          include: {
            campaignInstance: {
              select: {
                id: true,
                name: true,
                campaignDefinition: { select: { id: true, name: true } },
              },
            },
            characters: {
              orderBy: [{ characterName: "asc" }, { characterId: "asc" }],
            },
          },
        },
      },
    });
    if (!player) {
      throw new NotFoundException("The selected Player was not found.");
    }
    const memberships = player.campaignMemberships.map((membership) => ({
      membershipId: membership.id,
      campaignDefinitionId: membership.campaignInstance.campaignDefinition.id,
      campaignDefinitionName:
        membership.campaignInstance.campaignDefinition.name,
      campaignInstanceId: membership.campaignInstance.id,
      campaignInstanceName: membership.campaignInstance.name,
      status: membership.status.toLowerCase(),
      joinedAt: membership.joinedAt.toISOString(),
      characters: membership.characters.map((character) => ({
        characterId: character.characterId,
        name: character.characterName,
        status: character.status.toLowerCase(),
        ...(character.origin === "ONE_WAY_IMPORT" &&
        character.sourceCampaignInstanceName &&
        character.sourceCharacterName
          ? {
              importedFrom: {
                campaignInstanceName: character.sourceCampaignInstanceName,
                characterName: character.sourceCharacterName,
              },
            }
          : {}),
      })),
    }));
    return {
      playerId: player.id,
      displayName: player.displayName,
      standing: player.standing.toLowerCase(),
      hasEmail: Boolean(player.emailEncrypted),
      hasPhone: Boolean(player.phoneEncrypted),
      email: player.emailEncrypted
        ? this.contacts.decrypt(player.emailEncrypted)
        : undefined,
      phone: player.phoneEncrypted
        ? this.contacts.decrypt(player.phoneEncrypted)
        : undefined,
      membershipCount: memberships.length,
      characterCount: memberships.reduce(
        (count, membership) => count + membership.characters.length,
        0,
      ),
      authenticationProviders: player.providerAssociations.map(
        (association) => ({
          provider: association.providerKey,
          status: association.status.toLowerCase(),
          associatedAt: association.associatedAt?.toISOString(),
        }),
      ),
      memberships,
    };
  }

  async changeStanding(playerId: string, dto: ChangePlayerStandingDto) {
    if (dto.expectedStanding === dto.targetStanding) {
      throw new BadRequestException("Player standing is already unchanged.");
    }
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { displayName: true },
    });
    if (!player) {
      throw new NotFoundException("The selected Player was not found.");
    }
    const result = await this.prisma.playerProfile.updateMany({
      where: {
        id: playerId,
        standing: dto.expectedStanding.toUpperCase() as PrismaStanding,
      },
      data: { standing: dto.targetStanding.toUpperCase() as PrismaStanding },
    });
    if (result.count !== 1) {
      throw new ConflictException("Player standing changed; reload and retry.");
    }
    return { displayName: player.displayName, standing: dto.targetStanding };
  }
}
