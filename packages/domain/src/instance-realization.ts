import { resolveCreatureInstanceEmbodimentPolicy } from "@aow/common";
import { Creature } from "./creature";
import { copyEntityData } from "./entity";
type Row = Record<string, unknown>;
export interface RealizationCapture {
  id: string;
  campaignRecords: readonly {
    resourceType: string;
    sourceId: string;
    payload: unknown;
  }[];
  worldRecords: readonly {
    resourceType: string;
    sourceId: string;
    payload: unknown;
  }[];
  createId: () => string;
  updatedAt: string;
}
const objectValue = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const arrayValue = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const humanName = (v: Row, fallback: string) =>
  typeof v.name === "string" && v.name.trim() ? v.name.trim() : fallback;
const snapshotRecords = (
  records: RealizationCapture["worldRecords"],
  type: string,
) => records.filter((r) => r.resourceType === type);
const cleanJsonValue = (value: unknown, _limit: number) =>
  copyEntityData(value);
export function resolveInstancePlacement(
  instance: RealizationCapture,
  realization: Row,
  state: Row,
  replacement:
    | {
        kind: "existing-creature" | "existing-item";
        runtimeCreatureId?: string;
        runtimeItemId?: string;
      }
    | undefined,
) {
  const creatureEmbodiments = [...arrayValue(state.creatureEmbodiments)];
  const itemInstances = [...arrayValue(state.itemInstances)];
  if (replacement?.kind === "existing-creature") {
    if (
      !creatureEmbodiments.some(
        (entry) =>
          objectValue(entry).runtimeCreatureId ===
          replacement.runtimeCreatureId,
      )
    ) {
      throw new TypeError(
        "The selected Creature is not in this Campaign Instance.",
      );
    }
    return {
      creatureEmbodiments,
      itemInstances,
      realizedEntity: {
        kind: "creature",
        runtimeCreatureId: replacement.runtimeCreatureId,
      },
    };
  }
  if (replacement?.kind === "existing-item") {
    if (
      !itemInstances.some(
        (entry) => objectValue(entry).id === replacement.runtimeItemId,
      )
    ) {
      throw new TypeError(
        "The selected Item is not in this Campaign Instance.",
      );
    }
    return {
      creatureEmbodiments,
      itemInstances,
      realizedEntity: {
        kind: "item",
        runtimeItemId: replacement.runtimeItemId,
      },
    };
  }
  const source = objectValue(realization.source);
  const placement = capturedPlacement(instance, source);
  const placementSource = objectValue(placement.source);
  const definitionId =
    typeof placementSource.characterTemplateId === "string"
      ? placementSource.characterTemplateId
      : typeof placementSource.creatureId === "string"
        ? placementSource.creatureId
        : typeof placementSource.itemDefinitionId === "string"
          ? placementSource.itemDefinitionId
          : typeof placementSource.definitionId === "string"
            ? placementSource.definitionId
            : typeof placementSource.suggestedCreatureDefinitionId === "string"
              ? placementSource.suggestedCreatureDefinitionId
              : undefined;
  if (!definitionId) {
    throw new TypeError(
      "This placement source cannot be realized automatically; choose an explicit replacement.",
    );
  }
  const definitionRecord = snapshotRecords(
    instance.worldRecords,
    placementSource.kind === "world-character"
      ? "world-character-templates"
      : "definitions",
  ).find((record) => record.sourceId === definitionId);
  if (placementSource.kind === "world-character" && !definitionRecord) {
    throw new TypeError("This Character is unavailable in the captured World.");
  }
  const definition = objectValue(definitionRecord?.payload);
  const isCreature =
    placementSource.kind === "world-character" ||
    placementSource.kind === "world-creature" ||
    typeof placementSource.suggestedCreatureDefinitionId === "string" ||
    definition.kind === "creature";
  if (isCreature) {
    const policy = resolveCreatureInstanceEmbodimentPolicy(
      definition.instanceEmbodimentPolicy,
    );
    if (
      !policy ||
      (policy.policy.strategy !== "one-per-instance" &&
        policy.policy.strategy !== "one-per-realization")
    ) {
      throw new TypeError(
        "This Creature's embodiment policy cannot be resolved for the Campaign Instance.",
      );
    }
    let existing;
    try {
      existing = Creature.existingEmbodiment(
        definition.instanceEmbodimentPolicy,
        definitionId,
        creatureEmbodiments.map(objectValue),
      );
    } catch (error) {
      throw new TypeError(
        error instanceof Error ? error.message : "Invalid Creature embodiment.",
      );
    }
    if (existing && policy.policy.strategy === "one-per-instance") {
      return {
        creatureEmbodiments,
        itemInstances,
        realizedEntity: {
          kind: "creature",
          runtimeCreatureId: String(existing.runtimeCreatureId),
        },
      };
    }
    const runtimeCreatureId = instance.createId();
    const runtimeEntityId = instance.createId();
    creatureEmbodiments.push(
      cleanJsonValue(
        {
          campaignInstanceId: instance.id,
          runtimeCreatureId,
          runtimeEntityId,
          source:
            source.kind === "campaign-placement"
              ? {
                  kind: "campaign-placement",
                  campaignPlacementDefinitionId:
                    source.campaignPlacementDefinitionId,
                  sourceCreatureId: definitionId,
                  embodimentPolicy: policy,
                }
              : {
                  kind: "captured-world-creature",
                  sourceCreatureId: definitionId,
                  embodimentPolicy: policy,
                },
          creature:
            placementSource.kind === "world-character"
              ? Creature.fromWorldCharacter(
                  {
                    id: runtimeCreatureId,
                    entityId: runtimeEntityId,
                    name: humanName(definition, "Unnamed Character"),
                    definitionId,
                    updatedAt: instance.updatedAt,
                  },
                  definition,
                  instance.worldRecords.find(
                    (r) =>
                      r.resourceType === "definitions" &&
                      r.sourceId === definition.creatureDefinitionId,
                  )?.payload,
                )
              : runtimeCreature(
                  humanName(definition, "Unnamed Creature"),
                  runtimeCreatureId,
                  runtimeEntityId,
                  definitionId,
                  instance.updatedAt,
                ),
        },
        50_000,
      ),
    );
    return {
      creatureEmbodiments,
      itemInstances,
      realizedEntity: { kind: "creature", runtimeCreatureId },
    };
  }
  if (definition.kind === "item" || placementSource.kind === "world-item") {
    const runtimeItemId = instance.createId();
    itemInstances.push(
      runtimeItem(
        humanName(definition, "Unnamed Item"),
        runtimeItemId,
        realization,
        definitionId,
      ),
    );
    return {
      creatureEmbodiments,
      itemInstances,
      realizedEntity: { kind: "item", runtimeItemId },
    };
  }
  throw new TypeError(
    "This registered placement content cannot be realized automatically; choose an explicit replacement.",
  );
}

