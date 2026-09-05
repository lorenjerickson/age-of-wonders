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
          worldPlacementDefinitionIds: [],
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
        worldPlacementDefinitionIds: [],
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
        worldPlacementDefinitionIds: [],
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

  it("accepts exact Creature, Item, and registered-content World placements", () => {
    const records = [
      root,
      { resourceType: "definitions", sourceId: "creature", payload: { id: "creature", kind: "creature", name: "Keeper" } },
      { resourceType: "definitions", sourceId: "item", payload: { id: "item", kind: "item", name: "Key" } },
      { resourceType: "definitions", sourceId: "hazard", payload: { id: "hazard", kind: "hazard", name: "Flood" } },
      { resourceType: "world-placements", sourceId: "placed-creature", payload: { id: "placed-creature", name: "Keeper at the gate", locationId: "world-root", source: { kind: "world-creature", creatureId: "creature" }, mapPosition: { kind: "normalized-map", x: 0.25, y: 0.75 }, scale: 1.5 } },
      { resourceType: "world-placements", sourceId: "placed-item", payload: { id: "placed-item", name: "Key on the hook", locationId: "world-root", source: { kind: "world-item", itemDefinitionId: "item" } } },
      { resourceType: "world-placements", sourceId: "placed-hazard", payload: { id: "placed-hazard", name: "Rising flood", locationId: "world-root", source: { kind: "registered-content", definitionId: "hazard" } } },
    ];
    expect(validateWorldDefinitionDraft({
      rootLocationId: "world-root",
      locationIds: ["world-root"],
      definitionIds: ["creature", "item", "hazard"],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: ["placed-creature", "placed-item", "placed-hazard"],
      modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
    }, records)).toEqual({ valid: true, issues: [] });
  });

  it("rejects malformed, dangling, undeclared, and duplicate World placements with human issues", () => {
    const report = validateWorldDefinitionDraft({
      rootLocationId: "world-root",
      locationIds: ["world-root"],
      definitionIds: [{ not: "an id" }],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: ["missing-placement", "dangling-placement"],
      modelSchemaReleaseIds: ["aow:model-schema-release:core:1"],
    }, [
      root,
      { resourceType: "world-placements", sourceId: "dangling-placement", payload: { id: "dangling-placement", name: "Lost keeper", locationId: "unknown-location", source: { kind: "world-creature", creatureId: "unknown-creature" } } },
      { resourceType: "world-placements", sourceId: "undeclared-placement", sourceRevision: 1, payload: { id: "undeclared-placement", name: "Broken token", locationId: "world-root", source: { kind: "world-item", itemDefinitionId: "missing-item" }, mapPosition: { kind: "normalized-map", x: 2, y: 0 }, token: { image: "not-placement-data" } } },
      { resourceType: "world-placements", sourceId: "undeclared-placement", sourceRevision: 2, payload: { id: "undeclared-placement", name: "Duplicate token", locationId: "world-root", source: { kind: "registered-content", definitionId: "missing-content" } } },
    ]);
    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "collection-invalid",
      "duplicate-record",
      "world-placement-invalid",
      "world-placement-location-not-found",
      "world-placement-membership-mismatch",
      "world-placement-record-missing",
      "world-placement-source-not-found",
    ]));
    expect(report.issues.map(({ subject }) => subject)).toEqual(expect.arrayContaining([
      "Lost keeper",
      "Broken token",
      "World placements",
    ]));
    expect(JSON.stringify(report)).not.toContain("unknown-creature");
  });
});
