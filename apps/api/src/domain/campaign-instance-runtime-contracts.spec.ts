import type {
  CampaignInstanceId,
  CampaignInstancePlacementRealization,
  CampaignInstancePlacementRealizationId,
  CampaignInstanceRuntimeState,
  CampaignInstanceSnapshotId,
  CampaignPlacementDefinitionId,
  CreatureId,
  LocationId,
  PlotDefinitionId,
  WorldPlacementDefinitionId,
} from "../../../../packages/common/src/types";
import { validateCampaignInstanceRuntimeState } from "../../../../packages/common/src/types";
import {
  canTransitionCampaignInstanceStatus,
  isCreatureInstanceEmbodimentPolicy,
  resolveCreatureInstanceEmbodimentPolicy,
} from "../../../../packages/common/src/types";

const instanceId = "greybridge-table" as CampaignInstanceId;
const snapshotId = "greybridge-snapshot" as CampaignInstanceSnapshotId;
const locationId = "greybridge-harbor" as LocationId;
const rootPlotId = "bells-below" as PlotDefinitionId;
const childPlotId = "open-floodgate" as PlotDefinitionId;
const placementId = "keeper-staging" as CampaignPlacementDefinitionId;
const worldPlacementId = "keeper-at-harbor" as WorldPlacementDefinitionId;

function plannedPlacement(
  overrides: Partial<CampaignInstancePlacementRealization> = {},
): CampaignInstancePlacementRealization {
  return {
    identity: {
      id: "keeper-decision" as CampaignInstancePlacementRealizationId,
      version: { revision: 1, updatedAt: "2026-09-07T00:00:00.000Z" },
    },
    name: "The Bell Keeper",
    campaignInstanceId: instanceId,
    source: {
      kind: "campaign-placement",
      campaignPlacementDefinitionId: placementId,
      capturedWorldPlacementDefinitionId: worldPlacementId,
    },
    sourceLocationId: locationId,
    status: "planned",
    ...overrides,
  };
}

function runtimeState(
  overrides: Partial<CampaignInstanceRuntimeState> = {},
): CampaignInstanceRuntimeState {
  return {
    formatVersion: 1,
    preparation: { startingLocationId: locationId },
    plotProgress: [
      {
        campaignInstanceId: instanceId,
        plotDefinitionId: rootPlotId,
        status: "not-started",
        objectiveProgress: [
          { objectiveId: "hear-bells", status: "not-started" },
        ],
      },
      {
        campaignInstanceId: instanceId,
        plotDefinitionId: childPlotId,
        status: "not-started",
      },
    ],
    placementRealizations: [plannedPlacement()],
    creatureEmbodiments: [],
    itemInstances: [],
    ...overrides,
  };
}

function context() {
  return {
    campaignInstanceId: instanceId,
    campaignInstanceSnapshotId: snapshotId,
    capturedPlotObjectiveIds: new Map([
      [rootPlotId, new Set(["hear-bells"])],
      [childPlotId, new Set<string>()],
    ]),
    capturedLocationIds: new Set([locationId]),
    capturedCampaignPlacementIds: new Set([placementId]),
    capturedWorldPlacementIds: new Set([worldPlacementId]),
    capturedCreaturePolicies: new Map(),
  };
}

