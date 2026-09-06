import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CampaignInstanceCharacterStatus,
  CampaignInstanceMembershipStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignInstanceCharacterDraftsService } from "./campaign-instance-character-drafts.service";
import type {
  CreateCampaignInstanceCharacterDto,
  ImportCampaignInstanceCharacterDto,
  SelectCampaignInstanceCharacterDto,
  UpdateCampaignInstanceCharacterStatusDto,
  UpdateCampaignInstanceMembershipStatusDto,
} from "./dto/campaign-instance-management.dto";

const MEMBERSHIP_TRANSITIONS: Record<string, readonly string[]> = {
  ACTIVE: ["INACTIVE", "LEFT", "BANNED"],
  INACTIVE: ["ACTIVE", "LEFT", "BANNED"],
  LEFT: [],
  BANNED: ["INACTIVE"],
};

const CHARACTER_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["INACTIVE", "RETIRED", "DEAD"],
  INACTIVE: ["ACTIVE", "RETIRED", "DEAD"],
  RETIRED: [],
  DEAD: [],
};

const MEMBERSHIP_STATUS = {
  active: CampaignInstanceMembershipStatus.ACTIVE,
  inactive: CampaignInstanceMembershipStatus.INACTIVE,
  left: CampaignInstanceMembershipStatus.LEFT,
  banned: CampaignInstanceMembershipStatus.BANNED,
} as const;

const CHARACTER_STATUS = {
  draft: CampaignInstanceCharacterStatus.DRAFT,
  active: CampaignInstanceCharacterStatus.ACTIVE,
  inactive: CampaignInstanceCharacterStatus.INACTIVE,
  retired: CampaignInstanceCharacterStatus.RETIRED,
  dead: CampaignInstanceCharacterStatus.DEAD,
} as const;