function capturedPlacement(instance: RealizationCapture, provenance: Row) {
  if (provenance.kind === "campaign-placement") {
    const campaign = snapshotRecords(
      instance.campaignRecords,
      "campaign-placements",
    ).find(
      (record) => record.sourceId === provenance.campaignPlacementDefinitionId,
    );
    const placement = objectValue(campaign?.payload);
    if (placement.kind !== "world-decoration") return placement;
    const worldId = placement.capturedWorldPlacementId;
    return objectValue(
      snapshotRecords(instance.worldRecords, "world-placements").find(
        (record) => record.sourceId === worldId,
      )?.payload,
    );
  }
  return objectValue(
    snapshotRecords(instance.worldRecords, "world-placements").find(
      (record) => record.sourceId === provenance.worldPlacementDefinitionId,
    )?.payload,
  );
}

function runtimeCreature(
  name: string,
  runtimeCreatureId: string,
  runtimeEntityId: string,
  definitionId: string,
  updatedAt: string,
) {
  return Creature.fromCaptured({
    id: runtimeCreatureId,
    entityId: runtimeEntityId,
    name,
    definitionId,
    updatedAt,
  });
}

function runtimeItem(
  name: string,
  runtimeItemId: string,
  realization: Row,
  definitionId: string,
): Row {
  return {
    id: runtimeItemId,
    definitionId,
    nameOverride: name.trim() || "Unnamed Item",
    quantity: 1,
    quality: "standard",
    location: { kind: "location", locationId: realization.sourceLocationId },
  };
}