describe("Campaign Instance runtime contracts", () => {
  it("allows only the approved recoverable Instance lifecycle", () => {
    expect(canTransitionCampaignInstanceStatus("preparing", "active")).toBe(
      true,
    );
    expect(canTransitionCampaignInstanceStatus("active", "paused")).toBe(true);
    expect(canTransitionCampaignInstanceStatus("paused", "active")).toBe(true);
    expect(canTransitionCampaignInstanceStatus("archived", "concluded")).toBe(
      true,
    );
    expect(canTransitionCampaignInstanceStatus("preparing", "archived")).toBe(
      false,
    );
    expect(canTransitionCampaignInstanceStatus("active", "active")).toBe(false);
  });

  it("requires explicit new policy but resolves legacy captures deterministically", () => {
    expect(
      isCreatureInstanceEmbodimentPolicy({ strategy: "one-per-realization" }),
    ).toBe(true);
    expect(
      isCreatureInstanceEmbodimentPolicy({
        strategy: "one-per-instance",
        maximumPerCampaignInstance: 2,
      }),
    ).toBe(false);
    expect(
      isCreatureInstanceEmbodimentPolicy({
        strategy: "publisher:swarm",
        extensions: { unnamespaced: true },
      }),
    ).toBe(false);
    expect(resolveCreatureInstanceEmbodimentPolicy(undefined)).toEqual({
      policy: {
        strategy: "one-per-instance",
        maximumPerCampaignInstance: 1,
      },
      source: "legacy-default",
    });
    expect(
      resolveCreatureInstanceEmbodimentPolicy({ strategy: "not namespaced" }),
    ).toBeUndefined();
  });

  it("accepts complete recursive Plot progress and an explicit planned placement", () => {
    expect(
      validateCampaignInstanceRuntimeState(runtimeState(), context()),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("requires Plot progress to cover every captured root Plot and subplot", () => {
    const state = runtimeState({
      plotProgress: runtimeState().plotProgress.slice(0, 1),
    });

    expect(
      validateCampaignInstanceRuntimeState(state, context()),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({ code: "plot-progress-membership-mismatch" }),
      ],
    });
  });

  it("keeps planned placements separate from runtime entities", () => {
    const state = runtimeState({
      placementRealizations: [
        plannedPlacement({
          realizedEntity: {
            kind: "creature",
            runtimeCreatureId: "runtime-keeper" as CreatureId,
          },
        }),
      ],
    });

    const result = validateCampaignInstanceRuntimeState(state, context());
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "placement-status-entity-mismatch",
        "runtime-entity-not-found",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("keeper-decision");
  });

  it("rejects source and mutable Location references outside the captured pair", () => {
    const state = runtimeState({
      placementRealizations: [
        plannedPlacement({
          source: {
            kind: "captured-world-placement",
            worldPlacementDefinitionId:
              "foreign-placement" as WorldPlacementDefinitionId,
          },
          currentLocationId: "foreign-location" as LocationId,
        }),
      ],
    });

    expect(
      validateCampaignInstanceRuntimeState(state, context()).issues.map(
        ({ code }) => code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "location-not-captured",
        "placement-source-not-captured",
      ]),
    );
  });

  it("enforces captured Creature cardinality through Campaign placements", () => {
    const sourceCreatureId = "captured-keeper" as CreatureId;
    const embodimentPolicy = {
      policy: { strategy: "one-per-instance" as const, maximumPerCampaignInstance: 1 },
      source: "explicit" as const,
    };
    const embodiment = (suffix: string) => ({
      campaignInstanceId: instanceId,
      runtimeCreatureId: `runtime-creature-${suffix}` as CreatureId,
      runtimeEntityId: `runtime-entity-${suffix}`,
      source: {
        kind: "campaign-placement" as const,
        campaignPlacementDefinitionId: placementId,
        sourceCreatureId,
        embodimentPolicy,
      },
      creature: {
        identity: {
          id: `runtime-creature-${suffix}` as CreatureId,
          version: { revision: 1, updatedAt: "2026-09-07T00:00:00.000Z" },
        },
        entityId: `runtime-entity-${suffix}`,
        name: `Keeper ${suffix}`,
      },
    });
    const validationContext = context();
    validationContext.capturedCreaturePolicies.set(
      sourceCreatureId,
      embodimentPolicy,
    );
    const result = validateCampaignInstanceRuntimeState(
      runtimeState({ creatureEmbodiments: [embodiment("one"), embodiment("two")] as never }),
      validationContext,
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "creature-embodiment-cardinality-exceeded" }),
      ]),
    );
  });
});
