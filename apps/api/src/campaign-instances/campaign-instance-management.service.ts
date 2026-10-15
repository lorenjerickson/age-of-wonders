import { InstanceParticipation } from "@aow/domain";
import {
  readActorEquipment,
  changeActorEquipment,
  type EquipmentRequest,
} from "./actor-equipment";
import { CampaignInstance, Creature, Character } from "@aow/domain";
import { capturedActorPositionIssue } from "./actor-position";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CampaignInstanceAgentParticipationStatus,
  CampaignInstanceHumanRole,
  CampaignInstanceStatus,
  Prisma,
} from "@prisma/client";
import {
  canTransitionCampaignInstanceStatus,
  resolveCreatureInstanceEmbodimentPolicy,
  plotDiscoveryClaims,
  type PlotDiscovery,
} from "@aow/common";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ConfigureCampaignInstanceAgentDto,
  PlaceCampaignInstanceActorDto,
  DecideCampaignInstancePlacementDto,
  UpdateCampaignInstanceAgentStatusDto,
  UpdateCampaignInstanceLifecycleDto,
  UpdateCampaignInstancePlotDto,
  UpdateCampaignInstancePreparationDto,
} from "./dto/campaign-instance-management.dto";

@Injectable()
export class CampaignInstanceManagementService {
  constructor(private readonly prisma: PrismaService) {}

  equipment(id: string, userId: string, actorId: string) {
    return readActorEquipment(this.prisma, id, userId, actorId);
  }
  changeEquipment(
    id: string,
    userId: string,
    actorId: string,
    request: EquipmentRequest,
  ) {
    return changeActorEquipment(this.prisma, id, userId, actorId, request);
  }

