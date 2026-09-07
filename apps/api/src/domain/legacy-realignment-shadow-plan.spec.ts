import {
  LegacyRealignmentShadowPlanError,
  planLegacyRealignmentShadowConversion,
  type LegacyRealignmentShadowDataset,
} from "./legacy-realignment-shadow-plan";
import {
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
} from "./snapshot-manifest";
import { validateWorldDefinitionDraft } from "../world-definitions/world-definition-draft-validator";
import { validateCampaignDefinitionDraft } from "../campaign-definitions/campaign-definition-draft-validator";

const source: LegacyRealignmentShadowDataset = {
  capturedAt: "2026-09-04T12:00:00.000Z",
  domainRecords: [
    {
      resource: "locations",
      id: "world-1",
      kind: "world",
      revision: 3,
      data: {
        identity: { id: "world-1" },
        name: "Glasswake",
        kind: "world",
        placement: { kind: "root" },
      },
    },
    {
      resource: "locations",
      id: "location-1",
      kind: "region",
      revision: 2,
      data: {
        identity: { id: "location-1" },
        name: "Ash Coast",
        kind: "region",
        placement: { kind: "within-parent", parentLocationId: "world-1" },
      },
    },
    {
      resource: "creatures",
      id: "creature-1",
      kind: null,
      revision: 4,
      data: {
        identity: { id: "creature-1" },
        name: "Glass Hound",
        worldId: "world-1",
      },
    },
    {
      resource: "campaigns",
      id: "campaign-1",
      kind: null,
      revision: 5,
      data: {
        identity: { id: "campaign-1" },
        name: "Ashes at Dawn",
        worldId: "world-1",
        gmPremise: "The sea is turning to glass.",
        discoveries: [
          {
            id: "discovery-1",
            name: "Salt testimony",
            locationId: "location-1",
            grants: [
              { kind: "fact", text: "The tide stopped before dawn." },
              { kind: "rumor", text: "The lighthouse keeper sang." },
              { kind: "item", itemDefinitionId: "legacy-item" },
            ],
          },
        ],
      },
    },
    {
      resource: "games",
      id: "game-1",
      kind: "game-state",
      revision: 8,
      data: {
        campaign: { identity: { id: "campaign-1" } },
        events: [{ id: "event-1", type: "arrival" }],
      },
    },
    {
      resource: "sessions",
      id: "session-1",
      kind: null,
      name: "Opening Night",
      revision: 1,
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T11:00:00.000Z",
      data: {
        identity: { id: "session-1" },
        name: "Opening Night",
        campaignId: "campaign-1",
        worldId: "world-1",
        status: "completed",
        startedAt: "2026-09-04T10:15:00.000Z",
        endedAt: "2026-09-04T10:55:00.000Z",
        notes: "Keep this payload exactly.",
      },
    },
    {
      resource: "characters",
      id: "character-1",
      kind: null,
      revision: 2,
      data: {
        identity: { id: "character-1" },
        ownerMembershipId: "membership-1",
        biography: { origin: "Ash Coast" },
      },
    },
  ],
  memberships: [
    {
      id: "membership-1",
      campaignId: "campaign-1",
      data: { role: "PLAYER", status: "ACTIVE", characterIds: ["character-1"] },
    },
  ],
  invitations: [
    {
      id: "invitation-1",
      campaignId: "campaign-1",
      data: { role: "PLAYER", status: "ACCEPTED" },
    },
  ],
  characterDrafts: [
    {
      id: "draft-1",
      membershipId: "membership-1",
      characterId: "character-1",
      data: { status: "COMPLETE", name: "Mara" },
    },
  ],
};

