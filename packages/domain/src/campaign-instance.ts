import { resolveInstancePlacement } from "./instance-realization";
import {
  validateCampaignInstanceRuntimeState,
  resolveCreatureInstanceEmbodimentPolicy,
  plotDiscoveryClaims,
  type PlotDiscovery,
  type CampaignInstanceRuntimeState,
  type CampaignInstanceRuntimeValidationContext,
} from "@aow/common";
import {
  locationPresentationIssue,
  withLocationPresentation,
} from "./location-presentation";
import { Character } from "./character";
import { ActorEquipment, type ActorEquipmentContext } from "./actor-equipment";
import { Creature } from "./creature";
import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
} from "./entity";

type Runtime = Record<string, unknown>;
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const humanName = (value: Row, fallback: string): string =>
  typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : fallback;
export interface InstanceCaptureContext {
  mode?: "runtime";
  captured: CampaignInstanceRuntimeValidationContext;
  plots?: readonly { sourceId: string; payload: unknown }[];
}
export interface CampaignInstanceCommands {
  encounter: {
    params: {
      encounter: import("@aow/common").EncounterState;
      publish?: boolean;
      updatedAt: string;
    };
    context: object;
  };
  locationWeather: {
    params: { locationId: string; weather?: Row | null; reset?: boolean };
    context: object;
  };
  activateCharacter: {
    params: { embodiment: Row; items: Row[] };
    context: object;
  };
  preparation: { params: { preparation: Row }; context: object };
  plot: { params: { plotDefinitionId: string; patch: Row }; context: object };
  placement: {
    params: {
      realizationId: string;
      action: "realize" | "defer" | "replace" | "remove";
      notes?: string;
      resolved?: {
        realizedEntity?: unknown;
        creatureEmbodiments: unknown[];
        itemInstances: unknown[];
      };
    };
    context: object;
  };
}
/** Captured Instance runtime aggregate. Persistence, authorization and CAS stay in adapters. */
export class CampaignInstance extends Entity<
  Runtime,
  CampaignInstanceCommands,
  Record<string, never>