  async validate(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const checks = [];
    checks.push({
      key: "captured-pair",
      label: "Captured Campaign and World",
      status:
        instance.currentSnapshotId && instance.currentSnapshot
          ? ("ready" as const)
          : ("blocked" as const),
      detail:
        instance.currentSnapshotId && instance.currentSnapshot
          ? "A consistent captured Campaign and World pair is selected."
          : "Capture a Campaign and World pair before activation.",
    });
    let runtimeIssues: readonly { detail: string }[] = [];
    if (instance.runtime && runtimeState(instance.runtime.state)) {
      try {
        runtimeIssues = validateRuntimeForCapturedPair(
          instance.runtime.state,
          instance,
        );
      } catch {
        runtimeIssues = [
          { detail: "The continuing Instance state is malformed." },
        ];
      }
    }
    checks.push({
      key: "runtime",
      label: "Instance runtime",
      status:
        instance.runtime &&
        runtimeState(instance.runtime.state) &&
        runtimeIssues.length === 0
          ? ("ready" as const)
          : ("blocked" as const),
      detail:
        instance.runtime &&
        runtimeState(instance.runtime.state) &&
        runtimeIssues.length === 0
          ? "Continuing Instance state is available."
          : (runtimeIssues[0]?.detail ??
            "The continuing Instance state is unavailable or invalid."),
    });
    const gmCount = await this.prisma.campaignInstanceHumanMembership.count({
      where: {
        campaignInstanceId: id,
        role: CampaignInstanceHumanRole.GM,
        status: "ACTIVE",
      },
    });
    checks.push({
      key: "gm-membership",
      label: "Game Master",
      status: gmCount > 0 ? ("ready" as const) : ("blocked" as const),
      detail:
        gmCount > 0
          ? "An active GM participates in this Campaign Instance."
          : "Add an active GM participant before activation.",
    });
    const policyProblems = capturedCreaturePolicyProblems(
      instance.currentSnapshot,
    );
    checks.push({
      key: "creature-embodiment-policies",
      label: "Creature embodiment policies",
      status:
        policyProblems.length === 0 ? ("ready" as const) : ("blocked" as const),
      detail:
        policyProblems.length === 0
          ? "Captured Creature embodiment policies are resolvable."
          : "One or more captured Creatures has a malformed or unsupported embodiment policy.",
    });
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      readyToActivate: checks.every(({ status }) => status !== "blocked"),
      checks,
    };
  }

  async updateLifecycle(
    id: string,
    ownerUserId: string,
    dto: UpdateCampaignInstanceLifecycleDto,
  ) {
    const instance = await this.owned(id, ownerUserId);
    const expected = instance.status;
    const target = dto.targetStatus.toUpperCase();
    if (
      !canTransitionCampaignInstanceStatus(
        expected.toLowerCase() as Lowercase<CampaignInstanceStatus>,
        dto.targetStatus,
      )
    ) {
      const explanation = `A ${instance.status.toLowerCase()} Campaign Instance cannot become ${dto.targetStatus}.`;
      throw new BadRequestException(explanation);
    }
    if (target === "ACTIVE") {
      const readiness = await this.validate(id, ownerUserId);
      if (!readiness.readyToActivate) {
        throw new BadRequestException(
          "The Campaign Instance is not ready to activate.",
        );
      }
    }
    const now = new Date();
    await this.withAudit(
      id,
      ownerUserId,
      "instance.lifecycle.changed",
      instance.name,
      "Campaign Instance",
      { from: expected.toLowerCase(), to: dto.targetStatus },
      async (client) => {
        const updated = await client.campaignInstance.updateMany({
          where: {
            id,
            ownerUserId,
            status: expected,
            metadataRevision: dto.expectedMetadataRevision,
          },
          data: {
            status: target as CampaignInstanceStatus,
            archivedAt: target === "ARCHIVED" ? now : null,
            concludedAt: target === "CONCLUDED" ? now : null,
            metadataRevision: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            "Campaign Instance status changed; reload and retry.",
          );
        }
      },
    );
    return {
      id: instance.id,
      name: instance.name,
      status: dto.targetStatus,
      metadataRevision: dto.expectedMetadataRevision + 1,
    };
  }

  async preparation(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const state = requireRuntime(instance);
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: instance.runtime!.revision,
      preparation: objectValue(state.preparation),
      locations: preparationLocations(instance),
    };
  }

  async updatePreparation(
    id: string,
    ownerUserId: string,
    dto: UpdateCampaignInstancePreparationDto,
  ) {
    const instance = await this.ownedEditable(id, ownerUserId);
    const state = requireRuntime(instance);
    const preparation = {
      ...(dto.preparation.startingLocationId?.trim()
        ? { startingLocationId: dto.preparation.startingLocationId.trim() }
        : {}),
      ...(dto.preparation.startingContext?.trim()
        ? { startingContext: dto.preparation.startingContext.trim() }
        : {}),
      ...(dto.preparation.mapVariations?.trim()
        ? { mapVariations: dto.preparation.mapVariations.trim() }
        : {}),
      ...(dto.preparation.locationCanvases
        ? { locationCanvases: dto.preparation.locationCanvases }
        : {}),
      ...(dto.preparation.extensions
        ? { extensions: cleanJsonObject(dto.preparation.extensions, 10_000) }
        : {}),
    };
    const nextState = await instanceCommand(
      state,
      instance,
      ownerUserId,
      "preparation",
      {
        preparation: cleanJsonValue(preparation, 50_000) as Record<
          string,
          unknown
        >,
      },
    );
    await this.writeRuntime(
      instance,
      ownerUserId,
      dto.expectedRuntimeRevision,
      nextState,
      "instance.preparation.changed",
      instance.name,
      "Preparation",
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: dto.expectedRuntimeRevision + 1,
      preparation,
      locations: preparationLocations(instance),
    };
  }

  async plots(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const state = requireRuntime(instance);
    const progressById = new Map(
      arrayValue(state.plotProgress).map((entry) => {
        const progress = objectValue(entry);
        return [
          typeof progress.plotDefinitionId === "string"
            ? progress.plotDefinitionId
            : "",
          progress,
        ] as const;
      }),
    );
    const records = snapshotRecords(
      instance.currentSnapshot?.campaignDefinitionSnapshot.manifest,
      "plots",
    );
    const definitions = new Map(
      records.map(
        (record) => [record.sourceId, objectValue(record.payload)] as const,
      ),
    );
    const build = (plotDefinitionId: string): Record<string, unknown> => {
      const definition = definitions.get(plotDefinitionId) ?? {};
      const progress = progressById.get(plotDefinitionId) ?? {};
      const parentId = plotParentId(definition);
      return {
        plotDefinitionId,
        name: humanName(definition, "Unnamed Plot"),
        ...(parentId ? { parentPlotDefinitionId: parentId } : {}),
        ...(parentId
          ? {
              parentPlotName: humanName(
                definitions.get(parentId),
                "Parent Plot",
              ),
            }
          : {}),
        status:
          typeof progress.status === "string" ? progress.status : "not-started",
        revealedClaimIds: arrayValue(progress.revealedClaimIds),
        claims: arrayValue(definition.discoveries)
          .flatMap((discovery) =>
            plotDiscoveryClaims(discovery as unknown as PlotDiscovery),
          )
          .map((claim) => ({
            id: claim.id,
            kind: claim.kind,
            name:
              typeof claim.statement === "string"
                ? claim.statement
                : "Captured claim",
          })),
        creatureKnowledge: arrayValue(progress.creatureKnowledge).map(
          (value) => {
            const entry = objectValue(value);
            const actor = arrayValue(state.creatureEmbodiments)
              .map(objectValue)
              .find((actor) => actor.runtimeEntityId === entry.creatureId);
            return {
              kind: entry.kind,
              creatureId: entry.creatureId,
              claimId: entry.claimId,
              ...(entry.learnedAt ? { learnedAt: entry.learnedAt } : {}),
              ...(entry.provenance ? { provenance: entry.provenance } : {}),
              creatureName: humanName(
                objectValue(actor?.creature),
                "Unavailable actor",
              ),
            };
          },
        ),
        actors: arrayValue(state.creatureEmbodiments)
          .map(objectValue)
          .map((actor) => ({
            id: actor.runtimeEntityId,
            name: humanName(objectValue(actor.creature), "Unnamed actor"),
          })),
        locations: arrayValue(definition.locationContexts).map((value) => {
          const context = objectValue(value);
          const location = snapshotRecords(
            instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
            "locations",
          ).find((location) => location.sourceId === context.locationId);
          return {
            id: context.id,
            name: humanName(location?.payload, "Unavailable Location"),
            placements: arrayValue(state.placementRealizations)
              .map(objectValue)
              .filter((placement) =>
                arrayValue(context.placementDefinitionIds).includes(
                  objectValue(placement.source).campaignPlacementDefinitionId,
                ),
              )
              .map((placement) => ({
                id: objectValue(placement.identity).id,
                name: humanName(placement, "Unnamed placement"),
                status: placement.status,
              })),
          };
        }),
        objectiveProgress: arrayValue(progress.objectiveProgress).map(
          (entry) => {
            const objectiveProgress = objectValue(entry);
            const objective = arrayValue(definition.objectives)
              .map(objectValue)
              .find(
                (candidate) => candidate.id === objectiveProgress.objectiveId,
              );
            return {
              objectiveId: objectiveProgress.objectiveId,
              objectiveName: humanName(objective, "Unnamed Objective"),
              status:
                typeof objectiveProgress.status === "string"
                  ? objectiveProgress.status
                  : "not-started",
              ...(typeof objectiveProgress.notes === "string"
                ? { notes: objectiveProgress.notes }
                : {}),
            };
          },
        ),
        children: records
          .filter(
            (record) =>
              plotParentId(objectValue(record.payload)) === plotDefinitionId,
          )
          .map((record) => build(record.sourceId)),
      };
    };
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: instance.runtime!.revision,
      roots: records
        .filter((record) => !plotParentId(objectValue(record.payload)))
        .map((record) => build(record.sourceId)),
    };
  }

  async updatePlot(
    id: string,
    plotDefinitionId: string,
    ownerUserId: string,
    dto: UpdateCampaignInstancePlotDto,
  ) {
    const instance = await this.ownedEditable(id, ownerUserId);
    const state = requireRuntime(instance);
    const current = arrayValue(state.plotProgress);
    const index = current.findIndex(
      (entry) => objectValue(entry).plotDefinitionId === plotDefinitionId,
    );
    if (index < 0) {
      throw new NotFoundException(
        "The selected Plot was not found in this Instance snapshot.",
      );
    }
    const progress = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.objectiveProgress
        ? {
            objectiveProgress: dto.objectiveProgress.map((objective) => ({
              objectiveId: objective.objectiveId,
              status: objective.status,
              ...(objective.notes !== undefined
                ? { notes: objective.notes.trim() }
                : {}),
            })),
          }
        : {}),
      ...(dto.creatureKnowledge
        ? { creatureKnowledge: dto.creatureKnowledge }
        : {}),
      ...(dto.revealedClaimIds
        ? { revealedClaimIds: [...new Set(dto.revealedClaimIds)] }
        : {}),
      ...(dto.approvedOverrides
        ? { approvedOverrides: dto.approvedOverrides }
        : {}),
    };
    const nextState = await instanceCommand(
      state,
      instance,
      ownerUserId,
      "plot",
      {
        plotDefinitionId,
        patch: cleanJsonValue(progress, 50_000) as Record<string, unknown>,
      },
    );
    await this.writeRuntime(
      instance,
      ownerUserId,
      dto.expectedRuntimeRevision,
      nextState,
      "instance.plot-progress.changed",
      humanNameFromPlot(instance, plotDefinitionId),
      "Plot",
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: dto.expectedRuntimeRevision + 1,
      affected: [
        {
          name: humanNameFromPlot(instance, plotDefinitionId),
          typeLabel: "Plot",
        },
      ],
    };
  }

  async placements(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const state = requireRuntime(instance);
    const locations = capturedLocationNames(instance);
    const creatureReplacementOptions = arrayValue(
      state.creatureEmbodiments,
    ).flatMap((value) => {
      const embodiment = objectValue(value);
      const creature = objectValue(embodiment.creature);
      return typeof embodiment.runtimeCreatureId === "string"
        ? [
            {
              kind: "existing-creature" as const,
              runtimeCreatureId: embodiment.runtimeCreatureId,
              name: humanName(creature, "Unnamed Creature"),
              typeLabel: "Creature" as const,
            },
          ]
        : [];
    });
    const itemReplacementOptions = arrayValue(state.itemInstances).flatMap(
      (value) => {
        const item = objectValue(value);
        return typeof item.id === "string"
          ? [
              {
                kind: "existing-item" as const,
                runtimeItemId: item.id,
                name:
                  typeof item.nameOverride === "string" &&
                  item.nameOverride.trim()
                    ? item.nameOverride.trim()
                    : "Unnamed Item",
                typeLabel: "Item" as const,
              },
            ]
          : [];
      },
    );
    const allReplacementOptions = [
      ...creatureReplacementOptions,
      ...itemReplacementOptions,
    ].sort((left, right) => left.name.localeCompare(right.name));
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: instance.runtime!.revision,
      items: arrayValue(state.placementRealizations).map((entry) => {
        const realization = objectValue(entry);
        const identity = objectValue(realization.identity);
        const source = objectValue(realization.source);
        const realizedEntity = objectValue(realization.realizedEntity);
        return {
          realizationId: identity.id,
          name: humanName(realization, "Instance placement"),
          status: realization.status,
          sourceTypeLabel:
            source.kind === "campaign-placement"
              ? "Campaign placement"
              : source.kind === "captured-world-placement"
                ? "World placement"
                : "Instance placement",
          sourceName: humanName(realization, "Captured placement"),
          sourceLocationName:
            typeof realization.sourceLocationId === "string"
              ? (locations.get(realization.sourceLocationId) ??
                "Captured Location")
              : "Captured Location",
          ...(typeof realization.currentLocationId === "string"
            ? {
                currentLocationName:
                  locations.get(realization.currentLocationId) ??
                  "Captured Location",
              }
            : {}),
          ...(typeof source.campaignPlacementDefinitionId === "string"
            ? {
                campaignPlacementDefinitionId:
                  source.campaignPlacementDefinitionId,
              }
            : {}),
          ...(typeof source.capturedWorldPlacementDefinitionId === "string"
            ? {
                capturedWorldPlacementDefinitionId:
                  source.capturedWorldPlacementDefinitionId,
              }
            : {}),
          ...(typeof source.worldPlacementDefinitionId === "string"
            ? {
                capturedWorldPlacementDefinitionId:
                  source.worldPlacementDefinitionId,
              }
            : {}),
          ...(typeof realizedEntity.kind === "string"
            ? {
                realizedEntity: {
                  ...realizedEntity,
                  name: humanName(realization, "Runtime entity"),
                },
              }
            : {}),
        };
      }),
      replacementOptions: allReplacementOptions.slice(0, 200),
      totalReplacementOptions: allReplacementOptions.length,
      replacementOptionsTruncated: allReplacementOptions.length > 200,
    };
  }

  async decidePlacement(
    id: string,
    realizationId: string,
    ownerUserId: string,
    dto: DecideCampaignInstancePlacementDto,
  ) {
    const instance = await this.ownedEditable(id, ownerUserId);
    const state = requireRuntime(instance);
    const current = arrayValue(state.placementRealizations);
    const index = current.findIndex(
      (entry) => objectValue(objectValue(entry).identity).id === realizationId,
    );
    if (index < 0) {
      throw new NotFoundException(
        "The selected Instance placement was not found.",
      );
    }
    const prior = objectValue(current[index]);
    const status =
      dto.action === "defer"
        ? "deferred"
        : dto.action === "remove"
          ? "removed"
          : dto.action === "replace"
            ? "replaced"
            : "realized";
    if (prior.status === status) {
      throw new ConflictException(
        "This placement already has the requested status.",
      );
    }
    if (dto.action === "replace" && !dto.replacement) {
      throw new BadRequestException("Choose a replacement runtime entity.");
    }
    const resolved =
      dto.action === "realize" || dto.action === "replace"
        ? resolvePlacementEntity(instance, prior, state, dto.replacement)
        : {
            creatureEmbodiments: arrayValue(state.creatureEmbodiments),
            itemInstances: arrayValue(state.itemInstances),
            realizedEntity: undefined,
          };
    const nextState = await instanceCommand(
      state,
      instance,
      ownerUserId,
      "placement",
      {
        realizationId,
        action: dto.action,
        notes: dto.notes,
        resolved: {
          ...resolved,
          creatureEmbodiments: [...resolved.creatureEmbodiments],
          itemInstances: [...resolved.itemInstances],
        },
      },
    );
    await this.writeRuntime(
      instance,
      ownerUserId,
      dto.expectedRuntimeRevision,
      nextState,
      "instance.placement.changed",
      humanName(prior, "Instance placement"),
      "Placement",
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: dto.expectedRuntimeRevision + 1,
      affected: [
        {
          name: humanName(prior, "Instance placement"),
          typeLabel: "Placement",
        },
      ],
    };
  }

  async placeActor(
    id: string,
    ownerUserId: string,
    actorId: string,
    dto: PlaceCampaignInstanceActorDto,
  ) {
    const instance = await this.ownedEditable(id, ownerUserId);
    const state = requireRuntime(instance);
    if (instance.runtime!.revision !== dto.expectedRuntimeRevision)
      throw new ConflictException(
        "Instance runtime changed; reload and retry.",
      );
    const actors = arrayValue(state.creatureEmbodiments).map(objectValue);
    const actor = actors.find((a) => a.runtimeCreatureId === actorId);
    if (!actor)
      throw new NotFoundException(
        "The actor was not found in this Campaign Instance.",
      );
    const creature = objectValue(actor.creature);
    if (dto.position !== null) {
      const issue = capturedActorPositionIssue(
        instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
        dto.locationId,
        dto.position,
      );
      if (issue) throw new BadRequestException(issue);
    }
    let nextCreature;
    try {
      const Actor =
        objectValue(actor.source).kind === "character" ? Character : Creature;
      const owner = Actor.deserializePayload(creature);
      try {
        const receipt = await owner.command("place", {
          initiator: ownerUserId,
          params: {
            locationId: dto.locationId,
            position: dto.position,
            updatedAt: new Date().toISOString(),
          },
          context: {},
        });
        if (receipt.status === "rejected")
          throw new TypeError(receipt.reason ?? "Actor placement rejected.");
        nextCreature = cleanJsonValue(owner.serialize().data, 50_000);
      } finally {
        owner.dispose();
      }
    } catch (error) {
      throw new ConflictException(
        error instanceof Error ? error.message : "Invalid actor placement.",
      );
    }
    const nextState = {
      ...state,
      creatureEmbodiments: actors.map((a) =>
        a === actor ? { ...a, creature: nextCreature } : a,
      ),
    };
    await this.writeRuntime(
      instance,
      ownerUserId,
      dto.expectedRuntimeRevision,
      nextState,
      "instance.actor.placed",
      typeof creature.name === "string" ? creature.name : "Actor",
      "Actor",
    );
    return this.embodiments(id, ownerUserId);
  }

  async embodiments(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const state = requireRuntime(instance);
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      runtimeRevision: instance.runtime!.revision,
      terrainLocations: snapshotRecords(
        instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
        "locations",
      )
        .filter(
          (r) => objectValue(objectValue(r.payload).map).kind === "isometric",
        )
        .map((r) => ({
          id: r.sourceId,
          name: humanName(r.payload, "Captured Location"),
        })),
      items: arrayValue(state.creatureEmbodiments).map((value) => {
        const embodiment = objectValue(value);
        const creature = objectValue(embodiment.creature);
        const source = objectValue(embodiment.source);
        return {
          runtimeCreatureId: embodiment.runtimeCreatureId,
          name:
            typeof creature.name === "string" && creature.name.trim()
              ? creature.name.trim()
              : "Unnamed Creature",
          sourceTypeLabel:
            typeof source.kind === "string"
              ? source.kind.replaceAll("-", " ")
              : "Captured creature",
          sourceName:
            typeof creature.name === "string" && creature.name.trim()
              ? creature.name.trim()
              : "Captured creature",
          currentLocationId: creature.currentLocationId,
          currentLocationName: capturedLocationNames(instance).get(
            typeof creature.currentLocationId === "string"
              ? creature.currentLocationId
              : "",
          ),
          terrainPosition: creature.terrainPosition,
          policyLabel: "Independent Instance embodiment",
          policyDefaulted: false,
        };
      }),
    };
  }

  async roster(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const [memberships, invitations, agents, characters] = await Promise.all([
      this.prisma.campaignInstanceHumanMembership.findMany({
        where: { campaignInstanceId: id },
        orderBy: [{ role: "asc" }, { displayName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          displayName: true,
          role: true,
          status: true,
          joinedAt: true,
          leftAt: true,
        },
      }),
      this.prisma.campaignInstanceInvitation.findMany({
        where: { campaignInstanceId: id },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 200,
        select: {
          id: true,
          invitedName: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          emailEncrypted: true,
          phoneEncrypted: true,
          deliveryAttempts: {
            orderBy: { attemptedAt: "desc" },
            take: 10,
            select: {
              channel: true,
              status: true,
              failureCategory: true,
              attemptedAt: true,
            },
          },
        },
      }),
      this.prisma.campaignInstanceAgentParticipation.findMany({
        where: { campaignInstanceId: id },
        orderBy: [{ agentName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          agentName: true,
          status: true,
          observeCapabilities: true,
          actCapabilities: true,
        },
      }),
      this.prisma.campaignInstanceCharacterAssociation.findMany({
        where: { campaignInstanceId: id },
        orderBy: [{ characterName: "asc" }, { characterId: "asc" }],
        select: {
          characterId: true,
          characterName: true,
          status: true,
          playerMembershipId: true,
          playerMembership: { select: { displayName: true } },
          draft: { select: { status: true } },
        },
      }),
    ]);
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      memberships: memberships.map((row) => ({
        membershipId: row.id,
        displayName: row.displayName,
        role: row.role.toLowerCase(),
        status: row.status.toLowerCase(),
        joinedAt: row.joinedAt.toISOString(),
        leftAt: row.leftAt?.toISOString(),
      })),
      invitations: invitations.map((row) => ({
        invitationId: row.id,
        invitedName: row.invitedName ?? "Invited participant",
        role: row.role.toLowerCase(),
        status:
          row.status === "PENDING" && row.expiresAt.getTime() <= Date.now()
            ? "expired"
            : row.status.toLowerCase(),
        expiresAt: row.expiresAt.toISOString(),
        delivery: latestDeliveries(row.deliveryAttempts),
      })),
      agents: agents.map((row) => ({
        participationId: row.id,
        name: row.agentName,
        status: row.status.toLowerCase(),
        observeCapabilities: stringArray(row.observeCapabilities),
        actCapabilities: stringArray(row.actCapabilities),
      })),
      characters: characters.map((row) => ({
        characterId: row.characterId,
        playerMembershipId: row.playerMembershipId,
        name: row.characterName,
        playerName: row.playerMembership.displayName,
        status: row.status.toLowerCase(),
        sheetStatus:
          row.draft?.status.toLowerCase().replaceAll("_", "-") ?? "in-progress",
        readiness:
          row.status === "ACTIVE" ||
          row.status === "RETIRED" ||
          row.status === "DEAD" ||
          row.draft?.status === "COMPLETE"
            ? "ready"
            : "blocked",
      })),
    };
  }

  async configureAgent(
    id: string,
    ownerUserId: string,
    dto: ConfigureCampaignInstanceAgentDto,
  ) {
    await this.ownedEditable(id, ownerUserId);
    const capabilityOwner = InstanceParticipation.deserializePayload({
      kind: "agent",
      status: "configured",
    });
    let observe: string[], act: string[];
    try {
      const result = await capabilityOwner.command("configureCapabilities", {
        initiator: ownerUserId,
        params: { observe: dto.observe, act: dto.act },
        context: {},
      });
      if (result.status === "rejected")
        throw new TypeError("Agent capability configuration is invalid.");
      observe = [...(capabilityOwner.state.data.observeCapabilities ?? [])];
      act = [...(capabilityOwner.state.data.actCapabilities ?? [])];
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "Agent capability configuration is invalid.",
      );
    } finally {
      capabilityOwner.dispose();
    }
    const agent = await this.prisma.agentIdentity.findFirst({
      where: { id: dto.agentId, ownerUserId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!agent)
      throw new NotFoundException("The selected Agent was not found.");
    const participation = await this.withAudit(
      id,
      ownerUserId,
      "instance.agent.configured",
      agent.name,
      "Agent",
      {
        observeCapabilityCount: observe.length,
        actCapabilityCount: act.length,
      },
      async (client) => {
        try {
          return await client.campaignInstanceAgentParticipation.create({
            data: {
              campaignInstanceId: id,
              agentId: agent.id,
              agentName: agent.name,
              observeCapabilities: observe,
              actCapabilities: act,
            },
            select: { id: true, agentName: true, status: true },
          });
        } catch (error) {
          if (isPrismaCode(error, "P2002")) {
            throw new ConflictException(
              "This Agent already participates in the Campaign Instance.",
            );
          }
          throw error;
        }
      },
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: (await this.owned(id, ownerUserId)).name,
      participationId: participation.id,
      agentName: participation.agentName,
      status: participation.status.toLowerCase(),
      observeCapabilities: observe,
      actCapabilities: act,
    };
  }

  async availableAgents(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const rows = await this.prisma.agentIdentity.findMany({
      where: {
        ownerUserId,
        instanceParticipations: { none: { campaignInstanceId: id } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
      select: { id: true, name: true, status: true },
    });
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      items: rows.map((row) => ({
        agentId: row.id,
        name: row.name.trim() || "Unnamed Agent",
        status: row.status.toLowerCase(),
      })),
      total: rows.length,
    };
  }

  async updateAgentCapabilities(
    id: string,
    participationId: string,
    ownerUserId: string,
    input: {
      expectedObserve: string[];
      expectedAct: string[];
      observe: string[];
      act: string[];
    },
  ) {
    await this.ownedEditable(id, ownerUserId);
    if (
      !input ||
      ![
        input.expectedObserve,
        input.expectedAct,
        input.observe,
        input.act,
      ].every(
        (value) =>
          Array.isArray(value) &&
          value.length <= 100 &&
          value.every((key) => typeof key === "string"),
      )
    )
      throw new BadRequestException("Invalid Agent capabilities.");
    const row = await this.prisma.campaignInstanceAgentParticipation.findFirst({
      where: { id: participationId, campaignInstanceId: id },
    });
    if (!row)
      throw new NotFoundException(
        "The selected Agent participation was not found.",
      );
    if (!["CONFIGURED", "PAUSED"].includes(row.status))
      throw new ConflictException(
        "Pause the Agent before changing its capabilities.",
      );
    const owner = InstanceParticipation.deserializePayload({
      kind: "agent",
      status: row.status.toLowerCase(),
    });
    try {
      const receipt = await owner.command("configureCapabilities", {
        initiator: ownerUserId,
        params: { observe: input.observe, act: input.act },
        context: {},
      });
      if (receipt.status === "rejected")
        throw new BadRequestException("Agent capabilities were rejected.");
      await this.withAudit(
        id,
        ownerUserId,
        "instance.agent.capabilities-changed",
        row.agentName,
        "Agent",
        {},
        async (tx) => {
          const result = await tx.campaignInstanceAgentParticipation.updateMany(
            {
              where: {
                id: participationId,
                campaignInstanceId: id,
                status: row.status,
                observeCapabilities: { equals: input.expectedObserve },
                actCapabilities: { equals: input.expectedAct },
              },
              data: {
                observeCapabilities: [
                  ...(owner.state.data.observeCapabilities ?? []),
                ],
                actCapabilities: [...(owner.state.data.actCapabilities ?? [])],
                status: "CONFIGURED",
              },
            },
          );
          if (result.count !== 1)
            throw new ConflictException(
              "Agent capabilities changed; reload and retry.",
            );
        },
      );
    } catch (error) {
      if (error instanceof TypeError)
        throw new BadRequestException(error.message);
      throw error;
    } finally {
      owner.dispose();
    }
    return this.roster(id, ownerUserId);
  }

  async updateAgentStatus(
    id: string,
    participationId: string,
    ownerUserId: string,
    dto: UpdateCampaignInstanceAgentStatusDto,
  ) {
    await this.ownedEditable(id, ownerUserId);
    const participationOwner = InstanceParticipation.deserializePayload({
      kind: "agent",
      status: dto.expectedStatus,
    });
    let nextStatus: string;
    try {
      const result = await participationOwner.command("transition", {
        initiator: ownerUserId,
        params: {
          expectedStatus: dto.expectedStatus,
          status: dto.status,
          occurredAt: new Date().toISOString(),
        },
        context: {},
      });
      if (result.status === "rejected")
        throw new TypeError(
          "The requested Agent status transition is not allowed.",
        );
      nextStatus = participationOwner.state.data.status;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "The requested Agent status transition is not allowed.",
      );
    } finally {
      participationOwner.dispose();
    }
    const selectedAgent =
      await this.prisma.campaignInstanceAgentParticipation.findFirst({
        where: { id: participationId, campaignInstanceId: id },
        select: { agentName: true },
      });
    if (!selectedAgent) {
      throw new NotFoundException(
        "The selected Agent participation was not found.",
      );
    }
    const status =
      nextStatus.toUpperCase() as CampaignInstanceAgentParticipationStatus;
    const participation = await this.withAudit(
      id,
      ownerUserId,
      "instance.agent.status-changed",
      selectedAgent.agentName,
      "Agent",
      { from: dto.expectedStatus, to: dto.status },
      async (client) => {
        const updated =
          await client.campaignInstanceAgentParticipation.updateMany({
            where: {
              id: participationId,
              campaignInstanceId: id,
              status:
                dto.expectedStatus.toUpperCase() as CampaignInstanceAgentParticipationStatus,
            },
            data: { status },
          });
        if (updated.count !== 1) {
          throw new ConflictException(
            "Agent participation changed; reload and retry.",
          );
        }
        return client.campaignInstanceAgentParticipation.findFirst({
          where: { id: participationId, campaignInstanceId: id },
          select: {
            id: true,
            agentName: true,
            status: true,
            observeCapabilities: true,
            actCapabilities: true,
          },
        });
      },
    );
    if (!participation) {
      throw new NotFoundException(
        "The selected Agent participation was not found.",
      );
    }
    return {
      campaignInstanceId: id,
      campaignInstanceName: (await this.owned(id, ownerUserId)).name,
      participationId: participation.id,
      agentName: participation.agentName,
      status: participation.status.toLowerCase(),
      observeCapabilities: stringArray(participation.observeCapabilities),
      actCapabilities: stringArray(participation.actCapabilities),
    };
  }

  async sessions(id: string, ownerUserId: string) {
    await this.owned(id, ownerUserId);
    const rows = await this.prisma.campaignInstanceSession.findMany({
      where: { campaignInstanceId: id },
      orderBy: [
        { status: "asc" },
        { scheduledFor: "asc" },
        { name: "asc" },
        { id: "asc" },
      ],
      take: 200,
      select: {
        id: true,
        name: true,
        status: true,
        metadataRevision: true,
        scheduledFor: true,
        startedAt: true,
        concludedAt: true,
        cancelledAt: true,
        _count: { select: { participations: true } },
      },
    });
    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status.toLowerCase(),
      metadataRevision: row.metadataRevision,
      scheduledFor: row.scheduledFor?.toISOString(),
      startedAt: row.startedAt?.toISOString(),
      concludedAt: row.concludedAt?.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString(),
      participantCount: row._count.participations,
    }));
    const instance = await this.owned(id, ownerUserId);
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      current: items.filter(
        (row) => row.status === "active" || row.status === "paused",
      ),
      planned: items.filter(
        (row) => row.status === "planned" || row.status === "lobby",
      ),
      history: items.filter(
        (row) => row.status === "concluded" || row.status === "cancelled",
      ),
      total: items.length,
    };
  }

  async continuation(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    const sessions = await this.prisma.campaignInstanceSession.findMany({
      where: {
        campaignInstanceId: id,
        status: { in: ["ACTIVE", "PAUSED", "LOBBY", "PLANNED"] },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, status: true, scheduledFor: true },
    });
    const active = sessions.filter((row) => row.status === "ACTIVE");
    const paused = sessions.filter((row) => row.status === "PAUSED");
    const selected =
      active.length === 1
        ? active[0]
        : paused.length === 1
          ? paused[0]
          : undefined;
    if (selected) {
      const kind = selected.status === "ACTIVE" ? "continue" : "resume";
      return {
        kind,
        campaignInstanceId: id,
        campaignInstanceName: instance.name,
        label: kind === "continue" ? "Continue" : "Resume",
        enabled: true,
        detail: `${selected.name} is ${selected.status.toLowerCase()}.`,
        session: { id: selected.id, name: selected.name },
      };
    }
    const eligible =
      active.length > 1
        ? active
        : paused.length > 1
          ? paused
          : sessions.filter(
              (row) => row.status === "LOBBY" || row.status === "PLANNED",
            );
    if (eligible.length === 1) {
      return {
        campaignInstanceId: id,
        campaignInstanceName: instance.name,
        kind: "open-planned",
        label: "Open Session",
        enabled: true,
        detail:
          eligible[0].status === "LOBBY"
            ? `${eligible[0].name} has an open lobby.`
            : `${eligible[0].name} is planned.`,
        session: { id: eligible[0].id, name: eligible[0].name },
      };
    }
    if (eligible.length > 1) {
      return {
        campaignInstanceId: id,
        campaignInstanceName: instance.name,
        kind: "choose",
        label: "Choose Session",
        enabled: true,
        detail: `${eligible.length} Sessions are eligible.`,
      };
    }
    return {
      kind: "plan-session",
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      label: "Plan a Session",
      enabled: false,
      detail: "Plan a Session before play can continue.",
    };
  }

  async versions(id: string, ownerUserId: string) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: { id, ownerUserId },
      select: {
        id: true,
        name: true,
        campaignDefinitionId: true,
        currentSnapshotId: true,
        currentSnapshot: {
          select: {
            predecessorSnapshotId: true,
            campaignDefinitionSnapshot: {
              select: { campaignDefinitionRevisionId: true },
            },
          },
        },
      },
    });
    if (!instance?.currentSnapshot)
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    const currentSnapshot = instance.currentSnapshot;
    const rows = await this.prisma.campaignInstanceSnapshot.findMany({
      where: { campaignInstanceId: id },
      orderBy: { snapshotNumber: "desc" },
      select: {
        id: true,
        snapshotNumber: true,
        reason: true,
        adoptedAt: true,
        campaignDefinitionSnapshot: {
          select: {
            campaignDefinitionRevision: {
              select: {
                name: true,
                revisionNumber: true,
                campaignDefinitionId: true,
              },
            },
          },
        },
        worldDefinitionSnapshot: {
          select: {
            worldDefinitionRevision: {
              select: {
                name: true,
                revisionNumber: true,
                worldDefinitionId: true,
              },
            },
          },
        },
      },
    });
    const targets = await this.prisma.campaignDefinitionSnapshot.findMany({
      where: {
        campaignDefinitionId: instance.campaignDefinitionId,
        campaignDefinitionRevision: {
          predecessorRevisionId:
            currentSnapshot.campaignDefinitionSnapshot
              .campaignDefinitionRevisionId,
          campaignDefinition: { ownerUserId },
        },
      },
      orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
      take: 50,
      select: {
        id: true,
        campaignDefinitionRevision: {
          select: {
            name: true,
            revisionNumber: true,
            campaignDefinitionId: true,
          },
        },
        capturedWorldSnapshot: {
          select: {
            worldDefinitionRevision: {
              select: {
                name: true,
                revisionNumber: true,
                worldDefinitionId: true,
              },
            },
          },
        },
      },
    });
    const activeSession = await this.prisma.campaignInstanceSession.findFirst({
      where: { campaignInstanceId: id, status: "ACTIVE" },
      select: { name: true },
    });
    const items = rows.map((row) => ({
      snapshotId: row.id,
      snapshotNumber: row.snapshotNumber,
      reason: row.reason.toLowerCase(),
      adoptedAt: row.adoptedAt.toISOString(),
      campaignDefinition: revisionReference(
        row.campaignDefinitionSnapshot.campaignDefinitionRevision,
        "campaign",
      ),
      worldDefinition: revisionReference(
        row.worldDefinitionSnapshot.worldDefinitionRevision,
        "world",
      ),
      current: row.id === instance.currentSnapshotId,
    }));
    const restoreTarget = items.find(
      (item) => item.snapshotId === currentSnapshot.predecessorSnapshotId,
    );
    return {
      campaignInstanceId: id,
      campaignInstanceName: instance.name,
      items,
      migrationTargets: targets.map((target) => ({
        campaignDefinitionSnapshotId: target.id,
        campaignDefinition: revisionReference(
          target.campaignDefinitionRevision,
          "campaign",
        ),
        worldDefinition: revisionReference(
          target.capturedWorldSnapshot.worldDefinitionRevision,
          "world",
        ),
      })),
      ...(restoreTarget ? { restoreTarget } : {}),
      migrationAvailable: !activeSession && targets.length > 0,
      ...(activeSession
        ? {
            migrationBlockedReason: `${activeSession.name} must stop before migration.`,
          }
        : {}),
    };
  }

  private async owned(id: string, ownerUserId: string) {
    const instance = await this.prisma.campaignInstance.findFirst({
      where: { id, ownerUserId },
      select: {
        id: true,
        name: true,
        status: true,
        currentSnapshotId: true,
        metadataRevision: true,
        currentSnapshot: {
          select: {
            campaignDefinitionSnapshot: { select: { manifest: true } },
            worldDefinitionSnapshot: { select: { manifest: true } },
          },
        },
        runtime: { select: { id: true, revision: true, state: true } },
      },
    });
    if (!instance) {
      throw new NotFoundException(
        "The selected Campaign Instance was not found.",
      );
    }
    return instance;
  }

  private async ownedEditable(id: string, ownerUserId: string) {
    const instance = await this.owned(id, ownerUserId);
    if (instance.status === "ARCHIVED" || instance.status === "CONCLUDED") {
      throw new ConflictException("This Campaign Instance is read-only.");
    }
    return instance;
  }

  private async writeRuntime(
    instance: Awaited<ReturnType<CampaignInstanceManagementService["owned"]>>,
    ownerUserId: string,
    expectedRevision: number,
    state: Record<string, Prisma.JsonValue>,
    action: string,
    subjectName: string,
    subjectType: string,
  ) {
    const validationIssues = validateRuntimeForCapturedPair(state, instance);
    if (validationIssues.length > 0) {
      throw new BadRequestException(
        `The Instance change is inconsistent with its captured Campaign and World: ${validationIssues[0].detail}`,
      );
    }
    await this.withAudit(
      instance.id,
      ownerUserId,
      action,
      subjectName,
      subjectType,
      {
        fromRuntimeRevision: expectedRevision,
        toRuntimeRevision: expectedRevision + 1,
      },
      async (client) => {
        await client.$executeRawUnsafe(
          'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
        );
        const openSession = await client.campaignInstanceSession.findFirst({
          where: {
            campaignInstanceId: instance.id,
            status: "ACTIVE",
          },
          select: { name: true },
        });
        if (openSession) {
          throw new ConflictException(
            `Pause or conclude ${openSession.name} before changing Campaign Instance state.`,
          );
        }
        const updated = await client.campaignInstanceRuntime.updateMany({
          where: {
            id: instance.runtime!.id,
            campaignInstanceId: instance.id,
            revision: expectedRevision,
          },
          data: { state: state, revision: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            "Instance runtime changed; reload and retry.",
          );
        }
      },
    );
  }

  private async withAudit<Result>(
    campaignInstanceId: string,
    actorUserId: string,
    action: string,
    subjectName: string,
    subjectType: string,
    detail: Prisma.InputJsonObject,
    operation: (
      client: Prisma.TransactionClient | PrismaService,
    ) => Promise<Result>,
  ): Promise<Result> {
    const execute = async (
      client: Prisma.TransactionClient | PrismaService,
    ) => {
      const result = await operation(client);
      await client.campaignInstanceAuditEvent.create({
        data: {
          campaignInstanceId,
          actorUserId,
          action,
          subjectName: subjectName.slice(0, 240) || "Campaign Instance",
          subjectType,
          detail,
        },
      });
      return result;
    };
    if (typeof this.prisma.$transaction !== "function") {
      return operation(this.prisma);
    }
    return this.prisma.$transaction((tx) => execute(tx));
  }
}

