import { describe, expect, it } from "vitest";
import {
  createRuleEffect,
  effectChildCollections,
  ruleEffectKinds,
} from "./ruleEffectModel";

describe("built-in Effect creation", () => {
  it("creates all built-in Effects without private or optional fields", () => {
    expect(ruleEffectKinds).toHaveLength(23);
    for (const kind of ruleEffectKinds) {
      const effect = createRuleEffect(kind);
      expect(effect.kind).toBe(kind);
      expect(effect.duration).toBeUndefined();
      expect(effect.payload).toBeUndefined();
    }
    expect(createRuleEffect("repeat-save")).toEqual({
      kind: "repeat-save",
      target: "",
      test: { kind: "attribute-check" },
    });
    expect(createRuleEffect("deploy")).toEqual({
      kind: "deploy",
      definitionId: "",
    });
  });
  it("keeps nested objects and identity-bearing records independent", () => {
    const first = createRuleEffect("apply-modifier"),
      second = createRuleEffect("apply-modifier");
    expect(first.modifier).not.toBe(second.modifier);
    expect(first.modifier).not.toEqual(second.modifier);
    expect(createRuleEffect("choose").choice).not.toEqual(
      createRuleEffect("choose").choice,
    );
    expect(createRuleEffect("damage").amount).not.toBe(
      createRuleEffect("damage").amount,
    );
  });
  it("only exposes declared nested effect collections", () => {
    expect(effectChildCollections("branch").map((c) => c.key)).toEqual([
      "whenTrue",
      "whenFalse",
    ]);
    expect(effectChildCollections("repeat-save").map((c) => c.key)).toEqual([
      "onSuccess",
    ]);
    expect(effectChildCollections("for-each").map((c) => c.key)).toEqual([
      "effects",
    ]);
    expect(effectChildCollections("damage")).toEqual([]);
  });
  it("does not fabricate custom or unknown payloads", () => {
    expect(() => createRuleEffect("custom")).toThrow();
    expect(() => createRuleEffect("unknown-import")).toThrow();
  });
});