describe("planLegacyRealignmentShadowConversion", () => {
  it("emits one deterministic, idempotent shadow plan with distinct target identities", () => {
    const first = planLegacyRealignmentShadowConversion(source);
    const second = planLegacyRealignmentShadowConversion(source);
    const shuffled = planLegacyRealignmentShadowConversion({
      ...source,
      domainRecords: [...source.domainRecords].reverse(),
      memberships: [...source.memberships].reverse(),
    });

    expect(first).toEqual(second);
    expect(first).toEqual(shuffled);
    expect(first.version).toBe("aow:legacy-realignment-shadow-plan/v1");
    expect(first.mode).toBe("read-only");

    const campaignTargets = first.legacyIdentityMap.filter(
      (entry) =>
        entry.legacyResource === "campaigns" && entry.legacyId === "campaign-1",
    );
    expect(campaignTargets.map((entry) => entry.targetType)).toEqual([
      "campaign-definition",
      "campaign-definition-revision",
      "campaign-definition-snapshot",
      "campaign-instance",
      "campaign-instance-snapshot",
    ]);
    expect(new Set(campaignTargets.map((entry) => entry.targetId)).size).toBe(
      campaignTargets.length,
    );

    expect(first.rows.worldDefinitions).toHaveLength(1);
    expect(first.rows.worldDefinitionDrafts).toHaveLength(1);
    expect(first.rows.campaignDefinitions).toHaveLength(1);
    expect(first.rows.campaignDefinitionDrafts).toHaveLength(1);
    expect(first.rows.campaignInstances).toHaveLength(1);
    expect(first.rows.campaignInstanceRuntimes).toHaveLength(1);
    expect(first.rows.campaignInstanceSessions).toHaveLength(1);
    expect(
      isCanonicalSnapshotManifest(
        first.rows.worldDefinitionSnapshots[0]?.payload.manifest,
      ),
    ).toBe(true);
    expect(
      isCanonicalSnapshotManifest(
        first.rows.campaignDefinitionSnapshots[0]?.payload.manifest,
      ),
    ).toBe(true);
    expect(
      isCanonicalSnapshotManifest(
        first.rows.campaignInstanceSnapshots[0]?.payload.manifest,
      ),
    ).toBe(true);
    expect(
      first.rows.worldDefinitionRevisions[0]?.payload.contentHash,
    ).toBe(canonicalJsonHash(source.domainRecords[0]?.data));
    expect(
      first.rows.campaignDefinitionRevisions[0]?.payload.contentHash,
    ).toBe(canonicalJsonHash(source.domainRecords[3]?.data));
    expect(first.rows.campaignInstanceSessions[0]?.payload).toMatchObject({
      name: "Opening Night",
      status: "concluded",
      startedAt: "2026-09-04T10:15:00.000Z",
      concludedAt: "2026-09-04T10:55:00.000Z",
      legacyPayload: source.domainRecords[5]?.data,
    });
    expect(
      first.legacyIdentityMap.find(
        (entry) => entry.legacyResource === "sessions",
      )?.targetType,
    ).toBe("campaign-instance-session");
    expect(first.dependentRebindings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ legacyResource: "sessions" }),
      ]),
    );
  });

  it("preserves exact payloads in snapshots, runtime, and dependent rebindings", () => {
    const plan = planLegacyRealignmentShadowConversion(source);
    const worldSnapshot = plan.rows.worldDefinitionSnapshots[0];
    const campaignRevision = plan.rows.campaignDefinitionRevisions[0];
    const runtime = plan.rows.campaignInstanceRuntimes[0];

    expect(worldSnapshot.payload.manifest.records).toEqual([
      expect.objectContaining({
        resourceType: "world-definition-revision",
        sourceRevision: 1,
        payload: source.domainRecords[0].data,
      }),
      expect.objectContaining({
        resourceType: "creatures",
        sourceId: "creature-1",
        payload: source.domainRecords[2].data,
      }),
      expect.objectContaining({
        resourceType: "locations",
        sourceId: "location-1",
        payload: source.domainRecords[1].data,
      }),
      expect.objectContaining({
        resourceType: "locations",
        sourceId: "world-1",
        payload: source.domainRecords[0].data,
      }),
    ]);
    expect(campaignRevision.payload.legacyCampaignPayload).toEqual(
      source.domainRecords[3].data,
    );
    expect(runtime.payload.legacyGamePayload).toEqual(
      source.domainRecords[4].data,
    );

    expect(plan.dependentRebindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyResource: "memberships",
          legacyId: "membership-1",
          payload: source.memberships[0].data,
        }),
        expect.objectContaining({
          legacyResource: "characters",
          legacyId: "character-1",
          payload: source.domainRecords[6].data,
        }),
      ]),
    );
  });

  it("creates editable draft projections without changing immutable legacy captures", () => {
    const plan = planLegacyRealignmentShadowConversion(source);
    const worldDraft = plan.rows.worldDefinitionDrafts[0]?.payload;
    const campaignDraft = plan.rows.campaignDefinitionDrafts[0]?.payload;

    expect(worldDraft).toMatchObject({
      revisionName: "Glasswake",
      content: {
        rootLocationId: "world-1",
        locationIds: ["location-1", "world-1"],
        modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
      },
    });
    expect(worldDraft?.snapshotRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "creatures",
          sourceId: "creature-1",
          payload: source.domainRecords[2]?.data,
        }),
      ]),
    );
    expect(campaignDraft).toMatchObject({
      revisionName: "Ashes at Dawn",
      content: {
        formatVersion: 1,
        gmPremise: "The sea is turning to glass.",
        plotDefinitionIds: ["recovery:plot:campaign-1"],
        placementDefinitionIds: [],
      },
    });
    const recoveredPlot = campaignDraft?.snapshotRecords[0];
    expect(recoveredPlot).toMatchObject({
      resourceType: "plots",
      sourceId: "recovery:plot:campaign-1",
    });
    expect(recoveredPlot?.payload).toMatchObject({
      campaignDefinitionId: "realignment:v1:campaign-definition:campaign-1",
      parent: { kind: "root" },
      discoveries: [
        {
          id: "discovery-1",
          name: "Salt testimony",
          claims: [
            expect.objectContaining({
              kind: "truth",
              statement: "The tide stopped before dawn.",
            }),
            expect.objectContaining({
              kind: "rumor",
              statement: "The lighthouse keeper sang.",
            }),
          ],
        },
      ],
      locationContexts: [expect.objectContaining({ locationId: "location-1" })],
    });
  });

  it("keeps unverified legacy memberships and Model selections as recovery metadata only", () => {
    const legacyReleaseId = "legacy:model-schema-release:unmaterialized";
    const legacyDefinition = {
      resource: "definitions",
      id: "legacy-item-definition",
      kind: "item",
      revision: 9,
      data: {
        worldId: "world-1",
        definitionType: "item",
        name: "Recovered unverified item",
        unknownLegacyMechanics: { preserve: true },
      },
    };
    const input: LegacyRealignmentShadowDataset = {
      ...source,
      domainRecords: [
        ...source.domainRecords.map((record) => {
          if (record.id === "world-1") {
            return {
              ...record,
              data: {
                ...record.data,
                identity: {
                  id: record.id,
                  version: {
                    revision: record.revision,
                    updatedAt: source.capturedAt,
                  },
                },
                definitionIds: [legacyDefinition.id],
                modelSchemaReleaseIds: [legacyReleaseId],
              },
            };
          }
          if (record.id === "location-1") {
            return {
              ...record,
              data: {
                ...record.data,
                identity: {
                  id: record.id,
                  version: {
                    revision: record.revision,
                    updatedAt: source.capturedAt,
                  },
                },
              },
            };
          }
          if (record.id === "campaign-1") {
            return {
              ...record,
              data: {
                ...record.data,
                modelSchemaReleaseIds: [legacyReleaseId],
              },
            };
          }
          return record;
        }),
        legacyDefinition,
      ],
    };

    const plan = planLegacyRealignmentShadowConversion(input);
    const worldDraft = plan.rows.worldDefinitionDrafts[0].payload;
    const campaignDraft = plan.rows.campaignDefinitionDrafts[0].payload;
    const worldRecovery = (
      worldDraft.content.extensions as Record<string, Record<string, unknown>>
    )["aow:legacy-recovery"];
    const campaignRecovery = (
      campaignDraft.content.extensions as Record<
        string,
        Record<string, unknown>
      >
    )["aow:legacy-recovery"];

    expect(worldDraft.content).toMatchObject({
      definitionIds: [],
      modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
    });
    expect(worldRecovery).toMatchObject({
      definitionIds: [legacyDefinition.id],
      modelSchemaReleaseIds: [legacyReleaseId],
    });
    expect(campaignDraft.content).toMatchObject({
      modelSchemaReleaseIds: [],
    });
    expect(campaignRecovery).toMatchObject({
      modelSchemaReleaseIds: [legacyReleaseId],
    });
    expect(worldDraft.snapshotRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "definitions",
          sourceId: legacyDefinition.id,
          sourceRevision: legacyDefinition.revision,
          payload: legacyDefinition.data,
        }),
      ]),
    );
    expect(
      validateWorldDefinitionDraft(
        worldDraft.content,
        worldDraft.snapshotRecords,
      ),
    ).toMatchObject({ valid: true, issues: [] });
    expect(
      validateCampaignDefinitionDraft(
        campaignDraft.campaignDefinitionId,
        campaignDraft.content,
        campaignDraft.snapshotRecords,
        plan.rows.worldDefinitionSnapshots[0].payload.manifest,
      ),
    ).toMatchObject({ valid: true, issues: [] });
  });

  it("blocks the entire plan for ambiguous or unresolved input", () => {
    const invalid: LegacyRealignmentShadowDataset = {
      ...source,
      domainRecords: [
        ...source.domainRecords,
        {
          resource: "games",
          id: "game-2",
          kind: "game-state",
          revision: 1,
          data: { campaign: { identity: { id: "campaign-1" } } },
        },
        {
          resource: "sessions",
          id: "session-orphan",
          kind: null,
          revision: 1,
          data: { campaignId: "missing-campaign" },
        },
      ],
    };

    expect(() => planLegacyRealignmentShadowConversion(invalid)).toThrow(
      LegacyRealignmentShadowPlanError,
    );

    try {
      planLegacyRealignmentShadowConversion(invalid);
      throw new Error("expected conversion planning to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LegacyRealignmentShadowPlanError);
      expect((error as LegacyRealignmentShadowPlanError).issues).toEqual([
        expect.objectContaining({ code: "campaign-runtime-ambiguous" }),
        expect.objectContaining({ code: "session-campaign-not-found" }),
      ]);
    }
  });

  it("retains explicitly deferred resources instead of silently dropping them", () => {
    const deferred = {
      resource: "extension-schemas",
      id: "schema-1",
      kind: "extension-schema",
      revision: 1,
      data: { id: "schema-1", key: "aow:test", worldId: "world-1" },
    };
    const plan = planLegacyRealignmentShadowConversion({
      ...source,
      domainRecords: [...source.domainRecords, deferred],
    });

    expect(plan.retainedLegacyRecords).toEqual([deferred]);
    expect(
      plan.rows.worldDefinitionSnapshots[0]?.payload.manifest.records,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "extension-schemas" }),
      ]),
    );
  });
});