function runtimeState(
  value: unknown,
): value is Record<string, Prisma.JsonValue> {
  return objectValue(value).formatVersion === 1;
}

function requireRuntime(instance: {
  name: string;
  runtime: { state: unknown } | null;
}) {
  if (!instance.runtime || !runtimeState(instance.runtime.state)) {
    throw new ConflictException(
      `${instance.name} has no valid continuing runtime state.`,
    );
  }
  return instance.runtime.state;
}

function objectValue(value: unknown): Record<string, Prisma.JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function arrayValue(value: unknown): readonly Prisma.JsonValue[] {
  return Array.isArray(value) ? (value as Prisma.JsonValue[]) : [];
}

function cleanJsonObject(value: Record<string, unknown>, maximumBytes: number) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new BadRequestException("Submitted Instance data is too large.");
  }
  return JSON.parse(text) as Record<string, Prisma.JsonValue>;
}

function cleanJsonValue(
  value: unknown,
  maximumBytes: number,
): Prisma.JsonValue {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new BadRequestException("Submitted Instance data is too large.");
  }
  return JSON.parse(text) as Prisma.JsonValue;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function capturedCreaturePolicyProblems(
  snapshot: {
    worldDefinitionSnapshot: { manifest: unknown };
  } | null,
): string[] {
  if (
    !snapshot ||
    !isCanonicalSnapshotManifest(snapshot.worldDefinitionSnapshot.manifest)
  ) {
    return ["captured-world-unavailable"];
  }
  return snapshot.worldDefinitionSnapshot.manifest.records.flatMap((record) => {
    const payload = objectValue(record.payload);
    if (record.resourceType !== "definitions" || payload.kind !== "creature")
      return [];
    const resolved = resolveCreatureInstanceEmbodimentPolicy(
      payload.instanceEmbodimentPolicy,
    );
    if (!resolved) return [record.sourceId];
    return resolved.policy.strategy === "one-per-instance" ||
      resolved.policy.strategy === "one-per-realization"
      ? []
      : [record.sourceId];
  });
}

