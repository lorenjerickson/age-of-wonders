import { describe, expect, it } from "vitest";
import {
  editableMaximum,
  newUsageLimit,
  replaceUsageLimitKind,
  usageLimitKinds,
  withoutUsageField,
} from "./triggerUsageLimitModel";
import type { MechanicsObject } from "./itemMechanicsModel";

describe("Trigger usage limits", () => {
  it.each(usageLimitKinds)("creates %s without unrelated settings", (kind) => {
    const limit = newUsageLimit(kind);
    expect(limit.kind).toBe(kind);
    expect(limit).not.toHaveProperty("resetsOn");
    if (kind === "uses")
      expect(limit.maximum).toEqual({ kind: "constant", value: 1 });
    else expect(limit).not.toHaveProperty("maximum");
  });
  it("rejects unsupported creation", () =>
    expect(() => newUsageLimit("custom")).toThrow("supported"));
  it("keeps untouched same-kind settings and private fields", () => {
    const value: MechanicsObject = {
      kind: "uses",
      maximum: { kind: "arithmetic", operator: "add", operands: [] },
      private: { retained: true },
    };
    expect(replaceUsageLimitKind(value, "uses")).toBe(value);
  });
  it("explicit kind replacement drops incompatible settings but retains extensions", () => {
    const value: MechanicsObject = {
      kind: "recharge",
      die: 6,
      succeedsOn: [2, 2, -1.5],
      private: { retained: true },
    };
    expect(replaceUsageLimitKind(value, "resource")).toEqual({
      kind: "resource",
      resource: "",
      private: { retained: true },
    });
    expect(value.succeedsOn).toEqual([2, 2, -1.5]);
  });
  it("removes optional limit without mutating trigger content", () => {
    const value: MechanicsObject = {
      event: "hit",
      limit: { kind: "once-per-turn" },
      predicate: { kind: "always" },
      effects: [],
      private: { retained: true },
    };
    expect(withoutUsageField(value, "limit")).toEqual({
      event: "hit",
      predicate: { kind: "always" },
      effects: [],
      private: { retained: true },
    });
    expect(value).toHaveProperty("limit");
  });
  it.each(["constant", "path"])("edits numeric %s expressions", (kind) =>
    expect(editableMaximum({ kind })).toBe(true),
  );
  it.each([
    "literal",
    "event-value",
    "collection-count",
    "arithmetic",
    "conditional",
    "attribute-modifier",
    "level",
    "resource",
    "proficiency-bonus",
  ])("preserves %s maximums for explicit replacement", (kind) =>
    expect(editableMaximum({ kind })).toBe(false),
  );
});
