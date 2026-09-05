import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { validateCampaignDefinitionDraft } from "./campaign-definition-draft-validator";
import {
  buildCampaignWorldMigrationPlan,
  MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
  MAX_MIGRATION_CHANGES_PER_KIND,
  MAX_MIGRATION_CONFLICTS,
  MAX_MIGRATION_PREVIEW_BYTES,
} from "./campaign-definitions.service";

const world = buildSnapshotManifest(1, [
  { resourceType: "locations", sourceId: "harbor", payload: { id: "harbor", name: "Old Harbor" } },
  { resourceType: "creatures", sourceId: "captain", payload: { id: "captain", name: "Captain Vale" } },
  { resourceType: "definitions", sourceId: "canonical-creature", payload: { id: "canonical-creature", kind: "creature", name: "Bell Keeper" } },
  { resourceType: "definitions", sourceId: "canonical-item", payload: { id: "canonical-item", kind: "item", name: "Floodgate Key" } },
  { resourceType: "world-placements", sourceId: "captain-at-harbor", payload: { id: "captain-at-harbor", name: "Captain at the harbor", locationId: "harbor", source: { kind: "world-creature", creatureId: "captain" } } },
]);

describe("Campaign Definition draft validation", () => {
  it("accepts recursive Plots and a decoration against the exact captured World", () => {
    const records = [
      { resourceType: "plots", sourceId: "root", payload: { id: "root", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Arrival", objectives: [], pressures: [], resistances: [], discoveries: [], locationContexts: [{ id: "context", locationId: "harbor", placementDefinitionIds: ["placement"] }] } },
      { resourceType: "campaign-placements", sourceId: "placement", payload: { id: "placement", kind: "world-decoration", name: "Plot-relevant captain", locationId: "harbor", plotDefinitionIds: ["root"], capturedWorldPlacementId: "captain-at-harbor" } },
    ];
    expect(validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "A storm is coming.", playerIntroduction: "You reach the harbor.", plotDefinitionIds: ["root"], placementDefinitionIds: ["placement"], modelSchemaReleaseIds: [] }, records, world)).toEqual({ valid: true, issues: [] });
  });
  it("rejects runtime records", () => {
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [] }, [{ resourceType: "sessions", sourceId: "session", payload: {} }], world);
    expect(result.issues.map((issue) => issue.code)).toContain("campaign-record-forbidden");
  });

  it("rejects a Discovery that has no claims", () => {
    const plot = {
      id: "plot",
      campaignDefinitionId: "campaign",
      parent: { kind: "root" },
      name: "Empty discovery",
      objectives: [],
      pressures: [],
      resistances: [],
      discoveries: [{ id: "discovery", name: "Unrevealed", claims: [] }],
      locationContexts: [],
    };
    const result = validateCampaignDefinitionDraft(
      "campaign",
      { formatVersion: 1, gmPremise: "Premise", playerIntroduction: "Introduction", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: [] },
      [{ resourceType: "plots", sourceId: "plot", payload: plot }],
      world,
    );
    expect(result.issues.map(({ code }) => code)).toContain("plot-invalid");
  });

  it("resolves canonical Creature and Item definitions captured by the World", () => {
    const records = [
      { resourceType: "plots", sourceId: "root", payload: { id: "root", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Arrival", objectives: [], pressures: [], resistances: [], discoveries: [], locationContexts: [{ id: "context", locationId: "harbor", placementDefinitionIds: ["creature-placement", "item-placement"] }] } },
      { resourceType: "campaign-placements", sourceId: "creature-placement", payload: { id: "creature-placement", kind: "independent", locationId: "harbor", plotDefinitionIds: ["root"], source: { kind: "world-creature", creatureId: "canonical-creature" } } },
      { resourceType: "campaign-placements", sourceId: "item-placement", payload: { id: "item-placement", kind: "independent", locationId: "harbor", plotDefinitionIds: ["root"], source: { kind: "world-item", itemDefinitionId: "canonical-item" } } },
    ];
    expect(validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "Premise", playerIntroduction: "Introduction", plotDefinitionIds: ["root"], placementDefinitionIds: ["creature-placement", "item-placement"], modelSchemaReleaseIds: [] }, records, world)).toEqual({ valid: true, issues: [] });
  });

  it.each([
    {
      resourceType: "plots",
      sourceId: "plot",
      payload: { id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Broken Plot", objectives: [null], pressures: [], resistances: [], discoveries: [], locationContexts: [] },
      expected: "plot-invalid",
    },
    {
      resourceType: "campaign-placements",
      sourceId: "placement",
      payload: { id: "placement", kind: "independent", locationId: "harbor", plotDefinitionIds: ["plot"], source: { kind: "nonsense" } },
      expected: "campaign-placement-invalid",
    },
  ])("rejects malformed canonical nested records", ({ resourceType, sourceId, payload, expected }) => {
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: resourceType === "plots" ? [sourceId] : [], placementDefinitionIds: resourceType === "campaign-placements" ? [sourceId] : [], modelSchemaReleaseIds: [] }, [{ resourceType, sourceId, payload }], world);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(expected);
  });

  it.each([
    {
      preparation: { locationCanvases: [{ locationId: "harbor" }] },
      expected: "campaign-content-invalid",
    },
    {
      preparation: { locationCanvases: [{ locationId: "harbor", layers: [], lightSources: [{ id: "light", name: "Beacon" }] }] },
      expected: "campaign-content-invalid",
    },
  ])("rejects incomplete preparation canvas shapes", ({ preparation, expected }) => {
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [], preparation }, [], world);
    expect(result.issues.map((issue) => issue.code)).toContain(expected);
  });

  it("rejects a legacy Plot actor intent with an Item source", () => {
    const plot = { id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Invalid actor", objectives: [], pressures: [], resistances: [], discoveries: [], locationContexts: [{ id: "context", locationId: "harbor", actorPlacements: [{ id: "actor", source: { kind: "world-item", itemDefinitionId: "item" } }] }] };
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: [] }, [{ resourceType: "plots", sourceId: "plot", payload: plot }], world);
    expect(result.issues.map((issue) => issue.code)).toContain("plot-invalid");
  });

  it("allows placements with no Plot association and still rejects unknown supplied Plot IDs", () => {
    const base = { id: "placement", kind: "independent", locationId: "harbor", source: { kind: "world-item", itemDefinitionId: "canonical-item" } };
    const valid = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: [], placementDefinitionIds: ["placement"], modelSchemaReleaseIds: [] }, [{ resourceType: "campaign-placements", sourceId: "placement", payload: { ...base, plotDefinitionIds: [] } }], world);
    expect(valid.valid).toBe(true);
    const invalid = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: [], placementDefinitionIds: ["placement"], modelSchemaReleaseIds: [] }, [{ resourceType: "campaign-placements", sourceId: "placement", payload: { ...base, plotDefinitionIds: ["missing-plot"] } }], world);
    expect(invalid.issues.map(({ code }) => code)).toContain("placement-plot-not-found");
    const duplicate = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: [], placementDefinitionIds: ["placement"], modelSchemaReleaseIds: [] }, [{ resourceType: "campaign-placements", sourceId: "placement", payload: { ...base, plotDefinitionIds: ["missing-plot", "missing-plot"] } }], world);
    expect(duplicate.issues.map(({ code }) => code)).toContain("placement-plot-id-duplicate");
  });

  it("validates nested Plot identity and Claim references within each Plot", () => {
    const plot = { id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Claims", objectives: [{ id: "same", name: "One" }, { id: "same", name: "Two" }], pressures: [], resistances: [], discoveries: [{ id: "discovery", name: "First", claims: [{ id: "truth", kind: "truth", statement: "True" }, { id: "belief", kind: "belief", statement: "Believed", conflictsWithClaimIds: ["missing", "missing"] }] }, { id: "discovery", name: "Second", claims: [{ id: "truth", kind: "rumor", statement: "Rumor", relatedTruthClaimId: "belief" }] }], locationContexts: [{ id: "context", locationId: "harbor" }, { id: "context", locationId: "harbor" }] };
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: [] }, [{ resourceType: "plots", sourceId: "plot", payload: plot }], world);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["plot-objective-id-duplicate", "plot-claim-id-duplicate", "plot-location-context-id-duplicate", "claim-conflict-id-duplicate", "claim-conflict-not-found", "claim-related-truth-not-found"]));
  });

  it("rejects a Claim that conflicts with itself", () => {
    const plot = { id: "plot", campaignDefinitionId: "campaign", parent: { kind: "root" }, name: "Claims", objectives: [], pressures: [], resistances: [], discoveries: [{ id: "discovery", name: "Belief", claims: [{ id: "belief", kind: "belief", statement: "Believed", conflictsWithClaimIds: ["belief"] }] }], locationContexts: [] };
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "", playerIntroduction: "", plotDefinitionIds: ["plot"], placementDefinitionIds: [], modelSchemaReleaseIds: [] }, [{ resourceType: "plots", sourceId: "plot", payload: plot }], world);
    expect(result.issues.map(({ code }) => code)).toContain("claim-self-conflict");
  });

  it("requires actor-role suggestions to resolve to a captured Creature", () => {
    const placement = { id: "placement", kind: "independent", locationId: "harbor", plotDefinitionIds: [], source: { kind: "actor-role", role: "Guide", suggestedCreatureDefinitionId: "canonical-item" } };
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: "Premise", playerIntroduction: "Introduction", plotDefinitionIds: [], placementDefinitionIds: ["placement"], modelSchemaReleaseIds: [] }, [{ resourceType: "campaign-placements", sourceId: "placement", payload: placement }], world);
    expect(result.issues.map(({ code }) => code)).toContain("placement-source-not-creature");
  });

  it("rejects scripts, event handlers, and unsafe links in Campaign rich text", () => {
    for (const unsafe of ["<script>alert(1)</script>", '<p onclick="alert(1)">Text</p>', '<a href="javascript:alert(1)">Join</a>']) {
      const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: unsafe, playerIntroduction: "Introduction", plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [] }, [], world);
      expect(result.issues.map(({ code }) => code)).toContain("campaign-content-invalid");
    }
  });

  it("accepts bounded preparation narrative fields and safe links", () => {
    const result = validateCampaignDefinitionDraft("campaign", { formatVersion: 1, gmPremise: '<p><a href="https://example.com">Lead</a></p>', playerIntroduction: "<blockquote>Welcome</blockquote>", plotDefinitionIds: [], placementDefinitionIds: [], modelSchemaReleaseIds: [], preparation: { startingContext: "At dusk", mapVariations: "Use the flooded version", locationCanvases: [] } }, [], world);
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("reports human-labeled decoration conflicts and accepts an explicit direct-successor mapping", () => {
    const source = worldRow("snapshot-1", "revision-1", null, world);
    const targetManifest = buildSnapshotManifest(1, [
      { resourceType: "locations", sourceId: "harbor", payload: { id: "harbor", name: "Old Harbor" } },
      { resourceType: "creatures", sourceId: "captain", payload: { id: "captain", name: "Captain Vale" } },
      { resourceType: "world-placements", sourceId: "captain-at-harbor", payload: { id: "captain-at-harbor", name: "Captain on the quay", locationId: "harbor", source: { kind: "world-creature", creatureId: "captain" } } },
    ]);
    const target = worldRow("snapshot-2", "revision-2", "revision-1", targetManifest);
    const draft = {
      id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world",
      baseRevisionId: "campaign-revision", baseSnapshotId: "campaign-snapshot",
      capturedWorldSnapshotId: "snapshot-1", revisionName: "Ashes", content: { formatVersion: 1 },
      snapshotRecords: [{ resourceType: "campaign-placements", sourceId: "decoration", payload: { id: "decoration", kind: "world-decoration", capturedWorldPlacementId: "captain-at-harbor" } }],
      storageRevision: 3, validationStatus: "VALID", validatedStorageRevision: 3,
      validationReport: {}, createdAt: new Date(), updatedAt: new Date(), capturedWorldSnapshot: source,
    } as never;
    const blocked = buildCampaignWorldMigrationPlan(draft, target, []);
    expect(blocked.ready).toBe(false);
    expect(blocked.conflicts[0]).toMatchObject({
      sourceLabel: "Captain at the harbor",
      source: { resourceType: "world-placements", id: "captain-at-harbor" },
      candidates: [{ id: "captain-at-harbor", label: "Captain on the quay", typeLabel: "World placement" }],
    });
    const resolved = buildCampaignWorldMigrationPlan(draft, target, [{ resourceType: "world-placements", sourceId: "captain-at-harbor", targetId: "captain-at-harbor" }]);
    expect(resolved.ready).toBe(true);
    expect(resolved.planHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects migration mappings that change semantic content kind", () => {
    const sourceManifest = buildSnapshotManifest(1, [
      { resourceType: "definitions", sourceId: "old-creature", payload: { id: "old-creature", kind: "creature", name: "Old Keeper" } },
    ]);
    const targetManifest = buildSnapshotManifest(1, [
      { resourceType: "definitions", sourceId: "new-item", payload: { id: "new-item", kind: "item", name: "New Key" } },
      { resourceType: "definitions", sourceId: "new-creature", payload: { id: "new-creature", kind: "creature", name: "New Keeper" } },
    ]);
    const source = worldRow("semantic-source", "semantic-revision-1", null, sourceManifest);
    const target = worldRow("semantic-target", "semantic-revision-2", "semantic-revision-1", targetManifest);
    const draft = { id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world", content: { creatureId: "old-creature" }, snapshotRecords: [], storageRevision: 2, capturedWorldSnapshot: source } as never;
    const invalid = buildCampaignWorldMigrationPlan(draft, target, [{ resourceType: "definitions", sourceId: "old-creature", targetId: "new-item" }]);
    expect(invalid.ready).toBe(false);
    expect(invalid.conflicts.map(({ code }) => code)).toContain("mapping-invalid");
    const conflict = invalid.conflicts.find(({ code }) => code === "referenced-content-removed");
    expect(conflict?.candidates).toEqual([{ id: "new-creature", label: "New Keeper", typeLabel: "World content" }]);
  });

  it("classifies Location moves, Model release changes, and affected Plots with human labels", () => {
    const sourceManifest = buildSnapshotManifest(1, [
      { resourceType: "world-definition-revision", sourceId: "world-revision-1", sourceRevision: 1, payload: { modelSchemaReleaseIds: ["model-old"] } },
      { resourceType: "locations", sourceId: "old-parent", payload: { name: "Old Quarter", kind: "region" } },
      { resourceType: "locations", sourceId: "new-parent", payload: { name: "New Quarter", kind: "region" } },
      { resourceType: "locations", sourceId: "moved", payload: { name: "Bell Tower", kind: "site", placement: { kind: "within-parent", parentLocationId: "old-parent" } } },
      { resourceType: "model-releases", sourceId: "model-old", payload: { name: "Old Rules" } },
    ]);
    const targetManifest = buildSnapshotManifest(1, [
      { resourceType: "world-definition-revision", sourceId: "world-revision-2", sourceRevision: 2, payload: { modelSchemaReleaseIds: ["model-new"] } },
      { resourceType: "locations", sourceId: "old-parent", payload: { name: "Old Quarter", kind: "region" } },
      { resourceType: "locations", sourceId: "new-parent", payload: { name: "New Quarter", kind: "region" } },
      { resourceType: "locations", sourceId: "moved", payload: { name: "Bell Tower", kind: "site", placement: { kind: "within-parent", parentLocationId: "new-parent" } } },
      { resourceType: "model-releases", sourceId: "model-new", payload: { name: "New Rules" } },
    ]);
    const source = worldRow("impact-source", "impact-revision-1", null, sourceManifest, [
      { id: "model-old", name: "Old Rules", revisionNumber: 4, registryName: "Core Rules" },
    ]);
    const target = worldRow("impact-target", "impact-revision-2", "impact-revision-1", targetManifest, [
      { id: "model-new", name: "New Rules", revisionNumber: 5, registryName: "Core Rules" },
    ]);
    const draft = { id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world", content: { formatVersion: 1 }, snapshotRecords: [{ resourceType: "plots", sourceId: "plot", payload: { id: "plot", name: "Bells Plot", locationId: "moved" } }], storageRevision: 2, capturedWorldSnapshot: source } as never;

    const preview = buildCampaignWorldMigrationPlan(draft, target, []);

    expect(preview.impact.locationMoves).toEqual([{ locationName: "Bell Tower", fromParentName: "Old Quarter", toParentName: "New Quarter" }]);
    expect(preview.impact.modelReleases).toEqual({
      added: [{ name: "Core Rules: New Rules (revision 5)" }],
      removed: [{ name: "Core Rules: Old Rules (revision 4)" }],
    });
    expect(preview.impact.affectedPlots[0]).toMatchObject({ plotName: "Bells Plot" });
    expect(JSON.stringify(preview.impact)).not.toContain("impact-revision");
  });

  it("bounds reconciliation amplification while retaining full conflict counts", () => {
    const removed = Array.from({ length: 80 }, (_, index) => ({
      resourceType: "world-placements",
      sourceId: `removed-${index}`,
      payload: { id: `removed-${index}`, name: `Removed placement ${index}` },
    }));
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      resourceType: "world-placements",
      sourceId: `candidate-${index}`,
      payload: { id: `candidate-${index}`, name: `Candidate placement ${index}` },
    }));
    const sourceManifest = buildSnapshotManifest(1, removed);
    const targetManifest = buildSnapshotManifest(1, candidates);
    const source = worldRow("snapshot-large-1", "revision-large-1", null, sourceManifest);
    const target = worldRow(
      "snapshot-large-2",
      "revision-large-2",
      "revision-large-1",
      targetManifest,
    );
    const draft = {
      id: "draft-large",
      campaignDefinitionId: "campaign",
      worldDefinitionId: "world",
      content: { references: removed.map(({ sourceId }) => sourceId) },
      snapshotRecords: [],
      storageRevision: 7,
      capturedWorldSnapshot: source,
    } as never;

    const preview = buildCampaignWorldMigrationPlan(draft, target, []);

    expect(preview.ready).toBe(false);
    expect(preview.conflictSummary).toMatchObject({
      total: 80,
      returned: MAX_MIGRATION_CONFLICTS,
      offset: 0,
      nextOffset: MAX_MIGRATION_CONFLICTS,
      truncated: true,
    });
    expect(preview.conflicts).toHaveLength(MAX_MIGRATION_CONFLICTS);
    expect(preview.conflicts[0]?.candidates).toHaveLength(
      MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
    );
    expect(Buffer.byteLength(JSON.stringify(preview), "utf8")).toBeLessThanOrEqual(
      MAX_MIGRATION_PREVIEW_BYTES,
    );
    const nextPage = buildCampaignWorldMigrationPlan(draft, target, [], {
      conflictOffset: MAX_MIGRATION_CONFLICTS,
      candidateOffset: MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
    });
    expect(nextPage.conflicts).toHaveLength(30);
    expect(nextPage.conflicts[0]?.candidates).toHaveLength(
      MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
    );
    expect(nextPage.conflicts[0]?.candidateSummary).toMatchObject({
      total: 30,
      offset: MAX_MIGRATION_CANDIDATES_PER_CONFLICT,
      truncated: true,
    });
  });

  it("accepts more than one hundred all-or-nothing reconciliations", () => {
    const count = 125;
    const sourceRecords = Array.from({ length: count }, (_, index) => ({
      resourceType: "locations", sourceId: `old-${index}`, payload: { name: `Old Location ${index}` },
    }));
    const targetRecords = Array.from({ length: count }, (_, index) => ({
      resourceType: "locations", sourceId: `new-${index}`, payload: { name: `New Location ${index}` },
    }));
    const source = worldRow("many-source", "many-revision-1", null, buildSnapshotManifest(1, sourceRecords));
    const target = worldRow("many-target", "many-revision-2", "many-revision-1", buildSnapshotManifest(1, targetRecords));
    const draft = {
      id: "draft", campaignDefinitionId: "campaign", worldDefinitionId: "world",
      content: { referencedLocations: sourceRecords.map(({ sourceId }) => sourceId) },
      snapshotRecords: sourceRecords.map(({ sourceId }, index) => ({
        resourceType: "plots", sourceId: `plot-${index}`,
        payload: { name: `Affected Plot ${index}`, locationId: sourceId },
      })),
      storageRevision: 3, capturedWorldSnapshot: source,
    } as never;
    const preview = buildCampaignWorldMigrationPlan(draft, target, []);
    expect(preview.conflictSummary.total).toBe(count);
    const mappings = sourceRecords.map(({ sourceId }, index) => ({
      resourceType: "locations", sourceId, targetId: `new-${index}`,
    }));
    const reconciled = buildCampaignWorldMigrationPlan(draft, target, mappings, { internal: true });
    expect(reconciled.ready).toBe(true);
    expect(reconciled.mappings).toHaveLength(count);
    const bounded = buildCampaignWorldMigrationPlan(draft, target, mappings);
    expect(bounded.mappings).toEqual([]);
    expect(bounded.impact.summary.affectedPlots).toBe(count);
    expect(bounded.impact.affectedPlots.length).toBeGreaterThan(0);
    expect(bounded.impact.nextOffset).toBe(bounded.impact.affectedPlots.length);
    expect(Buffer.byteLength(JSON.stringify(bounded), "utf8")).toBeLessThanOrEqual(MAX_MIGRATION_PREVIEW_BYTES);
    const nextImpact = buildCampaignWorldMigrationPlan(draft, target, mappings, {
      impactOffset: bounded.impact.nextOffset,
    });
    const firstPageNames = new Set(bounded.impact.affectedPlots.map(({ plotName }) => plotName));
    expect(nextImpact.impact.affectedPlots.length).toBeGreaterThan(0);
    expect(nextImpact.impact.affectedPlots.every(({ plotName }) => !firstPageNames.has(plotName))).toBe(true);
  });

  it("keeps a large conflict-free migration semantically applyable when its presentation is truncated", () => {
    const longId = (prefix: string, index: number) =>
      `${prefix}-${index}-${"i".repeat(190)}`;
    const changedSource = Array.from({ length: 150 }, (_, index) => ({
      resourceType: "locations",
      sourceId: longId("changed", index),
      payload: { name: `Before ${index} ${"n".repeat(170)}` },
    }));
    const changedTarget = changedSource.map((record, index) => ({
      ...record,
      payload: { name: `After ${index} ${"n".repeat(170)}` },
    }));
    const removed = Array.from({ length: 150 }, (_, index) => ({
      resourceType: "locations",
      sourceId: longId("removed", index),
      payload: { name: `Removed ${index} ${"n".repeat(170)}` },
    }));
    const added = Array.from({ length: 150 }, (_, index) => ({
      resourceType: "locations",
      sourceId: longId("added", index),
      payload: { name: `Added ${index} ${"n".repeat(170)}` },
    }));
    const sourceManifest = buildSnapshotManifest(1, [...changedSource, ...removed]);
    const targetManifest = buildSnapshotManifest(1, [...changedTarget, ...added]);
    const source = worldRow("large-source", "large-revision-1", null, sourceManifest);
    const target = worldRow(
      "large-target",
      "large-revision-2",
      "large-revision-1",
      targetManifest,
    );
    const draft = {
      id: "large-draft",
      campaignDefinitionId: "campaign",
      worldDefinitionId: "world",
      content: { formatVersion: 1 },
      snapshotRecords: [],
      storageRevision: 9,
      capturedWorldSnapshot: source,
    } as never;

    const preview = buildCampaignWorldMigrationPlan(draft, target, []);

    expect(preview.presentationTruncated).toBe(true);
    expect(preview.changeSummary).toMatchObject({
      offset: 0,
      nextOffset: MAX_MIGRATION_CHANGES_PER_KIND,
      returned: {
        added: MAX_MIGRATION_CHANGES_PER_KIND,
        changed: MAX_MIGRATION_CHANGES_PER_KIND,
        removed: MAX_MIGRATION_CHANGES_PER_KIND,
      },
    });
    const secondPage = buildCampaignWorldMigrationPlan(draft, target, [], {
      changeOffset: MAX_MIGRATION_CHANGES_PER_KIND,
    });
    expect(secondPage.changes.added).toHaveLength(MAX_MIGRATION_CHANGES_PER_KIND);
    expect(secondPage.changes.added[0]?.name).toContain("Added 50");
    expect(preview.ready).toBe(true);
    expect(preview.conflictSummary.total).toBe(0);
    expect(preview.conflicts).toEqual([]);
    expect(preview.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.byteLength(JSON.stringify(preview), "utf8")).toBeLessThanOrEqual(
      MAX_MIGRATION_PREVIEW_BYTES,
    );
    const applyPlan = buildCampaignWorldMigrationPlan(draft, target, [], {
      internal: true,
    });
    expect(applyPlan.ready).toBe(true);
    expect(applyPlan.planHash).toBe(preview.planHash);
    expect(applyPlan.changes.added).toHaveLength(150);
    expect(applyPlan.changes.changed).toHaveLength(150);
    expect(applyPlan.changes.removed).toHaveLength(150);
  });
});

function worldRow(
  snapshotId: string,
  revisionId: string,
  predecessorRevisionId: string | null,
  manifest: ReturnType<typeof buildSnapshotManifest>,
  modelReleases: readonly { id: string; name: string; revisionNumber: number; registryName: string }[] = [],
) {
  return {
    id: snapshotId, worldDefinitionId: "world", worldDefinitionRevisionId: revisionId,
    manifest, contentHash: manifest.contentHash, capturedAt: new Date(),
    worldDefinitionRevision: {
      id: revisionId, revisionNumber: predecessorRevisionId ? 2 : 1,
      predecessorRevisionId, name: `World ${revisionId}`, publishedAt: new Date(),
      worldDefinition: { name: "Glasswake", ownerUserId: "gm-1" },
      modelSchemaSelections: modelReleases.map((release) => ({
        modelSchemaReleaseId: release.id,
        modelSchemaRelease: {
          name: release.name,
          revisionNumber: release.revisionNumber,
          registry: { name: release.registryName },
        },
      })),
    },
  } as never;
}