function snapshotRecords(manifest: unknown, resourceType: string) {
  return isCanonicalSnapshotManifest(manifest)
    ? manifest.records.filter((record) => record.resourceType === resourceType)
    : [];
}

function plotParentId(
  plot: Record<string, Prisma.JsonValue>,
): string | undefined {
  const parent = objectValue(plot.parent);
  return parent.kind === "subplot" &&
    typeof parent.parentPlotDefinitionId === "string"
    ? parent.parentPlotDefinitionId
    : undefined;
}

function humanName(value: unknown, fallback: string): string {
  const object = objectValue(value);
  const identity = objectValue(object.identity);
  const name = object.name ?? identity.name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

function humanNameFromPlot(
  instance: {
    currentSnapshot: {
      campaignDefinitionSnapshot: { manifest: unknown };
    } | null;
  },
  plotDefinitionId: string,
) {
  const record = snapshotRecords(
    instance.currentSnapshot?.campaignDefinitionSnapshot.manifest,
    "plots",
  ).find((candidate) => candidate.sourceId === plotDefinitionId);
  return humanName(record?.payload, "Plot");
}

function capturedLocationNames(instance: {
  currentSnapshot: {
    worldDefinitionSnapshot: { manifest: unknown };
  } | null;
}) {
  return new Map(
    snapshotRecords(
      instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
      "locations",
    ).map((record) => [
      record.sourceId,
      humanName(record.payload, "Captured Location"),
    ]),
  );
}

function latestDeliveries(
  attempts: readonly {
    channel: string;
    status: string;
    failureCategory: string | null;
    attemptedAt: Date;
  }[],
) {
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    if (!latest.has(attempt.channel)) latest.set(attempt.channel, attempt);
  }
  return [...latest.values()].map((attempt) => ({
    channel: attempt.channel.toLowerCase() as "email" | "sms",
    status: attempt.status.toLowerCase() as
      "pending" | "sent" | "captured" | "delivered" | "failed",
    lastAttemptedAt: attempt.attemptedAt.toISOString(),
    ...(attempt.status === "FAILED"
      ? { failureMessage: "Delivery failed; retry the invitation." }
      : {}),
  }));
}

