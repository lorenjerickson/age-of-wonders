import { describe, it, expect } from "vitest";
import type { WorldRule } from "@aow/common";
import {
  parseWorldRuleRoute,
  replaceWorldRuleCondition,
  worldRuleConditionAt,
} from "./worldRuleAuthoringModel";
const rule = {
  id: "r",
  condition: {
    kind: "all",
    private: "keep",
    predicates: [
      { kind: "not", predicate: { kind: "always" }, extra: true },
      { kind: "never" },
    ],
  },
  effects: [
    { kind: "set-local", key: "x", value: { kind: "constant", value: 2 } },
  ],
  private: { secret: true },
} as unknown as WorldRule;
describe("World rule child routing and preservation", () => {
  it("does not interpret rules-like World IDs as a route marker", () =>
    expect(parseWorldRuleRoute("/worlds/rules-world/rules/r/edit")).toEqual({
      kind: "edit",
      ruleId: "r",
      path: [],
    }));
  it.each(["0", "01", "-1", "1.2", "9007199254740992"])(
    "rejects unsafe ordinal %s",
    (ordinal) =>
      expect(
        parseWorldRuleRoute(`/worlds/w/rules/r/effects/${ordinal}/edit`).kind,
      ).toBe("invalid"),
  );
  it("decodes rule identity once and keeps nested ownership", () =>
    expect(
      parseWorldRuleRoute(
        "/worlds/w/rules/a%2Fb/conditions/children/1/children/1/edit",
      ),
    ).toEqual({
      ruleId: "a/b",
      path: [0, 0],
      kind: "condition",
      adding: false,
    }));
  it("preserves ancestor/private/effects and siblings when editing descendants", () => {
    const next = replaceWorldRuleCondition(rule, [0, 0], { kind: "never" });
    expect(worldRuleConditionAt(next!, [0, 0])).toEqual({ kind: "never" });
    expect(next).toMatchObject({
      private: { secret: true },
      effects: rule.effects,
      condition: {
        private: "keep",
        predicates: [
          { kind: "not", extra: true, predicate: { kind: "never" } },
          { kind: "never" },
        ],
      },
    });
    expect(worldRuleConditionAt(rule, [0, 0])).toEqual({ kind: "always" });
  });
  it("omits optional root when removed", () =>
    expect(replaceWorldRuleCondition(rule, [], undefined)).not.toHaveProperty(
      "condition",
    ));
  it("rejects missing child and required not-child removal", () => {
    expect(
      replaceWorldRuleCondition(rule, [4], { kind: "always" }),
    ).toBeUndefined();
    expect(replaceWorldRuleCondition(rule, [0, 0], undefined)).toBeUndefined();
  });
});
