import { describe, expect, it } from "vitest";
import {
  moveRuleEntry,
  newRuleExpression,
  numericExpressionKinds,
  renameJsonProperty,
  replaceRuleKind,
  scalarExpressionKinds,
  setRuleField,
} from "./ruleValueModel";

describe("shared rule value editing", () => {
  it("keeps the numeric subset separate from scalar-only expressions", () => {
    expect(numericExpressionKinds).toHaveLength(8);
    expect(scalarExpressionKinds).toHaveLength(16);
    expect(numericExpressionKinds).not.toContain("literal");
    expect(newRuleExpression("conditional")).toEqual({
      kind: "conditional",
      predicate: "",
      whenTrue: { kind: "constant", value: 0 },
      whenFalse: { kind: "constant", value: 0 },
    });
  });
  it("edits a nested operand without altering sibling expressions or metadata", () => {
    const sibling = {
      kind: "resource",
      resource: "stamina",
      actor: "target",
      private: { keep: true },
    };
    const original = {
      kind: "arithmetic",
      operator: "add",
      operands: [newRuleExpression("constant"), sibling],
      private: { author: "GM" },
    };
    const next = setRuleField(original, "operands", [
      { kind: "constant", value: 4 },
      sibling,
    ]);
    expect(next).toEqual({
      ...original,
      operands: [{ kind: "constant", value: 4 }, sibling],
    });
    expect(original.operands[0]).toEqual({ kind: "constant", value: 0 });
  });
  it("kind replacement removes known fields and preserves unrelated extensions", () => {
    const original = {
      kind: "path",
      path: "actor.health",
      fallback: 7,
      extensions: { private: [1, 2] },
    };
    expect(
      replaceRuleKind(original, newRuleExpression("constant"), [
        "kind",
        "path",
        "fallback",
        "value",
      ]),
    ).toEqual({ kind: "constant", value: 0, extensions: { private: [1, 2] } });
    expect(original.path).toBe("actor.health");
  });
  it("omits optional fields on removal without converting zero or false to absence", () => {
    expect(
      setRuleField({ fallback: 2, private: false }, "fallback", undefined),
    ).toEqual({ private: false });
    expect(setRuleField({}, "fallback", 0)).toEqual({ fallback: 0 });
    expect(setRuleField({}, "neutralizable", false)).toEqual({
      neutralizable: false,
    });
  });
  it("reorders duplicate numeric terms without losing order or values", () => {
    const original = [3, 3, -1];
    expect(moveRuleEntry(original, 2, -1)).toEqual([3, -1, 3]);
    expect(moveRuleEntry(original, 0, -1)).toEqual(original);
    expect(original).toEqual([3, 3, -1]);
  });
  it("renames a JSON property without overwriting a sibling, including prototype names", () => {
    const original = { first: { private: true }, second: [1, null] };
    expect(renameJsonProperty(original, "first", "named")).toEqual({
      named: { private: true },
      second: [1, null],
    });
    expect(() => renameJsonProperty(original, "first", "second")).toThrow(
      "already uses",
    );
    expect(
      Object.hasOwn(
        renameJsonProperty(original, "first", "__proto__"),
        "__proto__",
      ),
    ).toBe(true);
    expect(original.first).toEqual({ private: true });
  });
});