export function validateRuntimeForCapturedPair(
  state: Record<string, Prisma.JsonValue>,
  instance: {
    id: string;
    currentSnapshotId: string | null;
    currentSnapshot: {
      campaignDefinitionSnapshot: { manifest: unknown };
      worldDefinitionSnapshot: { manifest: unknown };
    } | null;
  },
) {
  const campaignManifest =
    instance.currentSnapshot?.campaignDefinitionSnapshot.manifest;
  const worldManifest =
    instance.currentSnapshot?.worldDefinitionSnapshot.manifest;
  if (
    !instance.currentSnapshotId ||
    !isCanonicalSnapshotManifest(campaignManifest) ||
    !isCanonicalSnapshotManifest(worldManifest)
  ) {
    return [{ detail: "The captured Campaign and World pair is unavailable." }];
  }
  const terrainCache = new Map();
  for (const value of arrayValue(state.creatureEmbodiments)) {
    const creature = objectValue(objectValue(value).creature);
    if (creature.terrainPosition !== undefined) {
      const issue = capturedActorPositionIssue(
        worldManifest,
        creature.currentLocationId,
        creature.terrainPosition,
        terrainCache,
      );
      if (issue) return [{ detail: issue }];
    }
  }
  return CampaignInstance.validateRuntime(
    state,
    runtimeCaptureContext(instance),
  ).issues;
}

