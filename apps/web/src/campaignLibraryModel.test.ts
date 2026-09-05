import { describe, expect, it } from "vitest";
import {
  campaignDefinitionCard,
  campaignInstanceCard,
  dateLabel,
} from "./campaignLibraryModel";

describe("Campaign library presentation", () => {
  it("uses a neutral label for invalid dates", () => {
    expect(dateLabel("not-a-date")).toBe("Date unavailable");
  });
  it("maps Definitions to the aggregate-specific authoring route", () => {
    const card = campaignDefinitionCard({
      id: "definition-opaque-id",
      name: "Ashes of Greyhaven",
      description: "A Campaign prepared against a captured World.",
      status: "published",
      updatedAt: "2026-09-04T12:00:00.000Z",
      currentRevision: {
        id: "definition-revision-opaque-id",
        revisionNumber: 3,
        name: "Ashes of Greyhaven",
        contentHash: "definition-secret-hash",
        publishedAt: "2026-09-04T12:00:00.000Z",
        capturedWorld: {
          snapshotId: "world-snapshot-opaque-id",
          worldDefinitionId: "world-opaque-id",
          worldDefinitionRevisionId: "world-revision-opaque-id",
          revisionNumber: 7,
          name: "Greyhaven",
        },
      },
    });

    expect(card.href).toBe(
      "/campaigns/definitions/definition-opaque-id",
    );
    expect(card.actionLabel).toBe("Open Definition");
    expect(visibleCardText(card)).not.toMatch(/opaque-id|secret-hash/);
    expect(visibleCardText(card)).toContain("Greyhaven · World revision 7");
  });

  it("maps Instances to management without implying a resumable Session", () => {
    const card = campaignInstanceCard({
      id: "instance-opaque-id",
      name: "Thursday Night Greyhaven",
      status: "active",
      updatedAt: "2026-09-04T12:00:00.000Z",
      currentSnapshot: {
        snapshotNumber: 2,
        campaignDefinition: {
          name: "Ashes of Greyhaven",
          revisionNumber: 3,
        },
        worldDefinition: { name: "Greyhaven", revisionNumber: 7 },
      },
    });

    expect(card.href).toBe("/campaigns/instances/instance-opaque-id");
    expect(card.actionLabel).toBe("Manage Instance");
    expect(visibleCardText(card)).not.toMatch(/opaque-id|Continue|Resume/);
  });
});

function visibleCardText(card: ReturnType<typeof campaignDefinitionCard>) {
  return [
    card.name,
    card.description,
    card.statusLabel,
    card.primaryMetadata,
    card.secondaryMetadata,
    card.actionLabel,
  ].join(" ");
}
