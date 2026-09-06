import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { STANDARD_ATTRIBUTES } from "@aow/common";
import { CharacterDraftStatus, Prisma } from "@prisma/client";
import { randomInt, randomUUID } from "node:crypto";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreatePlayerCampaignInstanceCharacterDto,
  UpdatePlayerCampaignInstanceCharacterDraftDto,
} from "./dto/campaign-instance-character-draft.dto";

@Injectable()
export class CampaignInstanceCharacterDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(campaignInstanceId: string, userId: string) {
    const membership = await this.playerMembership(campaignInstanceId, userId);
    const drafts = await this.prisma.campaignInstanceCharacterDraft.findMany({
      where: {
        campaignInstanceId,
        playerMembershipId: membership.id,
      },
      orderBy: [{ updatedAt: "desc" }, { characterId: "asc" }],
    });
    return {
      campaignInstanceId,
      campaignInstanceName: membership.campaignInstance.name,
      items: drafts.map((draft) =>
        draftProjection(draft, membership.campaignInstance.name),
      ),
      total: drafts.length,
    };
  }

  async create(
    campaignInstanceId: string,
    userId: string,
    dto: CreatePlayerCampaignInstanceCharacterDto,
  ) {
    const membership = await this.playerMembership(campaignInstanceId, userId);
    const name = dto.name?.trim() || "New character";
    const characterId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.campaignInstanceCharacterAssociation.create({
        data: {
          characterId,
          characterName: name,
          campaignInstanceId,
          playerMembershipId: membership.id,
        },
      });
      await tx.campaignInstanceCharacterDraft.create({
        data: {
          campaignInstanceId,
          playerMembershipId: membership.id,
          characterId,
          name,
        },
      });
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId,
          actorUserId: userId,
          action: "instance.character.draft-created",
          subjectName: name,
          subjectType: "Character",
          detail: { playerName: membership.displayName },
        },
      });
    });
    return this.get(campaignInstanceId, characterId, userId);
  }

  async get(campaignInstanceId: string, characterId: string, userId: string) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
    );
    return draftProjection(draft, draft.campaignInstance.name);
  }

  async update(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
    );
    if (draft.status === CharacterDraftStatus.COMPLETE) {
      throw new BadRequestException(
        "A completed Character sheet is immutable.",
      );
    }
    await this.validateDefinitionSelections(campaignInstanceId, userId, dto);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException("A Character name is required.");
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaignInstanceCharacterDraft.updateMany({
        where: {
          characterId,
          campaignInstanceId,
          playerMembershipId: draft.playerMembershipId,
          revision: dto.expectedRevision,
        },
        data: {
          ...(name === undefined ? {} : { name }),
          backgroundDefinitionId: dto.backgroundDefinitionId,
          professionDefinitionId: dto.professionDefinitionId,
          heritageDefinitionIds: dto.heritageDefinitionIds,
          attributeAssignments: dto.attributeAssignments,
          startingEquipmentIds: dto.startingEquipmentIds,
          biography: dto.biography?.trim(),
          imageAssetIds: dto.imageAssetIds,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Character sheet changed; reload and retry.",
        );
      }
      if (name !== undefined) {
        await tx.campaignInstanceCharacterAssociation.updateMany({
          where: {
            characterId,
            campaignInstanceId,
            playerMembershipId: draft.playerMembershipId,
          },
          data: { characterName: name },
        });
      }
    });
    return this.get(campaignInstanceId, characterId, userId);
  }

  async rollAttributes(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    expectedRevision: number,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
    );
    if (draft.status === CharacterDraftStatus.COMPLETE) {
      throw new BadRequestException(
        "A completed Character sheet is immutable.",
      );
    }
    const rolls = Array.from({ length: STANDARD_ATTRIBUTES.length + 2 }, () =>
      randomInt(1, 101),
    );
    const updated = await this.prisma.campaignInstanceCharacterDraft.updateMany(
      {
        where: {
          characterId,
          campaignInstanceId,
          playerMembershipId: draft.playerMembershipId,
          revision: expectedRevision,
        },
        data: {
          attributeRolls: rolls,
          attributeAssignments: {},
          revision: { increment: 1 },
        },
      },
    );
    if (updated.count !== 1) {
      throw new ConflictException("Character sheet changed; reload and retry.");
    }
    return this.get(campaignInstanceId, characterId, userId);
  }

  async options(campaignInstanceId: string, userId: string) {
    const membership = await this.playerMembership(campaignInstanceId, userId);
    const manifest =
      membership.campaignInstance.currentSnapshot?.worldDefinitionSnapshot
        .manifest;
    if (!isCanonicalSnapshotManifest(manifest)) {
      throw new ConflictException(
        "Character choices are unavailable from this Campaign Instance snapshot.",
      );
    }
    const byKind = (kind: string) =>
      manifest.records
        .flatMap((record) =>
          record.resourceType === "definitions" &&
          isObject(record.payload) &&
          record.payload.kind === kind
            ? [optionProjection(record.sourceId, record.payload)]
            : [],
        )
        .sort((left, right) => left.name.localeCompare(right.name));
    return {
      backgrounds: byKind("background"),
      professions: byKind("profession"),
      heritages: byKind("heritage"),
      maximumHeritages: 1,
    };
  }

  private async validateDefinitionSelections(
    campaignInstanceId: string,
    userId: string,
    dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
  ) {
    if (
      dto.backgroundDefinitionId === undefined &&
      dto.professionDefinitionId === undefined &&
      dto.heritageDefinitionIds === undefined
    ) {
      return;
    }
    const allowed = await this.options(campaignInstanceId, userId);
    const selections = [
      ["background", dto.backgroundDefinitionId, allowed.backgrounds],
      ["profession", dto.professionDefinitionId, allowed.professions],
      ["heritage", dto.heritageDefinitionIds?.[0], allowed.heritages],
    ] as const;
    for (const [kind, id, options] of selections) {
      if (id && !options.some((option) => option.id === id)) {
        throw new BadRequestException(
          `Selected ${kind} is not available in this Campaign Instance snapshot.`,
        );
      }
    }
  }

  private async ownedDraft(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
  ) {
    const draft = await this.prisma.campaignInstanceCharacterDraft.findFirst({
      where: {
        characterId,
        campaignInstanceId,
        playerMembership: {
          userId,
          role: "PLAYER",
          status: "ACTIVE",
          playerProfile: { standing: "ACTIVE" },
        },
      },
      include: { campaignInstance: { select: { name: true } } },
    });
    if (!draft) {
      throw new NotFoundException("The selected Character was not found.");
    }
    return draft;
  }

  private async playerMembership(campaignInstanceId: string, userId: string) {
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          campaignInstanceId,
          userId,
          role: "PLAYER",
          status: "ACTIVE",
          playerProfile: { standing: "ACTIVE" },
        },
        include: {
          campaignInstance: {
            select: {
              name: true,
              currentSnapshot: {
                select: {
                  worldDefinitionSnapshot: { select: { manifest: true } },
                },
              },
            },
          },
        },
      });
    if (!membership) {
      throw new ForbiddenException(
        "An active Player membership in this Campaign Instance is required.",
      );
    }
    return membership;
  }
}

