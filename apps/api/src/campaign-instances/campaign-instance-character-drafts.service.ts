import {
  Character,
  CharacterCreation,
  GrantedModifier,
  type CharacterCreationOption,
  type CharacterCreationContext,
  type CharacterAttributeOption,
} from "@aow/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CORE_ATTRIBUTE_KEYS } from "@aow/common";
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

  async get(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    asGm = false,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
      asGm,
    );
    return draftProjection(draft, draft.campaignInstance.name);
  }

  async update(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
    asGm = false,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
      asGm,
    );
    if (!CharacterCreation.editable(draft.status)) {
      throw new BadRequestException(
        "A Character sheet under review or already approved is immutable.",
      );
    }
    await this.validateDefinitionSelections(
      campaignInstanceId,
      userId,
      dto,
      asGm,
    );
    if (dto.imageAssetIds !== undefined) {
      const roles = Object.keys(dto.imageAssetIds);
      if (
        roles.some(
          (role) =>
            !["portrait", "overheadToken", "paperDollToken"].includes(role),
        ) ||
        Object.values(dto.imageAssetIds).some(
          (value) => typeof value !== "string" || !value,
        )
      )
        throw new BadRequestException("Choose valid Character artwork.");
      for (const id of Object.values(dto.imageAssetIds)) {
        const asset = await this.prisma.mediaAsset.findFirst({
          where: {
            id,
            mediaType: "images",
            OR: [
              { createdByUserId: userId },
              { scopeType: "character-draft", scopeId: characterId },
            ],
          },
          select: { id: true },
        });
        if (!asset)
          throw new BadRequestException(
            "The selected Character artwork is unavailable.",
          );
      }
    }
    if (
      dto.equipmentAssignments !== undefined ||
      dto.startingEquipmentIds !== undefined
    ) {
      const context = await this.creationContext(campaignInstanceId);
      const issue = characterEquipmentIssue(
        dto.equipmentAssignments ?? draft.equipmentAssignments ?? {},
        dto.startingEquipmentIds ?? stringArray(draft.startingEquipmentIds),
        context.startingEquipment,
        context.equipmentSlots,
      );
      if (issue) throw new BadRequestException(issue);
    }
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
          status: CharacterDraftStatus.IN_PROGRESS,
        },
        data: {
          ...(name === undefined ? {} : { name }),
          backgroundDefinitionId: dto.backgroundDefinitionId,
          professionDefinitionId: dto.professionDefinitionId,
          heritageDefinitionIds: dto.heritageDefinitionIds,
          attributeAssignments: dto.attributeAssignments,
          startingEquipmentIds: dto.startingEquipmentIds,
          equipmentAssignments: dto.equipmentAssignments,
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
      if (asGm)
        await tx.campaignInstanceAuditEvent.create({
          data: {
            campaignInstanceId,
            actorUserId: userId,
            action: "instance.character.edited-by-gm",
            subjectName: name ?? draft.name ?? "Character",
            subjectType: "Character",
            detail: { playerName: draft.playerMembership.displayName },
          },
        });
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
    return this.get(campaignInstanceId, characterId, userId, asGm);
  }

  async rollAttributes(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    expectedRevision: number,
    asGm = false,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
      asGm,
    );
    if (!CharacterCreation.editable(draft.status)) {
      throw new BadRequestException(
        "A Character sheet under review or already approved is immutable.",
      );
    }
    const creation = await this.creationContext(campaignInstanceId);
    const rolls = Array.from({ length: creation.attributeRollCount }, () =>
      randomInt(1, 101),
    );
    const updated = await this.prisma.campaignInstanceCharacterDraft.updateMany(
      {
        where: {
          characterId,
          campaignInstanceId,
          playerMembershipId: draft.playerMembershipId,
          revision: expectedRevision,
          status: CharacterDraftStatus.IN_PROGRESS,
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
    return this.get(campaignInstanceId, characterId, userId, asGm);
  }

  async submitForReview(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    expectedRevision: number,
    asGm = false,
  ) {
    const draft = await this.ownedDraft(
      campaignInstanceId,
      characterId,
      userId,
      asGm,
    );
    if (!CharacterCreation.editable(draft.status)) {
      throw new ConflictException(
        "This Character sheet is not available for submission.",
      );
    }
    const issues = validateCompleteDraft(
      draft,
      await this.creationContext(campaignInstanceId),
    );
    if (issues.length) {
      throw new BadRequestException(issues.map((issue) => issue.message));
    }
    const submittedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaignInstanceCharacterDraft.updateMany({
        where: {
          characterId,
          campaignInstanceId,
          playerMembershipId: draft.playerMembershipId,
          status: CharacterDraftStatus.IN_PROGRESS,
          revision: expectedRevision,
        },
        data: {
          status: CharacterDraftStatus.READY_FOR_REVIEW,
          submittedAt,
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNote: null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Character sheet changed; reload and retry.",
        );
      }
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId,
          actorUserId: userId,
          action: "instance.character.submitted-for-review",
          subjectName: draft.name ?? "Unnamed Character",
          subjectType: "Character",
          detail: { playerName: draft.playerMembership.displayName },
        },
      });
    });
    return this.get(campaignInstanceId, characterId, userId, asGm);
  }

  async options(campaignInstanceId: string, userId: string, asGm = false) {
    if (asGm) await this.gmInstance(campaignInstanceId, userId);
    else await this.playerMembership(campaignInstanceId, userId);
    const creation = await this.creationContext(campaignInstanceId);
    return {
      worldDefinitionId: creation.worldDefinitionId,
      backgrounds: creation.backgrounds,
      professions: creation.professions,
      heritages: creation.heritages,
      attributes: creation.attributes,
      startingEquipment: creation.startingEquipment,
      equipmentSlots: creation.equipmentSlots,
      maximumHeritages: creation.maximumHeritages,
      attributeRollCount: creation.attributeRollCount,
    };
  }

  async reviewDetail(
    campaignInstanceId: string,
    characterId: string,
    ownerUserId: string,
  ) {
    const draft = await this.gmDraft(
      campaignInstanceId,
      characterId,
      ownerUserId,
    );
    const creation = await this.creationContext(campaignInstanceId);
    const issues = validateCompleteDraft(draft, creation);
    return {
      campaignInstanceName: draft.campaignInstance.name,
      characterId: draft.characterId,
      characterName: draft.name ?? "Unnamed Character",
      playerName: draft.playerMembership.displayName,
      characterStatus: draft.character.status.toLowerCase(),
      draftRevision: draft.revision,
      reviewStatus: draft.status.toLowerCase().replaceAll("_", "-"),
      backgroundName: optionName(
        creation.backgrounds,
        draft.backgroundDefinitionId,
      ),
      professionName: optionName(
        creation.professions,
        draft.professionDefinitionId,
      ),
      heritageNames: stringArray(draft.heritageDefinitionIds).flatMap((id) => {
        const name = optionName(creation.heritages, id);
        return name ? [name] : [];
      }),
      attributes: creation.attributes.map((attribute) => ({
        name: attribute.name,
        score: numberRecord(draft.attributeAssignments)[attribute.id],
      })),
      startingEquipmentNames: stringArray(draft.startingEquipmentIds).flatMap(
        (id) => {
          const name = optionName(creation.startingEquipment, id);
          return name ? [name] : [];
        },
      ),
      ...(draft.biography ? { biography: draft.biography } : {}),
      ...(draft.submittedAt
        ? { submittedAt: draft.submittedAt.toISOString() }
        : {}),
      ...(draft.reviewedAt
        ? { reviewedAt: draft.reviewedAt.toISOString() }
        : {}),
      ...(draft.reviewNote ? { reviewNote: draft.reviewNote } : {}),
      validationIssues: issues,
    };
  }

  async review(
    campaignInstanceId: string,
    characterId: string,
    ownerUserId: string,
    input: {
      expectedRevision: number;
      decision: "approve" | "request-changes";
      note?: string;
    },
  ) {
    const draft = await this.gmDraft(
      campaignInstanceId,
      characterId,
      ownerUserId,
    );
    const reviewIssue = CharacterCreation.reviewIssue(
      draft.status,
      input.decision,
      draft.character.status,
    );
    if (reviewIssue) throw new ConflictException(reviewIssue);
    if (input.decision === "approve") {
      const issues = validateCompleteDraft(
        draft,
        await this.creationContext(campaignInstanceId),
      );
      if (issues.length) {
        throw new BadRequestException(issues.map((issue) => issue.message));
      }
    }
    const reviewedAt = new Date();
    const note = input.note?.trim() || null;
    const targetStatus =
      input.decision === "approve"
        ? CharacterDraftStatus.COMPLETE
        : CharacterDraftStatus.IN_PROGRESS;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.campaignInstanceCharacterDraft.updateMany({
        where: {
          characterId,
          campaignInstanceId,
          revision: input.expectedRevision,
          status: draft.status,
        },
        data: {
          status: targetStatus,
          reviewedAt,
          reviewedByUserId: ownerUserId,
          reviewNote: note,
          revision: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          "Character sheet changed; reload and retry.",
        );
      }
      await tx.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId,
          actorUserId: ownerUserId,
          action:
            input.decision === "approve"
              ? "instance.character.review-approved"
              : "instance.character.changes-requested",
          subjectName: draft.name ?? "Unnamed Character",
          subjectType: "Character",
          detail: { playerName: draft.playerMembership.displayName, note },
        },
      });
      return result;
    });
    void updated;
    return this.reviewDetail(campaignInstanceId, characterId, ownerUserId);
  }

  async activationMaterialization(
    campaignInstanceId: string,
    characterId: string,
    ownerUserId: string,
  ) {
    const draft = await this.gmDraft(
      campaignInstanceId,
      characterId,
      ownerUserId,
    );
    if (draft.status !== CharacterDraftStatus.COMPLETE) {
      throw new ConflictException(
        "The Character sheet requires GM approval before activation.",
      );
    }
    const creation = await this.creationContext(campaignInstanceId);
    const issues = validateCompleteDraft(draft, creation);
    if (issues.length) {
      throw new ConflictException(
        "The approved Character sheet no longer conforms to this Campaign Instance snapshot. Request changes and review it again.",
      );
    }
    const approvedAt = draft.reviewedAt ?? new Date();
    let modifierGrants;
    try {
      const recipes = GrantedModifier.creationRecipes(
        creation.grantRecords,
        draft.backgroundDefinitionId!,
        draft.professionDefinitionId!,
      );
      const importedGrants = isObject(draft.sourceSheet)
        ? draft.sourceSheet.modifierGrants
        : undefined;
      modifierGrants = recipes.map(
        ({ source, definition }) =>
          GrantedModifier.reusableCreationGrant(
            importedGrants,
            source,
            definition,
          ) ??
          GrantedModifier.acquire({
            id: randomUUID(),
            eventId: `character-creation:${draft.characterId}:${draft.revision}`,
            source,
            definition,
            ...(definition.kind === "rolled-flat"
              ? {
                  rolls: definition.dice.map((die) =>
                    Array.from({ length: die.count }, () =>
                      randomInt(1, die.sides + 1),
                    ),
                  ),
                }
              : {}),
          }),
      );
    } catch (error) {
      throw new ConflictException(
        error instanceof Error
          ? error.message
          : "Character benefits could not be acquired.",
      );
    }
    const data = {
      ...new CharacterCreation(creation).activationSheet(draft, {
        characterId: draft.characterId,
        campaignInstanceId,
        ownerMembershipId: draft.playerMembershipId,
        sourceDraftRevision: draft.revision,
        approvedAt: approvedAt.toISOString(),
      }),
      ...(modifierGrants.length ? { modifierGrants } : {}),
    };
    Character.validateSheetBinding(data, draft.characterId, campaignInstanceId);
    return {
      snapshotId: creation.campaignInstanceSnapshotId,
      sourceDraftRevision: draft.revision,
      equipmentContext: {
        definitions: creation.grantRecords
          .filter(
            (record) =>
              (record.payload as Record<string, unknown>).kind === "item",
          )
          .map((record) => {
            const payload = record.payload as Record<string, unknown>;
            const components = (payload.components ?? {}) as Record<
              string,
              unknown
            >;
            return {
              ...payload,
              identity: {
                ...(payload.identity as object),
                id: record.sourceId,
              },
              components: {
                ...components,
                ...(components.equippable
                  ? {
                      equippable: {
                        ...(components.equippable),
                        compatibleSlotSets:
                          creation.startingEquipment.find(
                            (item) => item.id === record.sourceId,
                          )?.compatibleSlotSets ?? [],
                      },
                    }
                  : {}),
              },
            };
          }),
        availableSlots: creation.equipmentSlots.map((slot) => slot.id),
      },
      data: data as unknown as Prisma.InputJsonObject,
    };
  }

  private async validateDefinitionSelections(
    campaignInstanceId: string,
    userId: string,
    dto: UpdatePlayerCampaignInstanceCharacterDraftDto,
    asGm = false,
  ) {
    if (
      dto.backgroundDefinitionId === undefined &&
      dto.professionDefinitionId === undefined &&
      dto.heritageDefinitionIds === undefined &&
      dto.attributeAssignments === undefined &&
      dto.startingEquipmentIds === undefined
    ) {
      return;
    }
    if (asGm) await this.gmInstance(campaignInstanceId, userId);
    else await this.playerMembership(campaignInstanceId, userId);
    const allowed = await this.creationContext(campaignInstanceId);
    const issue = new CharacterCreation(allowed).selectionIssue(dto);
    if (issue) throw new BadRequestException(issue);
  }

  private async creationContext(campaignInstanceId: string): Promise<
    CharacterCreationContext & {
      grantRecords: readonly { sourceId: string; payload: unknown }[];
    }
  > {
    const instance = await this.prisma.campaignInstance.findUnique({
      where: { id: campaignInstanceId },
      select: {
        currentSnapshot: {
          select: {
            id: true,
            campaignDefinitionSnapshot: {
              select: {
                campaignDefinitionRevision: { select: { content: true } },
              },
            },
            worldDefinitionSnapshot: {
              select: {
                manifest: true,
                worldDefinitionRevision: {
                  select: {
                    worldDefinitionId: true,
                    modelSchemaSelections: {
                      orderBy: { selectionOrder: "asc" },
                      select: {
                        modelSchemaRelease: {
                          select: {
                            id: true,
                            dependencies: true,
                            elementSelections: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const snapshot = instance?.currentSnapshot;
    const manifest = snapshot?.worldDefinitionSnapshot.manifest;
    if (!snapshot || !isCanonicalSnapshotManifest(manifest)) {
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
    const releaseSelections =
      snapshot.worldDefinitionSnapshot.worldDefinitionRevision
        .modelSchemaSelections;
    const campaignReleaseIds = stringArrayFromObject(
      snapshot.campaignDefinitionSnapshot.campaignDefinitionRevision.content,
      "modelSchemaReleaseIds",
    );
    const campaignReleases = campaignReleaseIds.length
      ? await this.prisma.modelSchemaRelease.findMany({
          where: { id: { in: campaignReleaseIds } },
          select: { id: true, dependencies: true, elementSelections: true },
        })
      : [];
    const releases = new Map(
      [
        ...releaseSelections.map((selection) => selection.modelSchemaRelease),
        ...campaignReleases,
      ].map((release) => [release.id, release]),
    );
    let pendingDependencyIds = [...releases.values()]
      .flatMap((release) => modelReleaseDependencyIds(release.dependencies))
      .filter((id) => !releases.has(id));
    while (pendingDependencyIds.length) {
      const dependencies = await this.prisma.modelSchemaRelease.findMany({
        where: { id: { in: [...new Set(pendingDependencyIds)] } },
        select: { id: true, dependencies: true, elementSelections: true },
      });
      pendingDependencyIds = [];
      for (const dependency of dependencies) {
        if (releases.has(dependency.id)) continue;
        releases.set(dependency.id, dependency);
        pendingDependencyIds.push(
          ...modelReleaseDependencyIds(dependency.dependencies).filter(
            (id) => !releases.has(id),
          ),
        );
      }
    }
    const elementRevisionIds = [...releases.values()].flatMap((release) =>
      modelElementRevisionIds(release.elementSelections),
    );
    const modelElements = elementRevisionIds.length
      ? await this.prisma.modelElementRevision.findMany({
          where: { id: { in: [...new Set(elementRevisionIds)] } },
          select: {
            id: true,
            payload: true,
            presentation: true,
            element: { select: { id: true, key: true, semanticRole: true } },
          },
        })
      : [];
    const attributes = modelElements
      .filter((revision) => revision.element.semanticRole === "aow:attribute")
      .map((revision) => attributeOption(revision))
      .sort((left, right) => left.name.localeCompare(right.name));
    const effectiveAttributes = attributes.length
      ? attributes
      : CORE_ATTRIBUTE_KEYS.map((attribute) => ({
          id: attribute,
          name: title(attribute.replace(/^aow:attribute-/, "")),
          minimum: 0,
          maximum: 100,
        }));
    const equipmentSlots = modelElements
      .filter(
        (revision) => revision.element.semanticRole === "aow:equipment-slot",
      )
      .map((revision) => ({
        id: revision.element.key,
        name: attributeOption(revision).name,
      }));
    const startingEquipment = byKind("item").map((item) => ({
      ...item,
      compatibleSlotSets: (item.compatibleSlotSets ?? [])
        .map((set) =>
          set.map(
            (key) =>
              equipmentSlots.find(
                (slot) => slot.id === key || slot.id.endsWith(`-slot-${key}`),
              )?.id ?? key,
          ),
        )
        .filter((set) =>
          set.every((key) => equipmentSlots.some((slot) => slot.id === key)),
        ),
    }));
    return {
      grantRecords: manifest.records.filter(
        (record) => record.resourceType === "definitions",
      ),
      worldDefinitionId:
        snapshot.worldDefinitionSnapshot.worldDefinitionRevision
          .worldDefinitionId,
      campaignInstanceSnapshotId: snapshot.id,
      backgrounds: byKind("background"),
      professions: byKind("profession"),
      heritages: byKind("heritage"),
      attributes: effectiveAttributes,
      startingEquipment,
      equipmentSlots,
      maximumHeritages: 1,
      attributeRollCount: effectiveAttributes.length + 2,
    };
  }

  private async gmInstance(campaignInstanceId: string, userId: string) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: {
        id: campaignInstanceId,
        ownerUserId: userId,
        status: { notIn: ["ARCHIVED", "CONCLUDED"] },
      },
      select: { id: true },
    });
    if (!instance)
      throw new NotFoundException(
        "The editable Campaign Instance was not found.",
      );
    return instance;
  }

  private async gmDraft(
    campaignInstanceId: string,
    characterId: string,
    ownerUserId: string,
  ) {
    const draft = await this.prisma.campaignInstanceCharacterDraft.findFirst({
      where: {
        characterId,
        campaignInstanceId,
        campaignInstance: { ownerUserId },
      },
      include: {
        campaignInstance: { select: { name: true } },
        playerMembership: { select: { displayName: true } },
        character: { select: { status: true } },
      },
    });
    if (!draft) {
      throw new NotFoundException("The selected Character was not found.");
    }
    return draft;
  }

  private async ownedDraft(
    campaignInstanceId: string,
    characterId: string,
    userId: string,
    asGm = false,
  ) {
    if (asGm) {
      await this.gmInstance(campaignInstanceId, userId);
      return this.gmDraft(campaignInstanceId, characterId, userId);
    }
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
      include: {
        campaignInstance: { select: { name: true } },
        playerMembership: { select: { displayName: true } },
      },
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
  sourceSheet?: Prisma.JsonValue;
  backgroundDefinitionId: string | null;
  professionDefinitionId: string | null;
  heritageDefinitionIds: Prisma.JsonValue;
  attributeRolls: Prisma.JsonValue;
  attributeAssignments: Prisma.JsonValue;
  startingEquipmentIds: Prisma.JsonValue;
  equipmentAssignments?: Prisma.JsonValue;
  biography: string | null;
  imageAssetIds: Prisma.JsonValue;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
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
    equipmentAssignments: draft.equipmentAssignments ?? {},
    ...(draft.biography ? { biography: draft.biography } : {}),
    imageAssetIds: stringRecord(draft.imageAssetIds),
    ...(draft.submittedAt
      ? { submittedAt: draft.submittedAt.toISOString() }
      : {}),
    ...(draft.reviewedAt ? { reviewedAt: draft.reviewedAt.toISOString() } : {}),
    ...(draft.reviewNote ? { reviewNote: draft.reviewNote } : {}),
    validationIssues: [],
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
  const components = isObject(payload.components) ? payload.components : {};
  const equippable = isObject(components.equippable)
    ? components.equippable
    : {};
  const compatibleSlotSets = Array.isArray(equippable.compatibleSlotSets)
    ? equippable.compatibleSlotSets.filter(
        (set): set is string[] =>
          Array.isArray(set) && set.every((s) => typeof s === "string"),
      )
    : [];
  const image = isObject(payload.image) ? payload.image : {};
  return {
    id: sourceId,
    name,
    ...(description ? { description } : {}),
    ...(payload.kind === "item" ? { compatibleSlotSets } : {}),
    ...(Array.isArray(components.modifierGrants)
      ? { modifierGrants: components.modifierGrants }
      : {}),
    ...(typeof image.assetId === "string"
      ? { imageAssetId: image.assetId }
      : {}),
  };
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

function modelElementRevisionIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((selection) => {
    if (!isObject(selection)) return [];
    return typeof selection.elementRevisionId === "string"
      ? [selection.elementRevisionId]
      : [];
  });
}

function modelReleaseDependencyIds(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) =>
        isObject(entry) && typeof entry.releaseId === "string"
          ? [entry.releaseId]
          : [],
      )
    : [];
}

function stringArrayFromObject(value: Prisma.JsonValue, key: string): string[] {
  return isObject(value) && Array.isArray(value[key])
    ? value[key].filter((entry): entry is string => typeof entry === "string")
    : [];
}

function attributeOption(revision: {
  payload: Prisma.JsonValue;
  presentation: Prisma.JsonValue;
  element: { id: string; key: string; semanticRole: string };
}): CharacterAttributeOption {
  const payload = isObject(revision.payload) ? revision.payload : {};
  const metadata = isObject(payload.valueMetadata) ? payload.valueMetadata : {};
  const presentation = isObject(revision.presentation)
    ? revision.presentation
    : {};
  return {
    id: revision.element.id,
    name:
      typeof presentation.label === "string" && presentation.label.trim()
        ? presentation.label.trim()
        : title(revision.element.key.split(":").at(-1) ?? "Attribute"),
    minimum:
      typeof metadata["aow:minimum"] === "number" ? metadata["aow:minimum"] : 0,
    maximum:
      typeof metadata["aow:maximum"] === "number"
        ? metadata["aow:maximum"]
        : 100,
  };
}

function optionName(
  options: readonly CharacterCreationOption[],
  id: string | null,
): string | undefined {
  return id ? options.find((option) => option.id === id)?.name : undefined;
}

function title(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const validateCompleteDraft = (
  draft: CharacterDraftRow,
  creation: CharacterCreationContext,
) => new CharacterCreation(creation).completeIssues(draft);
export const characterEquipmentIssue = CharacterCreation.equipmentIssue;
