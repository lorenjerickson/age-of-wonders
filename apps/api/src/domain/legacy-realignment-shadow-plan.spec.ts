import {
  LegacyRealignmentShadowPlanError,
  planLegacyRealignmentShadowConversion,
  type LegacyRealignmentShadowDataset,
} from "./legacy-realignment-shadow-plan";
import {
  canonicalJsonHash,
  isCanonicalSnapshotManifest,
} from "./snapshot-manifest";

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
      revision: 1,
      data: {
        identity: { id: "session-1" },
        campaignId: "campaign-1",
        worldId: "world-1",
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
    expect(first.rows.campaignDefinitions).toHaveLength(1);
    expect(first.rows.campaignInstances).toHaveLength(1);
    expect(first.rows.campaignInstanceRuntimes).toHaveLength(1);
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
          legacyResource: "sessions",
          legacyId: "session-1",
          payload: source.domainRecords[5].data,
        }),
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
