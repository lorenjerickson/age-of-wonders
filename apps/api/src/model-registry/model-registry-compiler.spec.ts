import type {
  ModelElementId,
  ModelElementLineage,
  ModelElementPayload,
  ModelElementRevision,
  ModelElementRevisionId,
  ModelMigrationPlan,
  ModelMigrationPlanId,
  ModelRegistry,
  ModelRegistryId,
  ModelSchemaRelease,
  ModelSchemaReleaseId,
  NamespacedKey,
  UserId,
  WorldDefinitionId,
} from "@aow/common";
import {
  CORE_MODEL_ELEMENT_IDS,
  CORE_MODEL_LEGACY_MAPPINGS,
  createEditableCoreModelSeed,
} from "./editable-core-model-seed";
import {
  compileModelSchemaRelease,
  modelElementRevisionContentHash,
  modelSchemaReleaseContentHash,
  validateModelSchemaCompilation,
  validateModelMigrationPlan,
} from "./model-registry-compiler";

describe("model registry compiler", () => {
  it("compiles the editable core release and keeps legacy Will migration explicit", () => {
    const seed = createEditableCoreModelSeed();
    const compiled = compileModelSchemaRelease(seed);
    const keys = compiled.elements.map((element) => element.lineage.key);

    expect(keys).toContain("aow:attribute-wisdom");
    expect(keys).not.toContain("aow:attribute-will");
    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual(
      expect.arrayContaining([
        "aow:equipment-slot-main-hand",
        "aow:movement-mode-fly",
        "aow:item-family-hazard",
        "aow:profession-rank-grand-master",
        "aow:art-role-side-on-token",
      ]),
    );
    const willMapping = CORE_MODEL_LEGACY_MAPPINGS.find(
      (mapping) => mapping.legacyValue === "will",
    );
    expect(willMapping?.targetElementId).toContain("attribute-wisdom");
  });

  it("lets a GM extend open semantic roles with Likeable and Wings", () => {
    const core = createEditableCoreModelSeed();
    const dependency = compileModelSchemaRelease(core);
    const extension = createGmExtension();
    const compiled = compileModelSchemaRelease({
      ...extension,
      dependencies: [dependency],
    });

    expect(compiled.elements.map((element) => element.lineage.key)).toEqual(
      expect.arrayContaining([
        "loren:attribute-likeable",
        "loren:equipment-slot-wings",
      ]),
    );
  });

  it("is deterministic when equivalent inputs arrive in another order", () => {
    const seed = createEditableCoreModelSeed();
    const forward = compileModelSchemaRelease(seed);
    const reversed = compileModelSchemaRelease({
      ...seed,
      lineages: [...seed.lineages].reverse(),
      revisions: [...seed.revisions].reverse(),
      release: {
        ...seed.release,
        elementSelections: [...seed.release.elementSelections].reverse(),
      },
    });

    expect(reversed).toEqual(forward);
  });

  it("blocks tampered revisions and unresolved references without executing CEL", () => {
    const extension = createGmExtension();
    const firstRevision = extension.revisions[0];
    if (!firstRevision) throw new Error("The fixture requires a revision.");
    const tampered = {
      ...firstRevision,
      identity: {
        ...firstRevision.identity,
        contentHash: "tampered",
      },
      payload: {
        kind: "field" as const,
        ownerConceptId: "missing:concept" as ModelElementId,
        storageKey: "loren:dangerous",
        valueType: { kind: "boolean" as const },
        cardinality: { minimum: 0, maximum: 1 },
        applicability: {
          language: "cel" as const,
          profile: "aow:model-expression/v1" as const,
          source: "sideEffect()",
          resultType: { kind: "boolean" as const },
        },
      },
    } satisfies ModelElementRevision;
    const validation = validateModelSchemaCompilation({
      ...extension,
      revisions: [tampered, ...extension.revisions.slice(1)],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "element-content-hash-mismatch",
        "element-kind-mismatch",
        "element-reference-missing",
        "release-dependency-missing",
      ]),
    );
    expect(validation.issues).toEqual(
      [...validation.issues].sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          left.subject.localeCompare(right.subject) ||
          left.detail.localeCompare(right.detail),
      ),
    );
  });

  it("requires an explicit typed backfill for a newly required field", () => {
    const seed = createEditableCoreModelSeed();
    const source = compileModelSchemaRelease(seed);
    const successor = createRequiredFieldSuccessor(seed);
    const target = compileModelSchemaRelease(successor);
    const provisionalPlan: ModelMigrationPlan = {
      id: "migration:core:1-2" as ModelMigrationPlanId,
      sourceReleaseId: source.releaseId,
      targetReleaseId: target.releaseId,
      mappings: [],
      createdByUserId: "user:gm" as UserId,
      createdAt: "2026-09-05T02:00:00.000Z",
    };

    expect(
      validateModelMigrationPlan(provisionalPlan, source, target).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("migration-required-field-backfill-missing");

    const withBackfill: ModelMigrationPlan = {
      ...provisionalPlan,
      mappings: [
        {
          targetElementId: successor.requiredFieldId,
          backfill: { kind: "literal", value: false },
        },
      ],
    };
    expect(validateModelMigrationPlan(withBackfill, source, target)).toEqual({
      valid: true,
      issues: [],
    });
  });
});

