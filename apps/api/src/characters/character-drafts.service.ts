import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { STANDARD_ATTRIBUTES } from "@aow/common";
import {
  CampaignRole,
  CharacterDraftStatus,
  MembershipStatus,
} from "@prisma/client";
import { randomInt } from "node:crypto";
import { DomainService } from "../domain/domain.service";
import { isObject } from "../domain/domain-resource";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateCharacterDraftDto } from "./dto/character-draft.dto";

@Injectable()
export class CharacterDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DomainService,
  ) {}

  async list(userId: string) {
    const drafts = await this.prisma.characterCreationDraft.findMany({
      where: {
        membership: {
          userId,
          role: CampaignRole.PLAYER,
          status: MembershipStatus.ACTIVE,
        },
      },
      orderBy: { updatedAt: "desc" },
      include: { membership: true },
    });
    const campaignNames = new Map<string, string>();
    await Promise.all(
      [...new Set(drafts.map((draft) => draft.membership.campaignId))].map(
        async (campaignId) => {
          const campaign = await this.domain.get("campaigns", campaignId);
          campaignNames.set(campaignId, campaign.name ?? "Campaign");
        },
      ),
    );
    return drafts.map(({ membership, ...draft }) => ({
      ...draft,
      campaignName: campaignNames.get(membership.campaignId) ?? "Campaign",
    }));
  }

  async create(userId: string, campaignId?: string, name?: string) {
    const membership = await this.prisma.campaignMembership.findFirst({
      where: {
        campaignId,
        userId,
        role: CampaignRole.PLAYER,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      throw new ForbiddenException("Player campaign membership is required.");
    }
    return this.prisma.characterCreationDraft.create({
      data: { membershipId: membership.id, name: name?.trim() || undefined },
    });
  }

  async get(id: string, userId: string) {
    const draft = await this.prisma.characterCreationDraft.findUnique({
      where: { id },
      include: { membership: true },
    });
    if (
      !draft ||
      draft.membership.userId !== userId ||
      draft.membership.status !== MembershipStatus.ACTIVE
    ) {
      throw new NotFoundException("Character draft was not found.");
    }
    return draft;
  }

  async update(id: string, userId: string, dto: UpdateCharacterDraftDto) {
    const draft = await this.get(id, userId);
    if (draft.status === CharacterDraftStatus.COMPLETE) {
      throw new BadRequestException(
        "A completed character draft is immutable.",
      );
    }
    if (
      dto.status !== undefined &&
      dto.status !== CharacterDraftStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        "Character submission is not available until final validation is implemented.",
      );
    }
    await this.validateDefinitionSelections(draft.membership.campaignId, dto);
    const result = await this.prisma.characterCreationDraft.updateMany({
      where: { id, revision: dto.expectedRevision },
      data: {
        name: dto.name?.trim(),
        backgroundDefinitionId: dto.backgroundDefinitionId,
        professionDefinitionId: dto.professionDefinitionId,
        heritageDefinitionIds: dto.heritageDefinitionIds,
        attributeAssignments: dto.attributeAssignments,
        startingEquipmentIds: dto.startingEquipmentIds,
        biography: dto.biography?.trim(),
        imageAssetIds: dto.imageAssetIds,
        status: dto.status,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException("Character draft changed; reload and retry.");
    }
    return this.get(id, userId);
  }

  async rollAttributes(id: string, userId: string, expectedRevision: number) {
    const draft = await this.get(id, userId);
    if (draft.status === CharacterDraftStatus.COMPLETE) {
      throw new BadRequestException(
        "A completed character draft is immutable.",
      );
    }
    const rolls = Array.from({ length: STANDARD_ATTRIBUTES.length + 2 }, () =>
      randomInt(1, 101),
    );
    const result = await this.prisma.characterCreationDraft.updateMany({
      where: { id, revision: expectedRevision },
      data: {
        attributeRolls: rolls,
        attributeAssignments: {},
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException("Character draft changed; reload and retry.");
    }
    return this.get(id, userId);
  }

  async options(id: string, userId: string) {
    const draft = await this.get(id, userId);
    return this.definitionOptions(draft.membership.campaignId);
  }

  private async definitionOptions(campaignId: string) {
    const campaign = await this.domain.get("campaigns", campaignId);
    const worldId = isObject(campaign.data) ? campaign.data.worldId : undefined;
    if (typeof worldId !== "string") {
      throw new BadRequestException("Campaign world is unavailable.");
    }
    const kinds = ["background", "profession", "heritage"] as const;
    const results = await Promise.all(
      kinds.map((kind) => this.listKind(kind, worldId)),
    );
    const mapped = results.map((records, index) =>
      records.map((record) => {
        const identity =
          isObject(record.data) && isObject(record.data.identity)
            ? record.data.identity
            : {};
        return {
          id: record.id,
          name: record.name ?? `Unnamed ${kinds[index] ?? "option"}`,
          description:
            typeof identity.description === "string"
              ? identity.description
              : undefined,
        };
      }),
    );
    return {
      backgrounds: mapped[0] ?? [],
      professions: mapped[1] ?? [],
      heritages: mapped[2] ?? [],
    };
  }

  private async listKind(kind: string, worldId: string) {
    const records: Array<{
      id: string;
      name: string | null;
      data: unknown;
    }> = [];
    let offset = 0;
    let more = true;
    while (more) {
      const page = await this.domain.list("definitions", {
        kind,
        worldId,
        sort: "name",
        order: "asc",
        limit: 200,
        offset,
      });
      records.push(...page.items);
      offset += page.items.length;
      more = offset < page.total && page.items.length > 0;
    }
    return records;
  }

  private async validateDefinitionSelections(
    campaignId: string,
    dto: UpdateCharacterDraftDto,
  ): Promise<void> {
    if (
      !dto.backgroundDefinitionId &&
      !dto.professionDefinitionId &&
      !dto.heritageDefinitionIds
    ) {
      return;
    }
    const allowed = await this.definitionOptions(campaignId);
    const selections = [
      ["background", dto.backgroundDefinitionId, allowed.backgrounds],
      ["profession", dto.professionDefinitionId, allowed.professions],
      ["heritage", dto.heritageDefinitionIds?.[0], allowed.heritages],
    ] as const;
    for (const [kind, id, options] of selections) {
      if (id && !options.some((option) => option.id === id)) {
        throw new BadRequestException(
          `Selected ${kind} is not available in this campaign.`,
        );
      }
    }
  }
}
