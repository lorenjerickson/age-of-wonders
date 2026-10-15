import { describe, expect, it } from "vitest";
import {
  attributeNumberConfig,
  adoptedLegacyModelKey,
  creatureAttributesForEditor,
  campaignReturnContext,
  campaignReturnSuffix,
  draftContextLabel,
  contentAdoptingRegistryRelease,
  definitionConformance,
  creatureEmbodimentPolicyForSave,
  draftAdoptingRegistryRelease,
  draftWithIndexedRecord,
  draftWithoutWorldPlacement,
  effectiveModelOptions,
  filterWorlds,
  hierarchyRows,
  locationParentOptions,
  mergeSavedDraft,
  modelExtensionKey,
  projectEffectiveModels,
  recordDescription,
  recordKey,
  recordName,
  requestedDraftRecordMissing,
  recordsForLibrary,
  recoverableRegistryRelease,
  savedNavigationAllowanceForRoute,
  savedWorldRecordEditorSnapshot,
  upsertDraftRecord,
  worldCreationInput,
  worldDraftMutationRevision,
  worldDraftLabel,
  worldDraftStartLabel,
  worldPlacementRecordsForLocation,
  worldPlacementSourceId,
  worldPlacementSourceIsEditable,
  worldPlacementSourceKind,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import type { JsonValue, WorldDefinitionDraft, WorldDraftRecord } from "./api";

const record = (
  resourceType: string,
  sourceId: string,
  payload: JsonValue,
): WorldDraftRecord => ({ resourceType, sourceId, payload });

describe("World authoring projection", () => {
  it("loads legacy nested scores into adopted Attributes without submitting legacy objects", () => {
    const payload = {
      attributes: {
        standard: {
          might: { score: 42, modifier: -1 },
          will: { score: 67, savingThrow: 2 },
          unknown: { score: 99 },
        },
      },
    };
    expect(
      creatureAttributesForEditor(payload, [
        { key: "aow:attribute-might" },
        { key: "aow:attribute-wisdom" },
      ]),
    ).toEqual({ "aow:attribute-might": 42, "aow:attribute-wisdom": 67 });
    expect(payload.attributes.standard.will).toEqual({
      score: 67,
      savingThrow: 2,
    });
    expect(creatureAttributesForEditor(payload, [])).toEqual({});
  });

  it("preserves canonical custom Attribute values and loads flat legacy scores", () => {
    expect(
      creatureAttributesForEditor(
        { components: { attributes: { "custom:luck": 12 } } },
        [],
      ),
    ).toEqual({ "custom:luck": 12 });
    expect(
      creatureAttributesForEditor({ attributes: { might: 42 } }, [
        { key: "aow:attribute-might" },
      ]),
    ).toEqual({ "aow:attribute-might": 42 });
  });

  it("resolves legacy armor slots and family against the adopted Model", () => {
    for (const slot of ["arms", "chest", "feet", "hands", "head", "legs"]) {
      const key = `aow:equipment-slot-${slot}`;
      expect(adoptedLegacyModelKey(slot, "equipment-slot", [{ key }])).toBe(
        key,
      );
      expect(adoptedLegacyModelKey(key, "equipment-slot", [{ key }])).toBe(key);
    }
    expect(
      adoptedLegacyModelKey("armor", "item-family", [
        { key: "aow:item-family-armor" },
      ]),
    ).toBe("aow:item-family-armor");
  });

  it("preserves unknown and custom Model values instead of inventing adopted keys", () => {
    expect(adoptedLegacyModelKey("hands", "equipment-slot", [])).toBe("hands");
    expect(adoptedLegacyModelKey("custom:hands", "equipment-slot", [])).toBe(
      "custom:hands",
    );
  });

  it("treats an unknown requested detail as not found instead of create", () => {
    expect(requestedDraftRecordMissing(true, "missing", undefined)).toBe(true);
    expect(requestedDraftRecordMissing(true, undefined, undefined)).toBe(false);
    expect(
      requestedDraftRecordMissing(
        true,
        "known",
        record("locations", "known", {}),
      ),
    ).toBe(false);
  });

  it("binds proposal apply to its originating draft revision", () => {
    expect(worldDraftMutationRevision(9, true, 7)).toBe(7);
    expect(worldDraftMutationRevision(9, false, 7)).toBe(9);
  });

  it("clears the selected Item file from the saved editor baseline", () => {
    expect(
      JSON.parse(
        savedWorldRecordEditorSnapshot(
          { name: "Key", itemImageFileName: "key.png" },
          "items",
        ),
      ),
    ).toEqual({ name: "Key", itemImageFileName: "" });
  });
  it("requires an explicit new Creature embodiment policy", () => {
    expect(creatureEmbodimentPolicyForSave(undefined, "", "")).toBeUndefined();
    expect(
      creatureEmbodimentPolicyForSave(undefined, "one-per-instance", ""),
    ).toEqual({
      strategy: "one-per-instance",
      maximumPerCampaignInstance: 1,
    });
  });

  it("preserves extensions and supports a repeatable Creature maximum", () => {
    const existing = {
      strategy: "story:swarm",
      extensions: { "story:label": "Swarm" },
    };
    expect(
      creatureEmbodimentPolicyForSave(existing, "preserve-extension", ""),
    ).toEqual(existing);
    expect(
      creatureEmbodimentPolicyForSave(existing, "one-per-realization", "4"),
    ).toEqual({
      strategy: "one-per-realization",
      maximumPerCampaignInstance: 4,
      extensions: { "story:label": "Swarm" },
    });
  });

  it("preserves only validated Campaign return context", () => {
    const suffix = campaignReturnSuffix(
      "/campaigns/definitions/bells/plots",
      "Bells Beneath the Flood",
      "?quickStart=review-campaign-definition",
    );
    expect(campaignReturnContext(suffix)).toEqual({
      href: "/campaigns/definitions/bells/plots",
      label: "Bells Beneath the Flood",
    });
    expect(worldWorkspaceSuffix(suffix)).toContain("quickStart=");
    expect(
      campaignReturnContext(
        "?campaignReturnTo=https%3A%2F%2Fevil.example&campaignReturnLabel=Unsafe",
      ),
    ).toBeUndefined();
  });
  it("keeps resource-qualified identities distinct", () => {
    expect(recordKey(record("locations", "same", { name: "Vale" }))).not.toBe(
      recordKey(record("creatures", "same", { name: "Vale" })),
    );
    expect(
      upsertDraftRecord(
        [record("locations", "same", { name: "Vale" })],
        record("creatures", "same", { name: "Dragon" }),
      ),
    ).toHaveLength(2);
  });

  it("uses nested Definition identity for human-facing labels", () => {
    const skill = record("definitions", "opaque-skill-id", {
      kind: "skill",
      identity: {
        name: "Courtly Grace",
        description: "Navigating a formal court.",
      },
    });
    expect(recordName(skill, "Unnamed Skill")).toBe("Courtly Grace");
    expect(recordDescription(skill)).toBe("Navigating a formal court.");
  });

  it("lets the server seed a valid new World baseline", () => {
    expect(worldCreationInput("  Ash Vale  ", "  A storm coast  ")).toEqual({
      name: "Ash Vale",
      description: "A storm coast",
    });
    expect(worldCreationInput("Ash Vale", "")).not.toHaveProperty("content");
    expect(worldCreationInput("Ash Vale", "")).not.toHaveProperty("records");
  });

  it("indexes canonical root, child, and Definition records in one draft save shape", () => {
    const empty = {
      storageRevision: 1,
      revisionName: "Draft",
      content: {
        rootLocationId: "",
        locationIds: [],
        definitionIds: [],
        schemaDefinitionIds: [],
        modelSchemaReleaseIds: [],
      },
      records: [],
    } satisfies WorldDefinitionDraft;
    const root = record("locations", "root", {
      name: "Ash Vale",
      kind: "world",
      placement: { kind: "root" },
    });
    const child = record("locations", "child", {
      name: "Glass Harbor",
      kind: "city",
      placement: { kind: "within-parent", parentLocationId: "root" },
    });
    const creature = record("definitions", "dragon", {
      name: "Old Ember",
      kind: "creature",
    });
    const complete = draftWithIndexedRecord(
      draftWithIndexedRecord(draftWithIndexedRecord(empty, root), child),
      creature,
    );
    expect(complete.content).toMatchObject({
      rootLocationId: "root",
      locationIds: ["root", "child"],
      definitionIds: ["dragon"],
    });
    expect(
      hierarchyRows(complete.records).map(({ name, depth }) => ({
        name,
        depth,
      })),
    ).toEqual([
      { name: "Ash Vale", depth: 0 },
      { name: "Glass Harbor", depth: 1 },
    ]);
    expect(
      recordsForLibrary(complete.records, "creatures").map(
        ({ sourceId }) => sourceId,
      ),
    ).toEqual(["dragon"]);
  });

  it("indexes and removes stable World placements through authoritative membership", () => {
    const draft = {
      storageRevision: 1,
      revisionName: "Draft",
      content: { worldPlacementDefinitionIds: [] },
      records: [],
    } satisfies WorldDefinitionDraft;
    const placement = record("world-placements", "placement-a", {
      id: "placement-a",
      locationId: "harbor",
      source: { kind: "world-creature", creatureId: "dragon" },
      name: "Old Ember at the quay",
    });
    const indexed = draftWithIndexedRecord(draft, placement);
    expect(indexed.content.worldPlacementDefinitionIds).toEqual([
      "placement-a",
    ]);
    expect(worldPlacementRecordsForLocation(indexed.records, "harbor")).toEqual(
      [placement],
    );
    expect(worldPlacementSourceId(placement)).toBe("dragon");
    const removed = draftWithoutWorldPlacement(indexed, "placement-a");
    expect(removed.content.worldPlacementDefinitionIds).toEqual([]);
    expect(removed.records).toEqual([]);
  });

  it("projects only Item Definitions into the Item Compendium", () => {
    const records = [
      record("definitions", "definition-1", {
        kind: "item",
        name: "Key Definition",
      }),
      record("items", "instance-1", { name: "Carried Key" }),
      record("definitions", "definition-2", {
        kind: "item",
        name: "Lens Definition",
      }),
    ];
    expect(
      recordsForLibrary(records, "items").map(({ sourceId }) => sourceId),
    ).toEqual(["definition-1", "definition-2"]);
    expect(
      requestedDraftRecordMissing(
        true,
        "instance-1",
        recordsForLibrary(records, "items").find(
          ({ sourceId }) => sourceId === "instance-1",
        ),
      ),
    ).toBe(true);
    expect(records).toContainEqual(
      expect.objectContaining({
        resourceType: "items",
        sourceId: "instance-1",
      }),
    );
  });

  it("identifies registered World placement sources without coercing them", () => {
    const placement = record("world-placements", "placement-registered", {
      source: { kind: "registered-content", definitionId: "weather-front" },
    });
    expect(worldPlacementSourceKind(placement)).toBe("registered-content");
    expect(worldPlacementSourceId(placement)).toBe("weather-front");
    expect(worldPlacementSourceIsEditable(placement)).toBe(false);
    expect(placement.payload).toEqual({
      source: { kind: "registered-content", definitionId: "weather-front" },
    });
  });

  it("builds a stable location hierarchy with human labels", () => {
    const rows = hierarchyRows([
      record("locations", "child", { name: "Glass Harbor", parentId: "root" }),
      record("locations", "root", { name: "The Shattered Coast" }),
      record("locations", "orphan", {
        name: "Lost Observatory",
        parentId: "missing",
      }),
    ]);
    expect(
      rows.map(({ name, depth, issue }) => ({ name, depth, issue })),
    ).toEqual([
      { name: "The Shattered Coast", depth: 0, issue: undefined },
      { name: "Glass Harbor", depth: 1, issue: undefined },
      { name: "Lost Observatory", depth: 0, issue: "Parent unavailable" },
    ]);
  });

  it("does not offer a Location or its descendants as its own parent", () => {
    const locations = [
      record("locations", "root", { name: "Coast" }),
      record("locations", "child", { name: "Harbor", parentId: "root" }),
      record("locations", "grandchild", { name: "Docks", parentId: "child" }),
      record("locations", "other", { name: "Highlands" }),
    ];
    const before = structuredClone(locations);
    expect(
      locationParentOptions(locations, "root").map((option) => option.sourceId),
    ).toEqual(["other"]);
    expect(locations).toEqual(before);
    expect(locationParentOptions(locations, "root")[0]).toBe(locations[3]);
  });

  it("renders effective open model options supplied by the server projection", () => {
    expect(
      effectiveModelOptions({
        attributes: [
          { key: "wisdom", name: "Wisdom" },
          { key: "homebrew:likeable", name: "Likeable" },
        ],
        equipmentSlots: [
          { key: "main-hand", name: "Main hand" },
          { key: "homebrew:wings", name: "Wings" },
        ],
        itemFamilies: [],
      }),
    ).toEqual({
      attributes: ["Wisdom", "Likeable"],
      equipmentSlots: ["Main hand", "Wings"],
    });
  });

  it("projects immutable registry elements to human labels", () => {
    const element = {
      id: "opaque-element-id",
      registryId: "opaque-registry-id",
      key: "homebrew:likeable",
      kind: "vocabulary-option",
      semanticRole: "aow:attribute",
      status: "active",
      currentRevision: {
        identity: { id: "opaque-revision-id", revisionNumber: 1 },
        presentation: { label: "Likeable" },
        payload: {},
      },
    };
    const vocabulary = {
      ...element,
      id: "opaque-vocabulary-id",
      key: "aow:attributes",
      kind: "vocabulary",
    };
    expect(
      projectEffectiveModels({
        releases: [
          {
            id: "opaque-release",
            registryId: "opaque-registry-id",
            name: "Custom 1",
            registryName: "Custom Models",
            revisionNumber: 1,
            contentHash: "opaque-hash",
          },
        ],
        attributes: [vocabulary, element],
        equipmentSlots: [],
        professionRanks: [],
        elements: [vocabulary, element],
      }),
    ).toEqual({
      attributes: [
        {
          key: "homebrew:likeable",
          kind: "vocabulary-option",
          name: "Likeable",
          description: undefined,
          elementId: "opaque-element-id",
          registryId: "opaque-registry-id",
          semanticRole: "aow:attribute",
          sourceReleaseId: undefined,
          payload: {},
          presentation: { label: "Likeable" },
          revisionId: "opaque-revision-id",
        },
      ],
      equipmentSlots: [],
      professionRanks: [],
      itemFamilies: [],
      elements: [
        {
          key: "aow:attributes",
          kind: "vocabulary",
          name: "Likeable",
          description: undefined,
          elementId: "opaque-vocabulary-id",
          registryId: "opaque-registry-id",
          semanticRole: "aow:attribute",
          sourceReleaseId: undefined,
          payload: {},
          presentation: { label: "Likeable" },
          revisionId: "opaque-revision-id",
        },
        {
          key: "homebrew:likeable",
          kind: "vocabulary-option",
          name: "Likeable",
          description: undefined,
          elementId: "opaque-element-id",
          registryId: "opaque-registry-id",
          semanticRole: "aow:attribute",
          sourceReleaseId: undefined,
          payload: {},
          presentation: { label: "Likeable" },
          revisionId: "opaque-revision-id",
        },
      ],
      releases: [
        {
          id: "opaque-release",
          registryId: "opaque-registry-id",
          name: "Custom 1",
          registryName: "Custom Models",
          revisionNumber: 1,
        },
      ],
    });
  });

  it("makes newly adopted Attribute and Equipment Slot options available to controlled editors", () => {
    const make = (key: string, label: string, semanticRole: string) => ({
      id: `opaque-${key}`,
      registryId: "opaque-custom-registry",
      key,
      kind: "vocabulary-option",
      semanticRole,
      status: "active",
      sourceReleaseId: "opaque-custom-release",
      currentRevision: {
        presentation: { label },
        payload: {
          kind: "vocabulary-option",
          vocabularyId: "opaque-vocabulary",
        },
      },
    });
    const likeable = make(
      "custom:attribute-likeable",
      "Likeable",
      "aow:attribute",
    );
    const wings = make(
      "custom:equipment-slot-wings",
      "Wings",
      "aow:equipment-slot",
    );
    const initiate = make(
      "custom:profession-rank-initiate",
      "Initiate",
      "aow:profession-rank",
    );
    const projected = projectEffectiveModels({
      releases: [],
      attributes: [likeable],
      equipmentSlots: [wings],
      professionRanks: [initiate],
      elements: [likeable, wings, initiate],
    });
    expect(effectiveModelOptions(projected)).toEqual({
      attributes: ["Likeable"],
      equipmentSlots: ["Wings"],
    });
    expect(projected.professionRanks?.map(({ name }) => name)).toEqual([
      "Initiate",
    ]);
  });

  it("replaces an exact selected release when adopting an immutable extension", () => {
    const roots = [
      { id: "custom-1", registryId: "custom-registry" },
      { id: "unrelated", registryId: "other-registry" },
    ];
    expect(
      contentAdoptingRegistryRelease(
        { modelSchemaReleaseIds: ["custom-1", "unrelated"] },
        roots,
        {
          id: "custom-2",
          registryId: "custom-registry",
          predecessorRevisionId: "custom-1",
          dependencyReleaseIds: ["core"],
        },
      ),
    ).toEqual({ modelSchemaReleaseIds: ["custom-2", "unrelated"] });
    expect(
      contentAdoptingRegistryRelease(
        { modelSchemaReleaseIds: ["custom-1", "unrelated"] },
        roots,
        {
          id: "custom-2",
          registryId: "custom-registry",
          predecessorRevisionId: "wrong",
          dependencyReleaseIds: ["core"],
        },
      ),
    ).toBeUndefined();
    expect(
      contentAdoptingRegistryRelease(
        { modelSchemaReleaseIds: ["core", "unrelated"] },
        [
          { id: "core", registryId: "core-registry" },
          { id: "unrelated", registryId: "other-registry" },
        ],
        {
          id: "custom-1",
          registryId: "custom-registry",
          dependencyReleaseIds: ["core"],
        },
      ),
    ).toEqual({ modelSchemaReleaseIds: ["custom-1", "unrelated"] });
    expect(
      contentAdoptingRegistryRelease(
        { modelSchemaReleaseIds: ["unrelated"] },
        [{ id: "unrelated", registryId: "other-registry" }],
        {
          id: "custom-1",
          registryId: "custom-registry",
          dependencyReleaseIds: ["core"],
        },
      ),
    ).toEqual({ modelSchemaReleaseIds: ["unrelated", "custom-1"] });
    expect(modelExtensionKey("attributes", "Likeable")).toBe(
      "custom:attribute-likeable",
    );
    expect(modelExtensionKey("equipment-slots", "Wings")).toBe(
      "custom:equipment-slot-wings",
    );
    expect(modelExtensionKey("profession-ranks", "Initiate")).toBe(
      "custom:profession-rank-initiate",
    );
  });

  it("makes draft and stale context explicit", () => {
    expect(
      draftContextLabel({
        storageRevision: 4,
        revisionName: "Storm front",
        baseRevisionNumber: 2,
        status: "current",
        content: {},
        records: [],
      } satisfies WorldDefinitionDraft),
    ).toBe("Draft based on revision 2");
    expect(
      draftContextLabel({
        storageRevision: 4,
        revisionName: "Storm front",
        baseRevisionNumber: 2,
        status: "stale",
        content: {},
        records: [],
      } satisfies WorldDefinitionDraft),
    ).toBe("Draft needs rebase");
  });

  it("preserves the effective model projection across a draft save", () => {
    const previous = {
      storageRevision: 1,
      revisionName: "Draft",
      content: {},
      records: [],
      effectiveModels: {
        attributes: [{ key: "homebrew:likeable", name: "Likeable" }],
        equipmentSlots: [],
        itemFamilies: [],
      },
    } satisfies WorldDefinitionDraft;
    const saved = {
      storageRevision: 2,
      revisionName: "Draft",
      content: {},
      records: [],
    } satisfies WorldDefinitionDraft;
    expect(
      mergeSavedDraft(saved, previous).effectiveModels?.attributes.map(
        ({ name }) => name,
      ),
    ).toEqual(["Likeable"]);
  });

  it("migrates every governed Definition conformance with an adopted root", () => {
    const draft = {
      storageRevision: 3,
      revisionName: "Draft",
      content: { modelSchemaReleaseIds: ["core"] },
      records: [
        record("definitions", "creature", {
          kind: "creature",
          conformance: {
            modelSchemaReleaseIds: ["core"],
            conceptId: "creature-concept",
          },
        }),
        record("definitions", "item", {
          kind: "item",
          conformance: {
            modelSchemaReleaseIds: ["core"],
            conceptId: "item-concept",
          },
        }),
        record("locations", "root", { placement: { kind: "root" } }),
        record("definitions", "skill", {
          kind: "skill",
          conformance: {
            modelSchemaReleaseIds: ["core"],
            conceptId: "skill-concept",
          },
        }),
      ],
    } satisfies WorldDefinitionDraft;
    const adopted = draftAdoptingRegistryRelease(
      draft,
      [{ id: "core", registryId: "core-registry" }],
      {
        id: "custom-1",
        registryId: "custom-registry",
        dependencyReleaseIds: ["core"],
      },
    );
    expect(adopted?.content.modelSchemaReleaseIds).toEqual(["custom-1"]);
    expect(
      adopted?.records.slice(0, 2).map(
        (value) =>
          (
            value.payload as {
              conformance: { modelSchemaReleaseIds: string[] };
            }
          ).conformance.modelSchemaReleaseIds,
      ),
    ).toEqual([["custom-1"], ["custom-1"]]);
    expect(adopted?.records[2]).toEqual(draft.records[2]);
    expect(
      (
        adopted?.records[3].payload as {
          conformance: { modelSchemaReleaseIds: string[] };
        }
      ).conformance.modelSchemaReleaseIds,
    ).toEqual(["custom-1"]);
  });

  it("recovers an unadopted direct successor without extending the Registry again", () => {
    const recoverable = recoverableRegistryRelease(
      { modelSchemaReleaseIds: ["custom-1", "other"] },
      [
        { id: "custom-1", registryId: "custom-registry" },
        { id: "other", registryId: "other-registry" },
      ],
      "custom-registry",
      [
        {
          identity: {
            id: "custom-3",
            lineageId: "custom-registry",
            predecessorRevisionId: "custom-2",
          },
          name: "Later release",
        },
        {
          identity: {
            id: "custom-2",
            lineageId: "custom-registry",
            predecessorRevisionId: "custom-1",
          },
          name: "Add Likeable",
        },
      ],
    );
    expect(recoverable?.name).toBe("Add Likeable");
  });

  it("recovers an initial Registry release only through an exact selected dependency", () => {
    expect(
      recoverableRegistryRelease(
        { modelSchemaReleaseIds: ["core", "other"] },
        [
          { id: "core", registryId: "core-registry" },
          { id: "other", registryId: "other-registry" },
        ],
        "custom-registry",
        [
          {
            identity: { id: "custom-1", lineageId: "custom-registry" },
            name: "Add Wings",
            dependencies: [{ releaseId: "core" }],
          },
        ],
      )?.name,
    ).toBe("Add Wings");
  });

  it("limits post-save navigation allowance to the create replacement route", () => {
    expect(savedNavigationAllowanceForRoute(undefined, undefined, true)).toBe(
      true,
    );
    expect(savedNavigationAllowanceForRoute(undefined, "created", true)).toBe(
      false,
    );
    expect(savedNavigationAllowanceForRoute("created", "created", false)).toBe(
      false,
    );
  });

  it("emits exact model roots and the governed concept for Definitions", () => {
    const draft = {
      storageRevision: 1,
      revisionName: "Draft",
      content: { modelSchemaReleaseIds: ["selected-release"] },
      records: [],
      effectiveModels: {
        attributes: [],
        equipmentSlots: [],
        itemFamilies: [],
        elements: [
          {
            key: "aow:creature",
            name: "Creature",
            semanticRole: "aow:creature",
            elementId: "creature-concept",
          },
          {
            key: "aow:profession",
            name: "Profession",
            semanticRole: "aow:profession",
            elementId: "profession-concept",
          },
        ],
      },
    } satisfies WorldDefinitionDraft;
    expect(definitionConformance(draft, "creature")).toEqual({
      modelSchemaReleaseIds: ["selected-release"],
      conceptId: "creature-concept",
    });
    expect(definitionConformance(draft, "item")).toBeUndefined();
    expect(definitionConformance(draft, "profession")).toEqual({
      modelSchemaReleaseIds: ["selected-release"],
      conceptId: "profession-concept",
    });
  });

  it("derives numeric Attribute controls from registered metadata", () => {
    expect(
      attributeNumberConfig({
        key: "custom:attribute-likeable",
        name: "Likeable",
        payload: {
          valueMetadata: {
            "aow:minimum": -10,
            "aow:maximum": 20,
            "aow:default": 7,
          },
        },
      }),
    ).toEqual({ minimum: -10, maximum: 20, defaultValue: 7 });
  });

  it("describes draft-first Worlds without claiming a published baseline", () => {
    expect(
      worldDraftLabel({
        id: "world",
        name: "Ash Vale",
        status: "active",
        updatedAt: "2026-01-01",
        draft: {
          revisionName: "Initial draft",
          storageRevision: 1,
          validationStatus: "unvalidated",
          isCurrentBase: true,
          hasUnpublishedChanges: true,
        },
      }),
    ).toBe("Unpublished changes need review");
  });

  it("describes the published base for starting a draft with human context", () => {
    expect(
      worldDraftStartLabel({ revisionNumber: 4, name: "Storm season" }),
    ).toBe("Revision 4 · Storm season");
  });

  it("filters by human text and archive state", () => {
    const worlds = [
      {
        id: "one",
        name: "Ash Vale",
        status: "active",
        updatedAt: "2026-01-01",
      },
      {
        id: "two",
        name: "Blue March",
        description: "Frozen coast",
        status: "archived",
        updatedAt: "2026-01-01",
      },
    ];
    expect(
      filterWorlds(worlds, "frozen", "all").map(({ name }) => name),
    ).toEqual(["Blue March"]);
    expect(filterWorlds(worlds, "", "active").map(({ name }) => name)).toEqual([
      "Ash Vale",
    ]);
  });
});
