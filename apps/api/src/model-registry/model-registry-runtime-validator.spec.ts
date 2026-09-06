import { BadRequestException } from "@nestjs/common";
import {
  assertModelElementRuntimeShape,
  assertModelMigrationMappingsRuntimeShape,
} from "./model-registry-runtime-validator";

const outer = {
  key: "custom:element",
  semanticRole: "custom:role",
  applicability: { kind: "global" },
  presentation: {
    label: "Element",
    layout: { section: "Main", span: 2, anchor: { x: 1, y: 2 } },
  },
  dependencies: [
    {
      kind: "requires",
      targetElementId: "element-required",
      rationale: "Needed",
    },
  ],
  source: {
    namespace: "custom",
    edition: "first",
    book: "Guide",
    page: 2,
    url: "https://example.invalid",
    license: "private",
  },
};

describe("assertModelElementRuntimeShape", () => {
  it.each([
    [
      "concept",
      {
        kind: "concept",
        parentConceptId: "concept-parent",
        capabilities: ["custom:capability"],
      },
    ],
    [
      "field",
      {
        kind: "field",
        ownerConceptId: "concept-owner",
        storageKey: "custom:score",
        valueType: {
          kind: "list",
          item: { kind: "integer", minimum: 0, maximum: 100 },
        },
        cardinality: { minimum: 0, maximum: 4, unique: true },
        defaultValue: { kind: "literal", value: [1] },
        computedValue: {
          language: "cel",
          profile: "aow:model-expression/v1",
          source: "[1]",
          resultType: { kind: "list", item: { kind: "integer" } },
        },
        applicability: {
          language: "cel",
          profile: "aow:model-expression/v1",
          source: "true",
          resultType: { kind: "boolean" },
        },
        constraints: {
          allowedValues: [[1]],
          validationExpressions: [
            {
              language: "cel",
              profile: "aow:model-expression/v1",
              source: "true",
              resultType: { kind: "boolean" },
            },
          ],
        },
      },
    ],
    [
      "relationship",
      {
        kind: "relationship",
        sourceConceptId: "concept-source",
        targetConceptId: "concept-target",
        cardinality: { minimum: 1, maximum: 1 },
        inverseLabel: "Owner",
        referencePolicy: "same-release",
      },
    ],
    ["vocabulary", { kind: "vocabulary", ordered: false }],
    [
      "vocabulary-option",
      {
        kind: "vocabulary-option",
        vocabularyId: "vocabulary-1",
        parentOptionId: "option-parent",
        capabilities: ["custom:choice"],
        valueMetadata: { "custom:weight": 1 },
      },
    ],
  ])("accepts a complete %s AST", (kind, payload) => {
    expect(() =>
      assertModelElementRuntimeShape({ ...outer, kind, payload }),
    ).not.toThrow();
  });

  it.each([
    [
      "non-boolean vocabulary ordering",
      {
        ...outer,
        kind: "vocabulary",
        payload: { kind: "vocabulary", ordered: "no" },
      },
    ],
    [
      "nested list type",
      {
        ...outer,
        kind: "field",
        payload: {
          kind: "field",
          ownerConceptId: "owner",
          storageKey: "custom:value",
          valueType: {
            kind: "list",
            item: { kind: "list", item: { kind: "string" } },
          },
          cardinality: { minimum: 0 },
        },
      },
    ],
    [
      "reversed cardinality",
      {
        ...outer,
        kind: "relationship",
        payload: {
          kind: "relationship",
          sourceConceptId: "source",
          targetConceptId: "target",
          cardinality: { minimum: 2, maximum: 1 },
          referencePolicy: "same-release",
        },
      },
    ],
    [
      "unsupported expression",
      {
        ...outer,
        kind: "field",
        payload: {
          kind: "field",
          ownerConceptId: "owner",
          storageKey: "custom:value",
          valueType: { kind: "number" },
          cardinality: { minimum: 0 },
          computedValue: {
            language: "javascript",
            profile: "unsafe",
            source: "1",
            resultType: { kind: "number" },
          },
        },
      },
    ],
    [
      "invalid presentation",
      {
        ...outer,
        kind: "concept",
        payload: { kind: "concept" },
        presentation: { label: 42, layout: { span: 5 } },
      },
    ],
    [
      "invalid applicability",
      {
        ...outer,
        kind: "concept",
        payload: { kind: "concept" },
        applicability: { kind: "world" },
      },
    ],
    [
      "invalid dependency",
      {
        ...outer,
        kind: "concept",
        payload: { kind: "concept" },
        dependencies: [{ kind: "optional", targetElementId: "target" }],
      },
    ],
    [
      "invalid source",
      {
        ...outer,
        kind: "concept",
        payload: { kind: "concept" },
        source: { namespace: "custom", edition: 1 },
      },
    ],
  ])("rejects %s with a neutral response", (_label, value) => {
    expect(() => assertModelElementRuntimeShape(value)).toThrow(
      BadRequestException,
    );
    try {
      assertModelElementRuntimeShape(value);
    } catch (error) {
      expect(error).toMatchObject({
        response: { message: "The Model Element shape is invalid." },
      });
    }
  });
});

describe("assertModelMigrationMappingsRuntimeShape", () => {
  it("accepts retirement, replacement, and typed backfill mappings", () => {
    expect(() =>
      assertModelMigrationMappingsRuntimeShape([
        { sourceElementId: "source-retired" },
        {
          sourceElementId: "source-replaced",
          targetElementId: "target-replacement",
        },
        {
          targetElementId: "target-required",
          backfill: { kind: "literal", value: 1 },
        },
      ]),
    ).not.toThrow();
  });

  it.each([
    ["an empty mapping", [{}]],
    ["an invalid backfill", [{ targetElementId: "target", backfill: {} }]],
    ["unbounded content", [{ sourceElementId: "source", extra: undefined }]],
  ])("rejects %s", (_label, mappings) => {
    expect(() => assertModelMigrationMappingsRuntimeShape(mappings)).toThrow(
      BadRequestException,
    );
  });
});
