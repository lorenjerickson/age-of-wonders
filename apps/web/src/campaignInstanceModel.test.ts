import { describe, expect, it } from "vitest";
import {
  campaignInstanceInvitationCanRetry,
  campaignInstanceNavigationForPath,
  continueCampaignAction,
  instanceReadinessSummary,
  mergeInstanceRuntimeState,
  mergeMigrationPreviewPages,
  migrationPreviewIsComplete,
  placementCommand,
  visibleInstanceReference,
} from "./campaignInstanceModel";
import type { CampaignInstanceMigrationPreviewProjection } from "@aow/common";

describe("Campaign Instance navigation", () => {
  it("keeps management concerns nested beneath the selected Instance", () => {
    const groups = campaignInstanceNavigationForPath(
      "instance-opaque-id",
      "/campaigns/instances/instance-opaque-id/roster/agents",
    );
    expect(groups.map(({ label }) => label)).toEqual([
      "Preparation",
      "Participation",
      "History",
    ]);
    expect(groups.find(({ active }) => active)?.label).toBe("Participation");
    expect(JSON.stringify(groups)).not.toContain("Run");
    expect(
      JSON.stringify(
        groups.map(({ label, children }) => ({
          label,
          children: children.map(({ label: childLabel }) => childLabel),
        })),
      ),
    ).not.toContain("opaque-id");
  });
});

describe("Campaign Instance invitation actions", () => {
  it("offers retry only while the API permits redelivery", () => {
    expect(campaignInstanceInvitationCanRetry("pending")).toBe(true);
    expect(campaignInstanceInvitationCanRetry("expired")).toBe(true);
    expect(campaignInstanceInvitationCanRetry("accepted")).toBe(false);
    expect(campaignInstanceInvitationCanRetry("revoked")).toBe(false);
  });
});

describe("Campaign Instance placement interactions", () => {
  it("builds realize, defer, and remove commands without a replacement", () => {
    for (const action of ["realize", "defer", "remove"] as const) {
      expect(placementCommand(7, action)).toEqual({
        expectedRuntimeRevision: 7,
        action,
      });
    }
  });

  it("builds replacement commands from opaque option values and human input", () => {
    expect(
      placementCommand(7, "replace", "existing-creature\u0000creature-id"),
    ).toEqual({
      expectedRuntimeRevision: 7,
      action: "replace",
      replacement: {
        kind: "existing-creature",
        runtimeCreatureId: "creature-id",
      },
    });
    expect(placementCommand(7, "replace", "instance-created-item")).toBeUndefined();
    expect(placementCommand(7, "replace")).toBeUndefined();
  });
});

describe("Campaign continuation", () => {
  it("continues a live Session and resumes a paused Session", () => {
    expect(
      continueCampaignAction({
        instanceStatus: "active",
        sessions: [{ id: "live", name: "The Bell Tolls", status: "live" }],
      }),
    ).toMatchObject({
      kind: "continue",
      label: "Continue",
      sessionName: "The Bell Tolls",
    });
    expect(
      continueCampaignAction({
        instanceStatus: "paused",
        sessions: [{ id: "paused", name: "After the Flood", status: "paused" }],
      }),
    ).toMatchObject({
      kind: "resume",
      label: "Resume",
      sessionName: "After the Flood",
    });
  });

  it("never guesses when several resumable Sessions exist", () => {
    expect(
      continueCampaignAction({
        instanceStatus: "active",
        sessions: [
          { id: "one", name: "First", status: "paused" },
          { id: "two", name: "Second", status: "paused" },
        ],
      }),
    ).toEqual({
      kind: "choose",
      label: "Choose Session",
      explanation: "Choose which Session to continue.",
    });
  });

  it("explains the next action when no Session can be resumed", () => {
    expect(
      continueCampaignAction({ instanceStatus: "preparing", sessions: [] }),
    ).toEqual({
      kind: "plan",
      label: "Plan Session",
      explanation: "Plan the first Session before continuing this campaign.",
    });
  });
});