function revisionReference(
  revision: {
    name: string;
    revisionNumber: number;
    campaignDefinitionId?: string;
    worldDefinitionId?: string;
  },
  kind: "campaign" | "world",
) {
  return {
    definitionId:
      kind === "campaign"
        ? revision.campaignDefinitionId
        : revision.worldDefinitionId,
    name: revision.name,
    revisionNumber: revision.revisionNumber,
    authoringHref:
      kind === "campaign"
        ? `/campaigns/definitions/${revision.campaignDefinitionId}`
        : `/worlds/${revision.worldDefinitionId}`,
  };
}

function resolvePlacementEntity(
  instance: {
    id: string;
    currentSnapshot: {
      campaignDefinitionSnapshot: { manifest: unknown };
      worldDefinitionSnapshot: { manifest: unknown };
    } | null;
  },
  realization: Record<string, Prisma.JsonValue>,
  state: Record<string, Prisma.JsonValue>,
  replacement: DecideCampaignInstancePlacementDto["replacement"],
) {
  try {
    return CampaignInstance.resolvePlacement(
      {
        id: instance.id,
        campaignRecords: snapshotRecordsAll(
          instance.currentSnapshot?.campaignDefinitionSnapshot.manifest,
        ),
        worldRecords: snapshotRecordsAll(
          instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
        ),
        createId: randomUUID,
        updatedAt: new Date().toISOString(),
      },
      realization,
      state,
      replacement,
    ) as {
      creatureEmbodiments: Prisma.JsonValue[];
      itemInstances: Prisma.JsonValue[];
      realizedEntity: Prisma.JsonValue;
    };
  } catch (error) {
    throw new ConflictException(
      error instanceof Error
        ? error.message
        : "Placement realization rejected.",
    );
  }
}
function snapshotRecordsAll(manifest: unknown) {
  return isCanonicalSnapshotManifest(manifest) ? manifest.records : [];
}

