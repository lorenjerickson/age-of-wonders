import { isTerrainActorPosition } from "@aow/common";
import type {
  CampaignInstanceRuntimeState,
  CampaignInstanceRuntimeValidationContext,
  CampaignInstanceRuntimeValidationResult,
  CampaignInstanceRuntimeValidationIssue,
  CampaignInstanceRuntimeValidationIssueCode,
  CampaignInstancePlacementSource,
  ResolvedCreatureInstanceEmbodimentPolicy,
  CreatureId,
} from "@aow/common";
/** Pure consistency validation; model-schema conformance remains an additional server check. */
export function validateCampaignInstanceRuntimeState(
  state: CampaignInstanceRuntimeState,
  context: CampaignInstanceRuntimeValidationContext,
): CampaignInstanceRuntimeValidationResult {
  const issues: CampaignInstanceRuntimeValidationIssue[] = [];
  const add = (
    code: CampaignInstanceRuntimeValidationIssueCode,
    subject: string,
    detail: string,
  ) => issues.push({ code, subject, detail });

  if (state.encounter !== undefined) {
    const encounter = state.encounter;
    const knownActors = new Set(
      state.creatureEmbodiments.map((actor) => actor.runtimeEntityId),
    );
    if (
      !encounter ||
      encounter.schemaVersion !== 2 ||
      !Number.isSafeInteger(encounter.revision) ||
      encounter.revision < 0 ||
      ![
        "setup",
        "planning",
        "locked",
        "resolving",
        "adjudication",
        "review",
        "published",
        "completed",
      ].includes(encounter.phase) ||
      !Array.isArray(encounter.combatants) ||
      !Array.isArray(encounter.simulated) ||
      encounter.combatants.some((actor) => !knownActors.has(actor.entityId)) ||
      new Set(encounter.combatants.map((actor) => actor.entityId)).size !==
        encounter.combatants.length
    ) {
      add(
        "invalid-encounter",
        "Encounter",
        "The encounter must be a versioned ordered-plan state bound to this Instance's actors.",
      );
    }
  }
  for (const actor of state.creatureEmbodiments) {
    const health = actor.creature.combat;
    if (
      health !== undefined &&
      (!health ||
        !Number.isFinite(health.hp) ||
        !Number.isFinite(health.maxHp) ||
        health.maxHp <= 0 ||
        health.hp < 0 ||
        health.hp > health.maxHp ||
        typeof health.prone !== "boolean" ||
        typeof health.removed !== "boolean" ||
        (health.incapacitation != null &&
          !["unconscious", "dead"].includes(health.incapacitation)))
    )
      add(
        "invalid-encounter",
        "Actor health",
        "Combat health must be explicitly configured and within its maximum.",
      );
  }
  const plotIds = [...context.capturedPlotObjectiveIds.keys()];
  const progressIds = state.plotProgress.map(
    ({ plotDefinitionId }) => plotDefinitionId,
  );
  if (!sameUniqueMembers(plotIds, progressIds)) {
    add(
      "plot-progress-membership-mismatch",
      "Plot progress",
      "Instance Plot progress must exactly cover every captured root Plot and subplot once.",
    );
  }
  if (
    state.preparation.startingLocationId !== undefined &&
    !context.capturedLocationIds.has(state.preparation.startingLocationId)
  ) {
    add(
      "location-not-captured",
      "Instance preparation",
      "The starting Location is outside the captured World.",
    );
  }

  for (const progress of state.plotProgress) {
    if (progress.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "plot-progress-instance-mismatch",
        "Plot progress",
        "A Plot progress overlay belongs to a different Campaign Instance.",
      );
    }
    const objectiveIds = context.capturedPlotObjectiveIds.get(
      progress.plotDefinitionId,
    );
    for (const objective of progress.objectiveProgress ?? []) {
      if (!objectiveIds?.has(objective.objectiveId)) {
        add(
          "objective-progress-not-captured",
          "Plot objective progress",
          "An Objective progress entry does not exist in the captured Plot.",
        );
      }
    }
  }

  const realizationIds = new Set<string>();
  for (const realization of state.placementRealizations) {
    const subject = realization.name.trim() || "Instance placement";
    if (realizationIds.has(realization.identity.id)) {
      add(
        "placement-realization-duplicate",
        subject,
        "An Instance placement is listed more than once.",
      );
    }
    realizationIds.add(realization.identity.id);
    if (realization.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "placement-realization-instance-mismatch",
        subject,
        "An Instance placement belongs to a different Campaign Instance.",
      );
    }
    if (
      !context.capturedLocationIds.has(realization.sourceLocationId) ||
      (realization.currentLocationId !== undefined &&
        !context.capturedLocationIds.has(realization.currentLocationId))
    ) {
      add(
        "location-not-captured",
        subject,
        "An Instance placement refers to a Location outside the captured World.",
      );
    }
    if (!placementSourceIsCaptured(realization.source, context)) {
      add(
        "placement-source-not-captured",
        subject,
        "An Instance placement source is absent from the captured Campaign and World snapshots.",
      );
    }
    const requiresEntity =
      realization.status === "realized" || realization.status === "replaced";
    if (requiresEntity !== (realization.realizedEntity !== undefined)) {
      add(
        "placement-status-entity-mismatch",
        subject,
        "A realized or replaced placement must name one runtime entity, while other placement states must not.",
      );
    }
  }

  const creatureIds = new Set<CreatureId>();
  const capturedSourceCounts = new Map<CreatureId, number>();
  for (const embodiment of state.creatureEmbodiments) {
    const subject = embodiment.creature.name.trim() || "Creature embodiment";
    if (creatureIds.has(embodiment.runtimeCreatureId)) {
      add(
        "creature-embodiment-duplicate",
        subject,
        "A runtime Creature identity is used by more than one embodiment.",
      );
    }
    creatureIds.add(embodiment.runtimeCreatureId);
    if (embodiment.campaignInstanceId !== context.campaignInstanceId) {
      add(
        "creature-embodiment-instance-mismatch",
        subject,
        "A Creature embodiment belongs to a different Campaign Instance.",
      );
    }
    if (
      embodiment.creature.identity.id !== embodiment.runtimeCreatureId ||
      embodiment.creature.entityId !== embodiment.runtimeEntityId
    ) {
      add(
        "creature-embodiment-identity-mismatch",
        subject,
        "A Creature embodiment's runtime identities do not match its mutable Creature state.",
      );
    }
    if (
      embodiment.creature.terrainPosition !== undefined &&
      (!embodiment.creature.currentLocationId ||
        !context.capturedLocationIds.has(
          embodiment.creature.currentLocationId,
        ) ||
        !isTerrainActorPosition(embodiment.creature.terrainPosition))
    )
      add(
        "invalid-terrain-position",
        subject,
        "An actor terrain position requires a captured Location and valid grid coordinates.",
      );
    if (embodiment.source.kind === "captured-world-creature") {
      const sourceId = embodiment.source.sourceCreatureId;
      const capturedPolicy = context.capturedCreaturePolicies.get(sourceId);
      if (!capturedPolicy) {
        add(
          "creature-source-not-captured",
          subject,
          "A Creature embodiment source is absent from the captured World.",
        );
      } else {
        if (
          !sameEmbodimentPolicy(
            embodiment.source.embodimentPolicy,
            capturedPolicy,
          )
        ) {
          add(
            "creature-embodiment-policy-mismatch",
            subject,
            "A Creature embodiment does not retain the policy resolved from its captured source.",
          );
        }
        const count = (capturedSourceCounts.get(sourceId) ?? 0) + 1;
        capturedSourceCounts.set(sourceId, count);
        const maximum =
          capturedPolicy.policy.strategy === "one-per-instance"
            ? 1
            : capturedPolicy.policy.maximumPerCampaignInstance;
        if (maximum !== undefined && count > maximum) {
          add(
            "creature-embodiment-cardinality-exceeded",
            subject,
            "This captured Creature's explicit embodiment policy does not permit another embodiment in this Campaign Instance.",
          );
        }
      }
    }
    if (
      embodiment.source.kind === "campaign-placement" &&
      !context.capturedCampaignPlacementIds.has(
        embodiment.source.campaignPlacementDefinitionId,
      )
    ) {
      add(
        "creature-source-not-captured",
        subject,
        "A Creature embodiment source is absent from the captured Campaign Definition.",
      );
    }
    if (
      embodiment.source.kind === "campaign-placement" &&
      embodiment.source.sourceCreatureId !== undefined
    ) {
      const sourceId = embodiment.source.sourceCreatureId;
      const capturedPolicy = context.capturedCreaturePolicies.get(sourceId);
      if (!capturedPolicy) {
        add(
          "creature-source-not-captured",
          subject,
          "A Campaign placement embodiment refers to a Creature absent from the captured World.",
        );
      } else {
        if (
          !embodiment.source.embodimentPolicy ||
          !sameEmbodimentPolicy(
            embodiment.source.embodimentPolicy,
            capturedPolicy,
          )
        ) {
          add(
            "creature-embodiment-policy-mismatch",
            subject,
            "A Campaign placement embodiment does not retain the policy resolved from its captured Creature source.",
          );
        }
        const count = (capturedSourceCounts.get(sourceId) ?? 0) + 1;
        capturedSourceCounts.set(sourceId, count);
        const maximum =
          capturedPolicy.policy.strategy === "one-per-instance"
            ? 1
            : capturedPolicy.policy.maximumPerCampaignInstance;
        if (maximum !== undefined && count > maximum) {
          add(
            "creature-embodiment-cardinality-exceeded",
            subject,
            "This captured Creature's explicit embodiment policy does not permit another embodiment in this Campaign Instance.",
          );
        }
      }
    }
  }

  const itemIds = new Set(state.itemInstances.map(({ id }) => id));
  for (const realization of state.placementRealizations) {
    const entity = realization.realizedEntity;
    if (
      entity?.kind === "creature" &&
      !creatureIds.has(entity.runtimeCreatureId)
    ) {
      add(
        "runtime-entity-not-found",
        realization.name || "Instance placement",
        "A placement refers to a missing Instance Creature embodiment.",
      );
    }
    if (entity?.kind === "item" && !itemIds.has(entity.runtimeItemId)) {
      add(
        "runtime-entity-not-found",
        realization.name || "Instance placement",
        "A placement refers to a missing Instance Item.",
      );
    }
  }

  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject),
  );
  return { valid: issues.length === 0, issues };
}

function sameUniqueMembers<Value>(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  return (
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function placementSourceIsCaptured(
  source: CampaignInstancePlacementSource,
  context: CampaignInstanceRuntimeValidationContext,
): boolean {
  if (source.kind === "campaign-placement") {
    return (
      context.capturedCampaignPlacementIds.has(
        source.campaignPlacementDefinitionId,
      ) &&
      (source.capturedWorldPlacementDefinitionId === undefined ||
        context.capturedWorldPlacementIds.has(
          source.capturedWorldPlacementDefinitionId,
        ))
    );
  }
  return (
    source.kind === "instance-created" ||
    context.capturedWorldPlacementIds.has(source.worldPlacementDefinitionId)
  );
}

function sameEmbodimentPolicy(
  left: ResolvedCreatureInstanceEmbodimentPolicy,
  right: ResolvedCreatureInstanceEmbodimentPolicy,
): boolean {
  return (
    left.source === right.source &&
    left.policy.strategy === right.policy.strategy &&
    left.policy.maximumPerCampaignInstance ===
      right.policy.maximumPerCampaignInstance
  );
}