@Injectable()
export class CampaignInstanceCharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characterDrafts: CampaignInstanceCharacterDraftsService,
  ) {}

  async membershipDetail(
    instanceId: string,
    membershipId: string,
    ownerUserId: string,
  ) {
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          id: membershipId,
          campaignInstanceId: instanceId,
          campaignInstance: { ownerUserId },
        },
        include: {
          campaignInstance: { select: { name: true } },
          activeCharacter: { select: { characterName: true } },
          characters: {
            orderBy: [{ createdAt: "asc" }, { characterId: "asc" }],
            select: { characterId: true, characterName: true, status: true },
          },
        },
      });
    if (!membership) {
      throw new NotFoundException("The selected membership was not found.");
    }
    return {
      campaignInstanceName: membership.campaignInstance.name,
      membership: {
        membershipId: membership.id,
        displayName: membership.displayName,
        role: membership.role.toLowerCase(),
        status: membership.status.toLowerCase(),
        joinedAt: membership.joinedAt.toISOString(),
        leftAt: membership.leftAt?.toISOString(),
        activeCharacterName: membership.activeCharacter?.characterName,
        characters: membership.characters.map((character) => ({
          characterId: character.characterId,
          name: character.characterName,
          status: character.status.toLowerCase(),
        })),
      },
    };
  }

  async characterDetail(
    instanceId: string,
    characterId: string,
    ownerUserId: string,
  ) {
    const character = await this.character(
      instanceId,
      characterId,
      ownerUserId,
    );
    return {
      campaignInstanceName: character.campaignInstance.name,
      character: {
        characterId: character.characterId,
        name: character.characterName,
        playerName: character.playerMembership.displayName,
        status: character.status.toLowerCase(),
        origin: character.origin.toLowerCase().replaceAll("_", "-"),
        ...(character.origin === "ONE_WAY_IMPORT" &&
        character.sourceCampaignInstanceName &&
        character.sourceCharacterName &&
        character.importedAt
          ? {
              importedFrom: {
                campaignInstanceName: character.sourceCampaignInstanceName,
                characterName: character.sourceCharacterName,
                importedAt: character.importedAt.toISOString(),
              },
            }
          : {}),
      },
    };
  }

  async changeMembershipStatus(
    instanceId: string,
    membershipId: string,
    ownerUserId: string,
    dto: UpdateCampaignInstanceMembershipStatusDto,
  ) {
    const membership = await this.membership(
      instanceId,
      membershipId,
      ownerUserId,
    );
    if (membership.role === "GM") {
      throw new ConflictException(
        "The Game Master membership follows Campaign Instance ownership.",
      );
    }
    const expected = MEMBERSHIP_STATUS[dto.expectedStatus];
    const target = MEMBERSHIP_STATUS[dto.targetStatus];
    if (
      membership.status !== expected ||
      !MEMBERSHIP_TRANSITIONS[expected]?.includes(target)
    ) {
      throw new ConflictException(
        "Membership status changed or the requested transition is unavailable.",
      );
    }
    const activeParticipation =
      await this.prisma.sessionParticipation.findFirst({
        where: {
          campaignInstanceId: instanceId,
          humanMembershipId: membershipId,
          session: { status: { in: ["LOBBY", "ACTIVE", "PAUSED"] } },
        },
        select: { participantName: true },
      });
    if (activeParticipation && target !== "ACTIVE") {
      throw new ConflictException(
        `${membership.displayName}'s membership cannot change while they participate in a current Session.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaignInstanceHumanMembership.updateMany({
        where: {
          id: membershipId,
          campaignInstanceId: instanceId,
          status: expected,
        },
        data: {
          status: target,
          leftAt: target === "LEFT" ? new Date() : null,
          ...(target === "LEFT" || target === "BANNED"
            ? { activeCharacterId: null }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Membership changed; reload and retry.");
      }
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: instanceId,
          actorUserId: ownerUserId,
          action: "instance.membership.status-changed",
          subjectName: membership.displayName,
          subjectType: "Membership",
          detail: {
            previousStatus: dto.expectedStatus,
            status: dto.targetStatus,
          },
        },
      });
    });
    return {
      campaignInstanceName: membership.campaignInstance.name,
      membershipName: membership.displayName,
      status: dto.targetStatus,
    };
  }

  async createCharacter(
    instanceId: string,
    ownerUserId: string,
    dto: CreateCampaignInstanceCharacterDto,
  ) {
    const membership = await this.playerMembership(
      instanceId,
      dto.playerMembershipId,
      ownerUserId,
    );
    const name = dto.name.trim();
    const characterId = randomUUID();
    const character = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaignInstanceCharacterAssociation.create({
        data: {
          characterId,
          characterName: name,
          campaignInstanceId: instanceId,
          playerMembershipId: membership.id,
        },
      });
      await tx.campaignInstanceCharacterDraft.create({
        data: {
          campaignInstanceId: instanceId,
          playerMembershipId: membership.id,
          characterId,
          name,
        },
      });
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: instanceId,
          actorUserId: ownerUserId,
          action: "instance.character.created",
          subjectName: name,
          subjectType: "Character",
          detail: { playerName: membership.displayName },
        },
      });
      return created;
    });
    return this.characterResult(membership.campaignInstance.name, character);
  }

  async importCharacter(
    instanceId: string,
    ownerUserId: string,
    dto: ImportCampaignInstanceCharacterDto,
  ) {
    if (dto.sourceCampaignInstanceId === instanceId) {
      throw new BadRequestException(
        "A Character import must come from another Campaign Instance.",
      );
    }
    const destination = await this.playerMembership(
      instanceId,
      dto.playerMembershipId,
      ownerUserId,
    );
    const source =
      await this.prisma.campaignInstanceCharacterAssociation.findFirst({
        where: {
          characterId: dto.sourceCharacterId,
          campaignInstanceId: dto.sourceCampaignInstanceId,
          campaignInstance: {
            campaignDefinitionId: dto.sourceCampaignDefinitionId,
            ownerUserId,
          },
        },
        include: {
          campaignInstance: { select: { name: true } },
          playerMembership: { select: { userId: true, displayName: true } },
        },
      });
    if (!source) {
      throw new NotFoundException("The source Character was not found.");
    }
    if (source.playerMembership.userId !== destination.userId) {
      throw new ConflictException(
        "A Character can only be imported for the same Player identity.",
      );
    }
    const name = dto.name?.trim() || source.characterName;
    const sourceRecord = await this.prisma.domainRecord.findUnique({
      where: {
        resource_id: { resource: "characters", id: source.characterId },
      },
      select: { kind: true, data: true },
    });
    if (!sourceRecord) {
      throw new ConflictException(
        "The source Character sheet is unavailable for import.",
      );
    }
    const characterId = randomUUID();
    const importedDraft = importedCharacterDraftData(sourceRecord.data, name);
    const imported = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaignInstanceCharacterAssociation.create({
        data: {
          characterId,
          characterName: name,
          campaignInstanceId: instanceId,
          playerMembershipId: destination.id,
          origin: "ONE_WAY_IMPORT",
          sourceCampaignInstanceId: source.campaignInstanceId,
          sourceCharacterId: source.characterId,
          sourceCampaignInstanceName: source.campaignInstance.name,
          sourceCharacterName: source.characterName,
          importedAt: new Date(),
        },
      });
      await tx.campaignInstanceCharacterDraft.create({
        data: {
          campaignInstanceId: instanceId,
          playerMembershipId: destination.id,
          characterId,
          ...importedDraft,
        },
      });
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: instanceId,
          actorUserId: ownerUserId,
          action: "instance.character.imported",
          subjectName: name,
          subjectType: "Character",
          detail: {
            sourceCampaignInstanceName: source.campaignInstance.name,
            sourceCharacterName: source.characterName,
            playerName: destination.displayName,
          },
        },
      });
      return created;
    });
    return this.characterResult(destination.campaignInstance.name, imported);
  }

  async characterImportOptions(
    instanceId: string,
    ownerUserId: string,
    limit: number,
    offset: number,
  ) {
    const [instance, destinations] = await Promise.all([
      this.prisma.campaignInstance.findFirst({
        where: { id: instanceId, ownerUserId },
        select: { name: true },
      }),
      this.prisma.campaignInstanceHumanMembership.findMany({
        where: {
          campaignInstanceId: instanceId,
          role: "PLAYER",
          status: "ACTIVE",
          playerProfile: { standing: "ACTIVE" },
        },
        select: { id: true, userId: true, displayName: true },
      }),
    ]);
    if (!instance) {
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    }
    const destinationByUserId = new Map(
      destinations.map((membership) => [membership.userId, membership]),
    );
    if (!destinationByUserId.size) {
      return {
        campaignInstanceId: instanceId,
        campaignInstanceName: instance.name,
        items: [],
        total: 0,
        limit,
        offset,
      };
    }
    const where = {
      campaignInstanceId: { not: instanceId },
      status: { not: "DRAFT" as const },
      campaignInstance: { ownerUserId },
      playerMembership: {
        userId: { in: [...destinationByUserId.keys()] },
        role: "PLAYER" as const,
      },
      draft: { status: "COMPLETE" as const },
    };
    const [sources, total] = await Promise.all([
      this.prisma.campaignInstanceCharacterAssociation.findMany({
        where,
        orderBy: [
          { playerMembership: { displayName: "asc" } },
          { campaignInstance: { name: "asc" } },
          { characterName: "asc" },
          { characterId: "asc" },
        ],
        take: limit,
        skip: offset,
        select: {
          characterId: true,
          characterName: true,
          status: true,
          playerMembership: { select: { userId: true } },
          campaignInstance: {
            select: {
              id: true,
              name: true,
              campaignDefinition: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.campaignInstanceCharacterAssociation.count({ where }),
    ]);
    return {
      campaignInstanceId: instanceId,
      campaignInstanceName: instance.name,
      items: sources.flatMap((source) => {
        const destination = destinationByUserId.get(
          source.playerMembership.userId,
        );
        return destination
          ? [
              {
                playerMembershipId: destination.id,
                playerName: destination.displayName,
                sourceCampaignDefinitionId:
                  source.campaignInstance.campaignDefinition.id,
                sourceCampaignDefinitionName:
                  source.campaignInstance.campaignDefinition.name,
                sourceCampaignInstanceId: source.campaignInstance.id,
                sourceCampaignInstanceName: source.campaignInstance.name,
                sourceCharacterId: source.characterId,
                sourceCharacterName: source.characterName,
                sourceCharacterStatus: source.status.toLowerCase(),
              },
            ]
          : [];
      }),
      total,
      limit,
      offset,
    };
  }

  async changeCharacterStatus(
    instanceId: string,
    characterId: string,
    ownerUserId: string,
    dto: UpdateCampaignInstanceCharacterStatusDto,
  ) {
    const character = await this.character(
      instanceId,
      characterId,
      ownerUserId,
    );
    const expected = CHARACTER_STATUS[dto.expectedStatus];
    const target = CHARACTER_STATUS[dto.targetStatus];
    if (
      character.status !== expected ||
      !CHARACTER_TRANSITIONS[expected]?.includes(target)
    ) {
      throw new ConflictException(
        "Character status changed or the requested transition is unavailable.",
      );
    }
    if (
      target === "ACTIVE" &&
      (character.playerMembership.status !== "ACTIVE" ||
        character.playerMembership.playerProfile?.standing !== "ACTIVE")
    ) {
      throw new ConflictException(
        "The Character's Player and membership must both be active.",
      );
    }
    const materialization =
      target === "ACTIVE"
        ? await this.characterDrafts.activationMaterialization(
            instanceId,
            characterId,
            ownerUserId,
          )
        : undefined;
    await this.prisma.$transaction(async (tx) => {
      if (materialization) {
        const currentInstance = await tx.campaignInstance.findFirst({
          where: {
            id: instanceId,
            currentSnapshotId: materialization.snapshotId,
          },
          select: { id: true },
        });
        if (!currentInstance) {
          throw new ConflictException(
            "The Campaign Instance snapshot changed; review the Character sheet again.",
          );
        }
        await tx.domainRecord.upsert({
          where: {
            resource_id: { resource: "characters", id: characterId },
          },
          create: {
            resource: "characters",
            id: characterId,
            kind: "campaign-instance-character-sheet",
            name: character.characterName,
            data: materialization.data,
          },
          update: {
            kind: "campaign-instance-character-sheet",
            name: character.characterName,
            data: materialization.data,
            revision: { increment: 1 },
          },
        });
      }
      const updated = await tx.campaignInstanceCharacterAssociation.updateMany({
        where: {
          characterId,
          campaignInstanceId: instanceId,
          status: expected,
        },
        data: { status: target },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Character changed; reload and retry.");
      }
      if (target !== "ACTIVE") {
        await tx.campaignInstanceHumanMembership.updateMany({
          where: {
            id: character.playerMembershipId,
            campaignInstanceId: instanceId,
            activeCharacterId: characterId,
          },
          data: { activeCharacterId: null },
        });
      }
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: instanceId,
          actorUserId: ownerUserId,
          action: "instance.character.status-changed",
          subjectName: character.characterName,
          subjectType: "Character",
          detail: {
            previousStatus: dto.expectedStatus,
            status: dto.targetStatus,
          },
        },
      });
    });
    return {
      campaignInstanceName: character.campaignInstance.name,
      characterName: character.characterName,
      status: dto.targetStatus,
    };
  }

  async selectCharacter(
    instanceId: string,
    membershipId: string,
    ownerUserId: string,
    dto: SelectCampaignInstanceCharacterDto,
  ) {
    const membership = await this.playerMembership(
      instanceId,
      membershipId,
      ownerUserId,
    );
    const character =
      await this.prisma.campaignInstanceCharacterAssociation.findFirst({
        where: {
          characterId: dto.characterId,
          campaignInstanceId: instanceId,
          playerMembershipId: membershipId,
          status: "ACTIVE",
        },
        select: { characterName: true },
      });
    if (!character) {
      throw new NotFoundException(
        "The selected active Character was not found.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.campaignInstanceHumanMembership.update({
        where: { id: membershipId },
        data: { activeCharacterId: dto.characterId },
      });
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId: instanceId,
          actorUserId: ownerUserId,
          action: "instance.membership.character-selected",
          subjectName: membership.displayName,
          subjectType: "Membership",
          detail: { characterName: character.characterName },
        },
      });
    });
    return {
      campaignInstanceName: membership.campaignInstance.name,
      membershipName: membership.displayName,
      characterName: character.characterName,
    };
  }

  private async membership(
    instanceId: string,
    membershipId: string,
    ownerUserId: string,
  ) {
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          id: membershipId,
          campaignInstanceId: instanceId,
          campaignInstance: { ownerUserId },
        },
        include: { campaignInstance: { select: { name: true } } },
      });
    if (!membership) {
      throw new NotFoundException("The selected membership was not found.");
    }
    return membership;
  }

  private async playerMembership(
    instanceId: string,
    membershipId: string,
    ownerUserId: string,
  ) {
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          id: membershipId,
          campaignInstanceId: instanceId,
          role: "PLAYER",
          status: "ACTIVE",
          campaignInstance: { ownerUserId },
          playerProfile: { standing: "ACTIVE" },
        },
        include: { campaignInstance: { select: { name: true } } },
      });
    if (!membership) {
      throw new NotFoundException("The selected active Player was not found.");
    }
    return membership;
  }

  private async character(
    instanceId: string,
    characterId: string,
    ownerUserId: string,
  ) {
    const character =
      await this.prisma.campaignInstanceCharacterAssociation.findFirst({
        where: {
          characterId,
          campaignInstanceId: instanceId,
          campaignInstance: { ownerUserId },
        },
        include: {
          campaignInstance: { select: { name: true } },
          playerMembership: {
            include: { playerProfile: { select: { standing: true } } },
          },
        },
      });
    if (!character) {
      throw new NotFoundException("The selected Character was not found.");
    }
    return character;
  }

  private characterResult(
    campaignInstanceName: string,
    character: {
      characterId: string;
      characterName: string;
      status: CampaignInstanceCharacterStatus;
      origin: string;
    },
  ) {
    return {
      campaignInstanceName,
      character: {
        characterId: character.characterId,
        name: character.characterName,
        status: character.status.toLowerCase(),
        origin: character.origin.toLowerCase().replaceAll("_", "-"),
      },
    };
  }
}

function importedCharacterDraftData(
  value: Prisma.JsonValue,
  name: string,
): {
  name: string;
  backgroundDefinitionId?: string;
  professionDefinitionId?: string;
  heritageDefinitionIds: Prisma.InputJsonArray;
  attributeAssignments: Prisma.InputJsonObject;
  startingEquipmentIds: Prisma.InputJsonArray;
  biography?: string;
  imageAssetIds: Prisma.InputJsonObject;
} {
  if (!isJsonObject(value)) {
    throw new ConflictException(
      "The source Character sheet cannot be imported safely.",
    );
  }
  return {
    name,
    ...(typeof value.backgroundDefinitionId === "string"
      ? { backgroundDefinitionId: value.backgroundDefinitionId }
      : {}),
    ...(typeof value.professionDefinitionId === "string"
      ? { professionDefinitionId: value.professionDefinitionId }
      : {}),
    heritageDefinitionIds: jsonStringArray(value.heritageDefinitionIds),
    attributeAssignments: jsonNumberRecord(value.attributeAssignments),
    startingEquipmentIds: jsonStringArray(value.startingEquipmentDefinitionIds),
    ...(typeof value.biography === "string"
      ? { biography: value.biography }
      : {}),
    imageAssetIds: jsonStringRecord(value.imageAssetIds),
  };
}

function jsonStringArray(
  value: Prisma.JsonValue | undefined,
): Prisma.InputJsonArray {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function jsonNumberRecord(
  value: Prisma.JsonValue | undefined,
): Prisma.InputJsonObject {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function jsonStringRecord(
  value: Prisma.JsonValue | undefined,
): Prisma.InputJsonObject {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isJsonObject(
  value: Prisma.JsonValue | undefined,
): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