function preparationLocations(instance: {
  currentSnapshot: { worldDefinitionSnapshot: { manifest: unknown } } | null;
}) {
  return snapshotRecords(
    instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
    "locations",
  ).map((record) => ({
    id: record.sourceId,
    name: humanName(record.payload, "Unnamed captured Location"),
  }));
}

export function runtimeCaptureContext(
  instance: Parameters<typeof validateRuntimeForCapturedPair>[1],
) {
  const campaignManifest =
    instance.currentSnapshot?.campaignDefinitionSnapshot.manifest;
  const worldManifest =
    instance.currentSnapshot?.worldDefinitionSnapshot.manifest;
  if (
    !instance.currentSnapshotId ||
    !isCanonicalSnapshotManifest(campaignManifest) ||
    !isCanonicalSnapshotManifest(worldManifest)
  )
    throw new BadRequestException(
      "The captured Campaign and World pair is unavailable.",
    );
  const capturedPlotObjectiveIds = new Map(
    campaignManifest.records
      .filter((record) => record.resourceType === "plots")
      .map((record) => [
        record.sourceId,
        new Set(
          arrayValue(objectValue(record.payload).objectives)
            .map(objectValue)
            .flatMap((objective) =>
              typeof objective.id === "string" ? [objective.id] : [],
            ),
        ),
      ]),
  );
  const capturedCreaturePolicies = new Map();
  for (const record of worldManifest.records) {
    const payload = objectValue(record.payload);
    if (record.resourceType !== "definitions" || payload.kind !== "creature")
      continue;
    const policy = resolveCreatureInstanceEmbodimentPolicy(
      payload.instanceEmbodimentPolicy,
    );
    if (
      policy &&
      (policy.policy.strategy === "one-per-instance" ||
        policy.policy.strategy === "one-per-realization")
    ) {
      capturedCreaturePolicies.set(record.sourceId, policy);
    }
  }
  return {
    campaignInstanceId: instance.id,
    campaignInstanceSnapshotId: instance.currentSnapshotId,
    capturedPlotObjectiveIds,
    capturedLocationIds: new Set(
      worldManifest.records
        .filter((record) => record.resourceType === "locations")
        .map((record) => record.sourceId),
    ),
    capturedCampaignPlacementIds: new Set(
      campaignManifest.records
        .filter((record) => record.resourceType === "campaign-placements")
        .map((record) => record.sourceId),
    ),
    capturedWorldPlacementIds: new Set(
      worldManifest.records
        .filter((record) => record.resourceType === "world-placements")
        .map((record) => record.sourceId),
    ),
    capturedCreaturePolicies,
  } as never;
}

async function instanceCommand<
  K extends keyof import("@aow/domain").CampaignInstanceCommands,
>(
  state: Record<string, Prisma.JsonValue>,
  instance: Parameters<typeof validateRuntimeForCapturedPair>[1],
  initiator: string,
  command: K,
  params: import("@aow/domain").CampaignInstanceCommands[K]["params"],
): Promise<Record<string, Prisma.JsonValue>> {
  const owner = CampaignInstance.deserializePayload(state, {
    mode: "runtime",
    captured: runtimeCaptureContext(instance),
    plots: snapshotRecords(
      instance.currentSnapshot?.campaignDefinitionSnapshot.manifest,
      "plots",
    ),
  });
  try {
    const receipt = await owner.command(command, {
      initiator,
      params,
      context: {},
    });
    if (receipt.status === "rejected")
      throw new BadRequestException(
        receipt.reason ?? "Instance change rejected.",
      );
    return owner.serializePayload() as Record<string, Prisma.JsonValue>;
  } catch (error) {
    if (error instanceof TypeError)
      throw new BadRequestException(error.message);
    throw error;
  } finally {
    owner.dispose();
  }
}