type CharacterDraftRow = {
  id: string;
  campaignInstanceId: string;
  playerMembershipId: string;
  characterId: string;
  revision: number;
  status: CharacterDraftStatus;
  name: string | null;
  backgroundDefinitionId: string | null;
  professionDefinitionId: string | null;
  heritageDefinitionIds: Prisma.JsonValue;
  attributeRolls: Prisma.JsonValue;
  attributeAssignments: Prisma.JsonValue;
  startingEquipmentIds: Prisma.JsonValue;
  biography: string | null;
  imageAssetIds: Prisma.JsonValue;
  updatedAt: Date;
};

function draftProjection(
  draft: CharacterDraftRow,
  campaignInstanceName: string,
) {
  return {
    campaignInstanceId: draft.campaignInstanceId,
    campaignInstanceName,
    characterId: draft.characterId,
    revision: draft.revision,
    status: draft.status.toLowerCase().replaceAll("_", "-"),
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.backgroundDefinitionId
      ? { backgroundDefinitionId: draft.backgroundDefinitionId }
      : {}),
    ...(draft.professionDefinitionId
      ? { professionDefinitionId: draft.professionDefinitionId }
      : {}),
    heritageDefinitionIds: stringArray(draft.heritageDefinitionIds),
    attributeRolls: numberArray(draft.attributeRolls),
    attributeAssignments: numberRecord(draft.attributeAssignments),
    startingEquipmentIds: stringArray(draft.startingEquipmentIds),
    ...(draft.biography ? { biography: draft.biography } : {}),
    imageAssetIds: stringRecord(draft.imageAssetIds),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function optionProjection(sourceId: string, payload: Record<string, unknown>) {
  const identity = isObject(payload.identity) ? payload.identity : {};
  const name =
    (typeof payload.name === "string" && payload.name.trim()) ||
    (typeof identity.name === "string" && identity.name.trim()) ||
    "Unnamed option";
  const description =
    (typeof payload.description === "string" && payload.description.trim()) ||
    (typeof identity.description === "string" && identity.description.trim()) ||
    undefined;
  return { id: sourceId, name, ...(description ? { description } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberArray(value: Prisma.JsonValue): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function numberRecord(value: Prisma.JsonValue): Record<string, number> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}