function createRequiredFieldSuccessor(
  seed: ReturnType<typeof createEditableCoreModelSeed>,
) {
  const requiredFieldId =
    "aow:model-element:field-creature-visible" as ModelElementId;
  const requiredFieldRevisionId =
    "aow:model-element-revision:field-creature-visible:1" as ModelElementRevisionId;
  const publishedAt = "2026-09-05T02:00:00.000Z";
  const lineage: ModelElementLineage = {
    id: requiredFieldId,
    registryId: seed.registry.identity.id,
    key: "aow:creature-visible",
    kind: "field",
    semanticRole: "aow:visibility",
    applicability: { kind: "global" },
    status: "active",
    currentRevisionId: requiredFieldRevisionId,
  };
  const provisionalRevision: ModelElementRevision = {
    identity: {
      id: requiredFieldRevisionId,
      lineageId: requiredFieldId,
      revisionNumber: 1,
      publishedAt,
      contentHash: "",
    },
    payload: {
      kind: "field",
      ownerConceptId: CORE_MODEL_ELEMENT_IDS.creatureConcept,
      storageKey: "aow:visible",
      valueType: { kind: "boolean" },
      cardinality: { minimum: 1, maximum: 1 },
    },
    presentation: { label: "Visible" },
  };
  const revision: ModelElementRevision = {
    ...provisionalRevision,
    identity: {
      ...provisionalRevision.identity,
      contentHash: modelElementRevisionContentHash(provisionalRevision),
    },
  };
  const provisionalRelease: ModelSchemaRelease = {
    identity: {
      id: "aow:model-schema-release:core:2" as ModelSchemaReleaseId,
      lineageId: seed.registry.identity.id,
      revisionNumber: 2,
      predecessorRevisionId: seed.release.identity.id,
      publishedAt,
      contentHash: "",
    },
    name: "Editable Core Model 2",
    elementSelections: [
      ...seed.release.elementSelections,
      {
        elementId: requiredFieldId,
        elementRevisionId: requiredFieldRevisionId,
      },
    ],
  };
  const release: ModelSchemaRelease = {
    ...provisionalRelease,
    identity: {
      ...provisionalRelease.identity,
      contentHash: modelSchemaReleaseContentHash(provisionalRelease),
    },
  };
  return {
    registry: seed.registry,
    lineages: [...seed.lineages, lineage],
    revisions: [...seed.revisions, revision],
    release,
    requiredFieldId,
  };
}

function createGmExtension(): {
  registry: ModelRegistry;
  lineages: ModelElementLineage[];
  revisions: ModelElementRevision[];
  release: ModelSchemaRelease;
} {
  const ownerUserId = "user:loren" as UserId;
  const registryId = "registry:loren" as ModelRegistryId;
  const releaseId = "release:loren:1" as ModelSchemaReleaseId;
  const publishedAt = "2026-09-05T01:00:00.000Z";
  const registry: ModelRegistry = {
    identity: {
      id: registryId,
      version: { revision: 1, updatedAt: publishedAt },
    },
    key: "loren:model",
    name: "Loren's Model",
    provenance: { kind: "gm", namespace: "loren", ownerUserId },
  };
  const specs: readonly {
    key: NamespacedKey;
    semanticRole: NamespacedKey;
    payload: ModelElementPayload;
  }[] = [
    {
      key: "loren:attribute-likeable",
      semanticRole: "aow:attribute",
      payload: {
        kind: "vocabulary-option",
        vocabularyId: CORE_MODEL_ELEMENT_IDS.attributes,
        valueMetadata: {
          "aow:minimum": 0,
          "aow:maximum": 100,
          "aow:default": 50,
        },
      },
    },
    {
      key: "loren:equipment-slot-wings",
      semanticRole: "aow:equipment-slot",
      payload: {
        kind: "vocabulary-option",
        vocabularyId: CORE_MODEL_ELEMENT_IDS.equipmentSlots,
      },
    },
  ];
  const lineages = specs.map((spec) => {
    const suffix = spec.key.replace(":", "-");
    return {
      id: `element:${suffix}` as ModelElementId,
      registryId,
      key: spec.key,
      kind: spec.payload.kind,
      semanticRole: spec.semanticRole,
      applicability: {
        kind: "world" as const,
        worldDefinitionId: "world:example" as WorldDefinitionId,
      },
      status: "active" as const,
      currentRevisionId: `revision:${suffix}:1` as ModelElementRevisionId,
    };
  });
  const revisions = specs.map((spec, index) => {
    const lineage = lineages[index];
    if (!lineage) throw new Error("The fixture requires a lineage.");
    const provisional: ModelElementRevision = {
      identity: {
        id: lineage.currentRevisionId,
        lineageId: lineage.id,
        revisionNumber: 1,
        publishedAt,
        contentHash: "",
      },
      payload: spec.payload,
      presentation: {
        label: spec.key.endsWith("likeable") ? "Likeable" : "Wings",
      },
      authoredByUserId: ownerUserId,
    };
    return {
      ...provisional,
      identity: {
        ...provisional.identity,
        contentHash: modelElementRevisionContentHash(provisional),
      },
    };
  });
  const provisionalRelease: ModelSchemaRelease = {
    identity: {
      id: releaseId,
      lineageId: registryId,
      revisionNumber: 1,
      publishedAt,
      contentHash: "",
    },
    name: "Loren Model 1",
    elementSelections: lineages.map((lineage) => ({
      elementId: lineage.id,
      elementRevisionId: lineage.currentRevisionId,
    })),
    dependencies: [
      { releaseId: createEditableCoreModelSeed().release.identity.id },
    ],
    publishedByUserId: ownerUserId,
  };
  const release: ModelSchemaRelease = {
    ...provisionalRelease,
    identity: {
      ...provisionalRelease.identity,
      contentHash: modelSchemaReleaseContentHash(provisionalRelease),
    },
  };
  return { registry, lineages, revisions, release };
}
