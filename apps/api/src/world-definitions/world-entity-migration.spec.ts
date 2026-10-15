import { WorldDefinition } from "@aow/domain";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";

const content = {
  rootLocationId: "root",
  locationIds: ["root"],
  definitionIds: [],
  schemaDefinitionIds: [],
  worldPlacementDefinitionIds: [],
  modelSchemaReleaseIds: ["core-release"],
};
const location = (id: string, name: string, parent?: string) => ({
  resourceType: "locations",
  sourceId: id,
  payload: {
    identity: {
      id,
      version: { revision: 1, updatedAt: "2026-10-11T00:00:00.000Z" },
    },
    name,
    kind: parent ? "region" : "world",
    placement: parent
      ? { kind: "within-parent", parentLocationId: parent }
      : { kind: "root" },
    image: {
      assetId: "artwork",
      altText: "A map",
      width: 100,
      height: 100,
      mimeType: "image/png",
      orientation: "overhead",
    },
    map: { kind: "image" },
  },
});

describe("World entity validation adapter", () => {
  it("projects entity-owned membership, root, and cycle diagnostics exactly", () => {
    const capture = [
      location("root", "Root", "child"),
      location("child", "Child", "root"),
      {
        resourceType: "world-placements",
        sourceId: "token",
        payload: { name: "Token" },
      },
    ];
    const draft = {
      ...content,
      locationIds: ["root", "child"],
      schemaDefinitionIds: ["missing-schema"],
      worldPlacementDefinitionIds: ["missing-token"],
    };
    const world = WorldDefinition.deserializePayload(draft, {
      records: capture,
      relatedValidation: { content: draft, records: capture, issues: [] },
    });
    try {
      const report = validateWorldDefinitionDraft(draft, capture);
      for (const issue of world.state.metadata.validity.issues) {
        expect(report.issues).toContainEqual({
          code: issue.code,
          subject: (issue as { subject?: string }).subject,
          detail: issue.message,
        });
      }
      expect(report.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "location-cycle",
          "root-kind-invalid",
          "root-placement-invalid",
          "schema-record-missing",
          "world-placement-membership-mismatch",
          "world-placement-record-missing",
          "world-placement-invalid",
        ]),
      );
      expect(
        report.issues.filter(({ code }) => code === "location-cycle"),
      ).toHaveLength(2);
      expect(JSON.stringify(report)).not.toContain("missing-schema");
      expect(JSON.stringify(report)).not.toContain("missing-token");
    } finally {
      world.dispose();
    }
  });

  it("validates Placement World references only after local shape validation", () => {
    const report = validateWorldDefinitionDraft(
      { ...content, worldPlacementDefinitionIds: ["broken", "dangling"] },
      [
        location("root", "Root"),
        {
          resourceType: "world-placements",
          sourceId: "broken",
          payload: {
            id: "broken",
            name: "Broken",
            locationId: "missing-location",
            source: { kind: "world-item", itemDefinitionId: "missing-item" },
            scale: -1,
          },
        },
        {
          resourceType: "world-placements",
          sourceId: "dangling",
          payload: {
            id: "dangling",
            name: "Dangling",
            locationId: "missing-location",
            source: { kind: "world-item", itemDefinitionId: "missing-item" },
          },
        },
      ],
    );
    expect(report.issues).toEqual([
      {
        code: "world-placement-invalid",
        subject: "Broken",
        detail:
          "The World placement shape, presentation, or coordinates are invalid.",
      },
      {
        code: "world-placement-location-not-found",
        subject: "Dangling",
        detail: "The placement Location is not present in this World revision.",
      },
      {
        code: "world-placement-source-not-found",
        subject: "Dangling",
        detail:
          "The placed Creature, Item, or registered content is not present in this World revision.",
      },
    ]);
  });

  it("retains canonical child validation when the World relationship graph is valid", () => {
    const child = location("root", "Mapless world");
    const { map: _map, image: _image, ...mapless } = child.payload;
    const capture = [{ ...child, payload: mapless }];
    const world = WorldDefinition.deserializePayload(content, {
      records: capture,
    });
    try {
      expect(world.state.metadata.validity.status).toBe("unresolved");
      expect(validateWorldDefinitionDraft(content, capture).issues).toEqual([
        expect.objectContaining({
          code: "location-definition-invalid",
          subject: "Mapless world",
        }),
      ]);
    } finally {
      world.dispose();
    }
  });

  it.each([null, "world", [content], { ...content, invalid: Number.NaN }])(
    "keeps malformed content rejection bounded and independent of child validation",
    (invalid) => {
      expect(
        validateWorldDefinitionDraft(invalid, [location("root", "Root")]),
      ).toEqual({
        valid: false,
        issues: [
          {
            code: "content-invalid",
            subject: "World draft",
            detail: "The complete World content must be bounded JSON.",
          },
        ],
      });
    },
  );

  it("reports invalid captured JSON without throwing or losing other graph issues", () => {
    const cyclic: Record<string, unknown> = { name: "Broken capture" };
    cyclic.self = cyclic;
    const report = validateWorldDefinitionDraft(content, [
      {
        resourceType: "unregistered",
        sourceId: "opaque-capture",
        payload: cyclic,
      },
    ]);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        {
          code: "record-invalid",
          subject: "Broken capture",
          detail: "The captured resource must be bounded JSON.",
        },
        {
          code: "declared-record-missing",
          subject: "World draft",
          detail: "A declared Location is missing from the capture.",
        },
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("opaque-capture");
  });

  it("treats envelope-shaped content as raw authored content", () => {
    const report = validateWorldDefinitionDraft(
      { type: "world-definition", schemaVersion: 1, data: content },
      [location("root", "Root")],
    );
    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toContain("root-missing");
  });
});
