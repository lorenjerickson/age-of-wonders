import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";

const root = {
  resourceType: "locations",
  sourceId: "world-root",
  payload: {
    name: "The Glasswake",
    kind: "world",
    placement: { kind: "root" },
  },
};

describe("validateWorldDefinitionDraft", () => {
  it("accepts one complete resource-qualified World revision", () => {
    expect(
      validateWorldDefinitionDraft(
        {
          rootLocationId: "world-root",
          locationIds: ["world-root"],
          definitionIds: [],
          schemaDefinitionIds: [],
          modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
        },
        [root],
      ),
    ).toEqual({ valid: true, issues: [] });
  });

  it("blocks incomplete hierarchies and caller-owned authoritative records", () => {
    const report = validateWorldDefinitionDraft(
      {
        rootLocationId: "missing-root",
        locationIds: ["missing-root", "child"],
        definitionIds: [],
        schemaDefinitionIds: [],
        modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
      },
      [
        {
          resourceType: "locations",
          sourceId: "child",
          payload: {
            name: "Child",
            placement: { kind: "within-parent", parentLocationId: "elsewhere" },
          },
        },
        {
          resourceType: "world-definition-revision",
          sourceId: "forged",
          payload: {},
        },
      ],
    );

    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "declared-record-missing",
        "location-parent-missing",
        "reserved-record",
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("missing-root");
  });

  it("detects cycles without exposing opaque resource identifiers", () => {
    const report = validateWorldDefinitionDraft(
      {
        rootLocationId: "a",
        locationIds: ["a", "b"],
        definitionIds: [],
        schemaDefinitionIds: [],
        modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
      },
      [
        {
          resourceType: "locations",
          sourceId: "a",
          payload: {
            name: "Alpha",
            kind: "world",
            placement: { kind: "within-parent", parentLocationId: "b" },
          },
        },
        {
          resourceType: "locations",
          sourceId: "b",
          payload: {
            name: "Beta",
            placement: { kind: "within-parent", parentLocationId: "a" },
          },
        },
      ],
    );
    expect(
      report.issues.filter(({ code }) => code === "location-cycle"),
    ).toHaveLength(2);
    expect(report.issues.map(({ subject }) => subject)).toEqual(
      expect.arrayContaining(["Alpha", "Beta"]),
    );
  });
});