describe("Instance-safe presentation", () => {
  it("accumulates migration pages without duplicate conflicts", () => {
    const base = {
      planHash: "stable-plan",
      changes: [
        {
          subjectName: "Old Harbor",
          typeLabel: "locations",
          change: "removed",
        },
      ],
      conflicts: [
        {
          key: "locations:old",
          resourceType: "locations",
          sourceId: "old",
          subjectName: "Old Harbor",
          typeLabel: "locations",
          detail: "Choose a successor.",
          mappingRequired: true,
        },
      ],
      mappingCandidates: [
        {
          conflictKey: "locations:old",
          resourceType: "locations",
          sourceId: "old",
          targetId: "new",
          targetName: "New Harbor",
          targetTypeLabel: "locations",
        },
      ],
      totalChanges: 2,
      totalConflicts: 1,
      totalMappingCandidates: 1,
      nextChangeOffset: 1,
      nextConflictOffset: undefined,
      nextCandidateOffset: undefined,
    } as unknown as CampaignInstanceMigrationPreviewProjection;
    const merged = mergeMigrationPreviewPages([
      base,
      {
        ...base,
        changes: [
          {
            subjectName: "New Harbor",
            typeLabel: "locations",
            change: "added",
          },
        ],
        nextChangeOffset: undefined,
      },
    ]);
    expect(merged?.changes).toHaveLength(2);
    expect(merged?.conflicts).toHaveLength(1);
    expect(merged?.mappingCandidates).toHaveLength(1);
    expect(merged && migrationPreviewIsComplete(merged)).toBe(true);
  });

  it("keeps a bounded migration preview incomplete until candidate pages are loaded", () => {
    const firstPage = {
      planHash: "stable-plan",
      changes: [],
      conflicts: [],
      mappingCandidates: [
        {
          conflictKey: "locations:old",
          resourceType: "locations",
          sourceId: "old",
          targetId: "new-a",
          targetName: "North Harbor",
          targetTypeLabel: "Location",
        },
      ],
      totalChanges: 0,
      totalConflicts: 0,
      totalMappingCandidates: 2,
      nextChangeOffset: undefined,
      nextConflictOffset: undefined,
      nextCandidateOffset: 1,
    } as unknown as CampaignInstanceMigrationPreviewProjection;

    expect(migrationPreviewIsComplete(firstPage)).toBe(false);

    const merged = mergeMigrationPreviewPages([
      firstPage,
      {
        ...firstPage,
        mappingCandidates: [
          {
            conflictKey: "locations:old",
            resourceType: "locations",
            sourceId: "old",
            targetId: "new-b",
            targetName: "South Harbor",
            targetTypeLabel: "Location",
          },
        ],
        nextCandidateOffset: undefined,
      },
    ]);

    expect(merged?.mappingCandidates.map(({ targetName }) => targetName)).toEqual([
      "North Harbor",
      "South Harbor",
    ]);
    expect(merged && migrationPreviewIsComplete(merged)).toBe(true);
  });

  it("uses a neutral fallback rather than displaying an opaque reference", () => {
    expect(
      visibleInstanceReference(
        "campaign-instance:2bf0c7b1-4078-46ec-a134-cf83b6ec751e",
        "Campaign Instance",
      ),
    ).toBe("Campaign Instance");
  });

  it("derives readiness from authoritative facts", () => {
    const summary = instanceReadinessSummary({
      hasSnapshot: true,
      hasStartingContext: true,
      stagedPlotCount: 1,
      activePlayerCount: 2,
      readyCharacterCount: 1,
      plannedSessionCount: 0,
      unresolvedMigrationCount: 0,
    });
    expect(summary.complete).toBe(4);
    expect(summary.items.find(({ key }) => key === "characters")?.state).toBe(
      "blocked",
    );
    expect(summary.items.find(({ key }) => key === "session")?.state).toBe(
      "incomplete",
    );
  });

  it("preserves registered runtime fields while updating supported preparation", () => {
    expect(
      mergeInstanceRuntimeState(
        {
          formatVersion: 1,
          startingContext: "Old",
          "pack:weatherClock": { phase: "storm" },
        },
        { startingContext: "New" },
      ),
    ).toEqual({
      formatVersion: 1,
      startingContext: "New",
      "pack:weatherClock": { phase: "storm" },
    });
  });
});
