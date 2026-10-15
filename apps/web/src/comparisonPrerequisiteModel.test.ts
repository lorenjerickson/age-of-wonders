import { describe, expect, it } from "vitest";
import {
  editableComparisonOperand,
  newComparisonOperand,
  protectedComparisonText,
  updateComparisonOperand,
} from "./comparisonPrerequisiteModel";
import { newActionPrerequisite } from "./itemActionPrerequisitesModel";

describe("comparison prerequisite authoring", () => {
  it("creates explicit equality operands without implied rules", () => {
    expect(newActionPrerequisite("compare")).toEqual({
      kind: "compare",
      operator: "eq",
      left: { kind: "constant", value: 0 },
      right: { kind: "constant", value: 0 },
    });
    expect(newComparisonOperand("path")).toEqual({ kind: "path", path: "" });
  });
  it.each(["constant", "literal", "path", "event-value", "collection-count"])(
    "creates editable %s operands",
    (kind) => {
      expect(editableComparisonOperand(newComparisonOperand(kind))).toBe(true);
    },
  );
  it.each([null, "text", 4, false])(
    "supports primitive literal %j",
    (value) => {
      expect(editableComparisonOperand({ kind: "literal", value })).toBe(true);
    },
  );
  it.each([
    { kind: "literal", value: [1, 2] },
    { kind: "literal", value: { secret: true } },
    { kind: "arithmetic", operands: [] },
    { kind: "lookup", table: "secret" },
    { kind: "attribute-score", attribute: "strength" },
    { kind: "choice-value", choiceId: "secret" },
    { kind: ["constant"], value: 0 },
    { kind: "toString" },
  ])("preserves advanced/malformed operand %j", (value) => {
    const before = structuredClone(value);
    expect(editableComparisonOperand(value)).toBe(false);
    expect(value).toEqual(before);
  });
  it("field edits preserve operand metadata and do not introduce absent fallback", () => {
    const value = {
      kind: "path",
      path: "actor.health",
      private: { keep: true },
    };
    expect(updateComparisonOperand(value, "path", "actor.shield")).toEqual({
      ...value,
      path: "actor.shield",
    });
    expect(value.path).toBe("actor.health");
    expect(
      updateComparisonOperand(value, "path", "actor.shield"),
    ).not.toHaveProperty("fallback");
    const advanced = {
      kind: "lookup",
      table: "secret",
      key: { kind: "literal", value: 2 },
    };
    expect(
      updateComparisonOperand(
        { kind: "path", fallback: 0, advanced },
        "path",
        "new",
      ),
    ).toMatchObject({ fallback: 0, advanced });
  });
  it("masks known record IDs and UUIDs without changing authored bindings", () => {
    const ids = new Set(["definition-secret"]);
    expect(protectedComparisonText("definition-secret", ids)).toBe(true);
    expect(
      protectedComparisonText("123e4567-e89b-12d3-a456-426614174000", ids),
    ).toBe(true);
    expect(protectedComparisonText("actor.health", ids)).toBe(false);
    expect(
      protectedComparisonText(
        "actors.123e4567-e89b-12d3-a456-426614174000.health",
        ids,
      ),
    ).toBe(true);
    for (const path of [
      "actors.definition-secret.health",
      "actors['definition-secret'].health",
      "actors/definition-secret/health",
      "actor:definition-secret",
    ])
      expect(protectedComparisonText(path, ids)).toBe(true);
    expect(protectedComparisonText("definition-secretary.health", ids)).toBe(
      false,
    );
    expect(protectedComparisonText("redaction.health", new Set(["act"]))).toBe(
      false,
    );
  });
});