> {
  private readonly captured: CampaignInstanceRuntimeValidationContext;
  private readonly plots: readonly { sourceId: string; payload: unknown }[];
  private constructor(
    data: Runtime,
    context: InstanceCaptureContext,
    options?: EntityOptions,
  ) {
    super("campaign-instance", data, [], { mode: "runtime" }, options);
    this.plots = copyEntityData(context.plots ?? []);
    const c = context.captured;
    this.captured = {
      ...c,
      capturedPlotObjectiveIds: new globalThis.Map(
        [...c.capturedPlotObjectiveIds].map(([key, ids]) => [
          key,
          new Set(ids),
        ]),
      ),
      capturedLocationIds: new Set(c.capturedLocationIds),
      capturedCampaignPlacementIds: new Set(c.capturedCampaignPlacementIds),
      capturedWorldPlacementIds: new Set(c.capturedWorldPlacementIds),
      capturedCreaturePolicies: new globalThis.Map(
        [...c.capturedCreaturePolicies].map(([key, policy]) => [
          key,
          copyEntityData(policy),
        ]),
      ),
    };
    this.validate({ mode: "runtime" });
  }
  static deserializePayload(
    value: unknown,
    context: InstanceCaptureContext,
    options?: EntityOptions,
  ) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Invalid Instance runtime.");
    return new CampaignInstance(
      copyEntityData(value as Runtime),
      context,
      options,
    );
  }
  static deserialize(
    value: unknown,
    context: InstanceCaptureContext,
    options?: EntityOptions,
  ) {
    const envelope = object(value);
    if (envelope.type !== "campaign-instance" || envelope.schemaVersion !== 1)
      throw new TypeError("Unsupported Instance envelope.");
    return this.deserializePayload(envelope.data, context, options);
  }
  serializePayload() {
    return this.serialize().data;
  }
  static validateRuntime(
    value: unknown,
    context: CampaignInstanceRuntimeValidationContext,
  ) {
    const result = validateCampaignInstanceRuntimeState(
      value as CampaignInstanceRuntimeState,
      context,
    );
    const extra: {
      code: "location-not-captured";
      subject: string;
      detail: string;
    }[] = [];
    const seen = new Set<unknown>();
    for (const row of array(object(value).locationPresentationOverrides).map(
      object,
    )) {
      if (
        typeof row.locationId !== "string" ||
        !context.capturedLocationIds.has(row.locationId as never) ||
        seen.has(row.locationId)
      )
        extra.push({
          code: "location-not-captured",
          subject: "Location presentation",
          detail:
            "Location overrides must uniquely belong to the captured World.",
        });
      seen.add(row.locationId);
      const issue =
        row.weather === null
          ? undefined
          : locationPresentationIssue({ weather: row.weather });
      if (issue)
        extra.push({
          code: "location-not-captured",
          subject: "Location presentation",
          detail: issue,
        });
    }
    return {
      valid: result.valid && !extra.length,
      issues: [...result.issues, ...extra],
    };
  }
  protected validateState(data: DeepReadonly<Runtime>) {
    try {
      return CampaignInstance.validateRuntime(data, this.captured).issues.map(
        (issue) => ({ code: issue.code, message: issue.detail }),
      );
    } catch {
      return [
        {
          code: "instance-runtime",
          message: "Invalid captured Instance runtime.",
        },
      ];
    }
  }
  protected handleCommand<K extends keyof CampaignInstanceCommands>(
    name: K,
    invocation: CommandInvocation<CampaignInstanceCommands[K]>,
  ): EntityTransition<Runtime, Record<string, never>> {
    const data = this.serializePayload();
    if (name === "encounter") {
      const params =
        invocation.params as CampaignInstanceCommands["encounter"]["params"];
      data.encounter = copyEntityData(params.encounter);
      if (params.publish) {
        if (params.encounter.phase !== "published")
          throw new TypeError(
            "Only a reviewed, published round can update actors.",
          );
        data.creatureEmbodiments = array(data.creatureEmbodiments)
          .map(object)
          .map((entry) => {
            const actor = params.encounter.combatants.find(
              (actor) => actor.entityId === entry.runtimeEntityId,
            );
            if (!actor) return entry;
            return {
              ...entry,
              creature: Creature.publishCombat(object(entry.creature), {
                hp: actor.hp,
                maxHp: actor.maxHp,
                prone: actor.prone ?? false,
                removed: actor.removed ?? false,
                incapacitation: actor.incapacitation ?? null,
                ...(actor.position
                  ? {
                      position: {
                        x: actor.position.point.x * 5,
                        y: actor.position.point.y * 5,
                        z: (actor.position.point.z ?? 0) * 5,
                      },
                    }
                  : {}),
                updatedAt: params.updatedAt,
              }),
            };
          });
      }
    } else if (name === "locationWeather") {
      const { locationId, weather, reset } =
        invocation.params as CampaignInstanceCommands["locationWeather"]["params"];
      if (!this.captured.capturedLocationIds.has(locationId as never))
        throw new TypeError("The Location is outside this capture.");
      const rows = array(data.locationPresentationOverrides).map(object);
      const prior = rows.find((row) => row.locationId === locationId);
      if (reset)
        data.locationPresentationOverrides = rows.filter(
          (row) => row.locationId !== locationId,
        );
      else {
        if (weather === undefined)
          throw new TypeError(
            "Provide weather or restore the captured default.",
          );
        const issue =
          weather === null ? undefined : locationPresentationIssue({ weather });
        if (issue) throw new TypeError(issue);
        const next =
          weather === null
            ? { ...prior, locationId, weather: null }
            : {
                ...withLocationPresentation(prior ?? {}, { weather }),
                locationId,
              };
        data.locationPresentationOverrides = [
          ...rows.filter((row) => row.locationId !== locationId),
          next,
        ];
      }
    } else if (name === "activateCharacter") {
      const { embodiment, items } =
        invocation.params as CampaignInstanceCommands["activateCharacter"]["params"];
      const characterId = object(embodiment.source).characterId;
      if (
        object(embodiment.source).kind !== "character" ||
        typeof characterId !== "string"
      )
        throw new TypeError("Invalid Character embodiment.");
      if (
        array(data.creatureEmbodiments)
          .map(object)
          .some((row) => object(row.source).characterId === characterId)
      )
        throw new TypeError("This Character is already embodied.");
      data.creatureEmbodiments = [
        ...array(data.creatureEmbodiments),
        copyEntityData(embodiment),
      ];
      data.itemInstances = copyEntityData(items);
    } else if (name === "preparation") {
      data.preparation = {
        ...object(data.preparation),
        ...(
          invocation.params as CampaignInstanceCommands["preparation"]["params"]
        ).preparation,
      };
    } else if (name === "plot") {
      const { plotDefinitionId, patch } =
        invocation.params as CampaignInstanceCommands["plot"]["params"];
      const rows = array(data.plotProgress).map(object);
      const index = rows.findIndex(
        (row) => row.plotDefinitionId === plotDefinitionId,
      );
      if (index < 0)
        throw new TypeError(
          "The selected Plot is outside the captured Campaign.",
        );
      const prior = rows[index]!;
      const next = { ...prior };
      for (const key of [
        "status",
        "revealedClaimIds",
        "approvedOverrides",
        "creatureKnowledge",
      ])
        if (patch[key] !== undefined) next[key] = copyEntityData(patch[key]);
      if (patch.objectiveProgress !== undefined) {
        const objectives = array(prior.objectiveProgress).map(object);
        for (const row of array(patch.objectiveProgress).map(object)) {
          const objectiveIndex = objectives.findIndex(
            (p) => p.objectiveId === row.objectiveId,
          );
          if (objectiveIndex < 0)
            throw new TypeError("The selected objective is outside this Plot.");
          objectives[objectiveIndex] = {
            ...objectives[objectiveIndex],
            ...row,
          };
        }
        next.objectiveProgress = objectives;
      }
      const definition = this.plots.find(
        (plot) => plot.sourceId === plotDefinitionId,
      );
      if (
        patch.revealedClaimIds !== undefined ||
        patch.creatureKnowledge !== undefined
      ) {
        if (!definition)
          throw new TypeError("Captured discovery data is unavailable.");
        const claims = array(object(definition.payload).discoveries).flatMap(
          (discovery) => plotDiscoveryClaims(discovery as PlotDiscovery),
        );
        const claimById = new globalThis.Map(
          claims.map((claim) => [claim.id, claim]),
        );
        if (
          array(next.revealedClaimIds).some((id) => !claimById.has(String(id)))
        )
          throw new TypeError(
            "A revealed claim is outside this captured Plot.",
          );
        const actors = new Set(
          array(data.creatureEmbodiments)
            .map(object)
            .map((actor) => actor.runtimeEntityId),
        );
        const seen = new Set<string>();
        const knowledge = array(next.creatureKnowledge)
          .map(object)
          .map((entry) => {
            const claim = claimById.get(String(entry.claimId));
            const kind =
              claim &&
              (
                {
                  truth: "knows-truth",
                  belief: "holds-belief",
                  rumor: "heard-rumor",
                } as const
              )[claim.kind];
            if (!kind || entry.kind !== kind || !actors.has(entry.creatureId))
              throw new TypeError(
                "Knowledge must name an Instance actor and match the captured claim kind.",
              );
            const key = `${entry.creatureId}:${entry.claimId}`;
            if (seen.has(key))
              throw new TypeError(
                "This actor's claim knowledge is duplicated.",
              );
            seen.add(key);
            return {
              ...array(prior.creatureKnowledge)
                .map(object)
                .find(
                  (old) =>
                    old.creatureId === entry.creatureId &&
                    old.claimId === entry.claimId,
                ),
              ...entry,
            };
          });
        if (patch.creatureKnowledge !== undefined)
          next.creatureKnowledge = knowledge;
      }
      rows[index] = next;
      data.plotProgress = rows;
    } else if (name === "placement") {
      const params =
        invocation.params as CampaignInstanceCommands["placement"]["params"];
      const rows = array(data.placementRealizations).map(object);
      const index = rows.findIndex(
        (row) => object(row.identity).id === params.realizationId,
      );
      if (index < 0)
        throw new TypeError("The selected Instance placement was not found.");
      const status = (
        {
          realize: "realized",
          defer: "deferred",
          replace: "replaced",
          remove: "removed",
        } as const
      )[params.action];
      if (!status) throw new TypeError("Unknown placement action.");
      if (rows[index]!.status === status)
        throw new TypeError("This placement already has the requested status.");
      const next = { ...rows[index], status } as Row;
      delete next.realizedEntity;
      if (params.action === "realize" || params.action === "replace") {
        if (!params.resolved?.realizedEntity)
          throw new TypeError("Choose a runtime entity for this placement.");
        next.realizedEntity = copyEntityData(params.resolved.realizedEntity);
        data.creatureEmbodiments = copyEntityData(
          params.resolved.creatureEmbodiments,
        );
        data.itemInstances = copyEntityData(params.resolved.itemInstances);
      }
      if (params.notes !== undefined) next.notes = params.notes.trim();
      rows[index] = next;
      data.placementRealizations = rows;
    } else throw new TypeError("Unknown Instance command.");
    return { data };
  }
  async activateCharacter(
    sheet: Row,
    input: ActorEquipmentContext & {
      campaignInstanceId: string;
      updatedAt: string;
      createId: () => string;
    },
    initiator: unknown,
  ) {
    const characterId = object(sheet.identity).id;
    Character.validateSheetBinding(
      sheet,
      String(characterId),
      input.campaignInstanceId,
    );
    const prior = array(this.state.data.creatureEmbodiments)
      .map(object)
      .find(
        (row) =>
          object(row.source).kind === "character" &&
          object(row.source).characterId === characterId,
      );
    if (prior) return { status: "unchanged" as const };
    const entityId = input.createId();
    const actor = Character.fromApprovedSheet(sheet, {
      entityId,
      campaignInstanceId: input.campaignInstanceId,
      updatedAt: input.updatedAt,
    });
    const equipment = ActorEquipment.deserialize(
      { actor, items: array(this.state.data.itemInstances).map(object) },
      {
        mode: "runtime",
        definitions: input.definitions,
        availableSlots: input.availableSlots,
      },
    );
    try {
      for (const definitionId of array(sheet.startingEquipmentDefinitionIds)) {
        if (typeof definitionId !== "string")
          throw new TypeError("Invalid starting Item selection.");
        const itemId = input.createId();
        const created = await equipment.command("change", {
          initiator,
          context: {},
          params: {
            action: "create",
            definitionId,
            createdId: itemId,
            updatedAt: input.updatedAt,
          },
        });
        if (created.status === "rejected") throw new TypeError(created.reason);
        const slots = object(sheet.equipmentAssignments)[definitionId];
        if (Array.isArray(slots) && slots.length) {
          const equipped = await equipment.command("change", {
            initiator,
            context: {},
            params: {
              action: "equip",
              itemId,
              slots,
              updatedAt: input.updatedAt,
            },
          });
          if (equipped.status === "rejected")
            throw new TypeError(equipped.reason);
        }
      }
      const result = equipment.serializePayload();
      return await this.command("activateCharacter", {
        initiator,
        context: {},
        params: {
          embodiment: {
            campaignInstanceId: input.campaignInstanceId,
            runtimeCreatureId: characterId,
            runtimeEntityId: entityId,
            source: { kind: "character", characterId },
            creature: result.actor,
          },
          items: result.items,
        },
      });
    } finally {
      equipment.dispose();
    }
  }
  static resolvePlacement = resolveInstancePlacement;
  static initialRuntime(input: {
    campaignInstanceId: string;
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
    campaignContent: unknown;
    updatedAt: string;
    createId: () => string;
  }) {
    const campaignInstanceId = input.campaignInstanceId;
    const campaignRecords = input.campaignRecords;
    const worldRecords = input.worldRecords;
    const content = object(input.campaignContent);
    const preparationDefaults = object(content.preparation);
    const plotProgress = campaignRecords
      .filter((record) => record.resourceType === "plots")
      .map((record) => {
        const plot = object(record.payload);
        return {
          campaignInstanceId,
          plotDefinitionId: record.sourceId,
          status: "not-started",
          objectiveProgress: array(plot.objectives)
            .map(object)
            .filter((objective) => typeof objective.id === "string")
            .map((objective) => ({
              objectiveId: objective.id,
              status: "not-started",
            })),
        };
      });
    const campaignPlacements = campaignRecords.filter(
      (record) => record.resourceType === "campaign-placements",
    );
    const decoratedWorldPlacements = new Set(
      campaignPlacements.flatMap((record) => {
        const placement = object(record.payload);
        return placement.kind === "world-decoration" &&
          typeof placement.capturedWorldPlacementId === "string"
          ? [placement.capturedWorldPlacementId]
          : [];
      }),
    );
    const now = input.updatedAt;
    const creatureEmbodiments = worldRecords
      .filter((record) => {
        const creature = object(record.payload);
        if (
          record.resourceType !== "definitions" ||
          creature.kind !== "creature"
        )
          return false;
        const resolved = resolveCreatureInstanceEmbodimentPolicy(
          creature.instanceEmbodimentPolicy,
        );
        return resolved?.policy.strategy === "one-per-instance";
      })
      .map((record) => {
        const captured = object(record.payload);
        const policy = resolveCreatureInstanceEmbodimentPolicy(
          captured.instanceEmbodimentPolicy,
        )!;
        const runtimeCreatureId = input.createId();
        const runtimeEntityId = input.createId();
        return {
          campaignInstanceId,
          runtimeCreatureId,
          runtimeEntityId,
          source: {
            kind: "captured-world-creature",
            sourceCreatureId: record.sourceId,
            embodimentPolicy: policy,
          },
          creature: Creature.fromCaptured({
            id: runtimeCreatureId,
            entityId: runtimeEntityId,
            name: humanName(captured, "Unnamed Creature"),
            definitionId: record.sourceId,
            updatedAt: now,
          }),
        };
      });
    const placementRealizations = [
      ...campaignPlacements.map((record) => {
        const placement = object(record.payload);
        return {
          identity: {
            id: input.createId(),
            version: { revision: 1, updatedAt: now },
          },
          name:
            typeof placement.name === "string" && placement.name.trim()
              ? placement.name.trim()
              : "Campaign placement",
          campaignInstanceId,
          source: {
            kind: "campaign-placement",
            campaignPlacementDefinitionId: record.sourceId,
            ...(typeof placement.capturedWorldPlacementId === "string"
              ? {
                  capturedWorldPlacementDefinitionId:
                    placement.capturedWorldPlacementId,
                }
              : {}),
          },
          sourceLocationId:
            typeof placement.locationId === "string"
              ? placement.locationId
              : "",
          status: "planned",
        };
      }),
      ...worldRecords
        .filter(
          (record) =>
            record.resourceType === "world-placements" &&
            !decoratedWorldPlacements.has(record.sourceId),
        )
        .map((record) => {
          const placement = object(record.payload);
          return {
            identity: {
              id: input.createId(),
              version: { revision: 1, updatedAt: now },
            },
            name:
              typeof placement.name === "string" && placement.name.trim()
                ? placement.name.trim()
                : "World placement",
            campaignInstanceId,
            source: {
              kind: "captured-world-placement",
              worldPlacementDefinitionId: record.sourceId,
            },
            sourceLocationId:
              typeof placement.locationId === "string"
                ? placement.locationId
                : "",
            status: "planned",
          };
        }),
    ];
    return {
      formatVersion: 1,
      preparation: {
        ...(typeof preparationDefaults.startingLocationId === "string"
          ? { startingLocationId: preparationDefaults.startingLocationId }
          : {}),
        ...(typeof preparationDefaults.startingContext === "string"
          ? { startingContext: preparationDefaults.startingContext }
          : {}),
        ...(typeof preparationDefaults.mapVariations === "string"
          ? { mapVariations: preparationDefaults.mapVariations }
          : {}),
        ...(Array.isArray(preparationDefaults.locationCanvases)
          ? { locationCanvases: preparationDefaults.locationCanvases }
          : {}),
        ...(preparationDefaults.extensions &&
        typeof preparationDefaults.extensions === "object" &&
        !Array.isArray(preparationDefaults.extensions)
          ? { extensions: preparationDefaults.extensions }
          : {}),
      },
      plotProgress,
      placementRealizations,
      creatureEmbodiments,
      itemInstances: [],
    };
  }
}
