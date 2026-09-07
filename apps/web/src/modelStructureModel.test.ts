import { describe, expect, it } from "vitest";
import {
  modelStructureKey,
  modelStructurePayload,
} from "./modelStructureModel";

describe("Model structure authoring", () => {
  it("builds namespaced keys for every open structural kind", () => {
    expect(modelStructureKey("concept", "Flying Creature")).toBe(
      "custom:concept-flying-creature",
    );
    expect(modelStructureKey("field", "Wing Span")).toBe(
      "custom:field-wing-span",
    );
    expect(modelStructureKey("relationship", "Native Habitat")).toBe(
      "custom:relationship-native-habitat",
    );
  });

  it("builds a list field without dropping advanced existing data", () => {
    expect(
      modelStructurePayload({
        kind: "field",
        existing: {
          computedValue: {
            kind: "expression",
            expression: {
              language: "cel",
              profile: "aow:model-expression/v1",
              source: "size * 2",
              resultType: { kind: "number" },
            },
          },
        },
        ownerConceptId: "concept-creature",
        storageKey: "custom:wing-span",
        atomicKind: "number",
        list: true,
        minimum: 0,
        maximum: 4,
        unique: true,
        defaultValue: 2,
      }),
    ).toMatchObject({
      kind: "field",
      ownerConceptId: "concept-creature",
      storageKey: "custom:wing-span",
      valueType: { kind: "list", item: { kind: "number" } },
      cardinality: { minimum: 0, maximum: 4, unique: true },
      defaultValue: { kind: "literal", value: 2 },
      computedValue: { kind: "expression" },
    });
  });

  it("builds explicit relationship ownership and reference policy", () => {
    expect(
      modelStructurePayload({
        kind: "relationship",
        sourceConceptId: "concept-creature",
        targetConceptId: "concept-location",
        minimum: 0,
        maximum: 1,
        inverseLabel: "Residents",
        referencePolicy: "captured-upstream",
      }),
    ).toEqual({
      kind: "relationship",
      sourceConceptId: "concept-creature",
      targetConceptId: "concept-location",
      cardinality: { minimum: 0, maximum: 1 },
      inverseLabel: "Residents",
      referencePolicy: "captured-upstream",
    });
  });
});
