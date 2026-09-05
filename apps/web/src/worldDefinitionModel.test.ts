import { describe, expect, it } from "vitest";
import {
  currentWorldRevision,
  humanWorldName,
  safeDateLabel,
  worldRevisionLabel,
} from "./worldDefinitionModel";

describe("World Definition presentation", () => {
  it("uses the declared current revision instead of inferring a latest revision", () => {
    const current = { id: "current", revisionNumber: 2 };
    const result = currentWorldRevision({
      id: "world",
      name: "Sea of Glass",
      status: "active",
      currentRevisionId: "current",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revisions: [
        {
          ...current,
          name: "Second",
          contentHash: "hidden",
          content: {},
          createdAt: "2026-01-01T00:00:00Z",
          publishedAt: "2026-01-01T00:00:00Z",
          snapshots: [],
        },
        {
          id: "newer-but-not-current",
          revisionNumber: 3,
          name: "Third",
          contentHash: "hidden",
          content: {},
          createdAt: "2026-01-02T00:00:00Z",
          publishedAt: "2026-01-02T00:00:00Z",
          snapshots: [],
        },
      ],
    });

    expect(result?.id).toBe("current");
  });

  it("uses neutral human-readable fallbacks", () => {
    expect(humanWorldName(" ")).toBe("Unnamed World Definition");
    expect(worldRevisionLabel({})).toBe("No published revision");
    expect(safeDateLabel("not-a-date")).toBe("Date unavailable");
  });
});
