import test from "node:test";
import assert from "node:assert/strict";
import { combatCompatibilityIssues } from "../dist/index.js";
test("legacy turn semantics require explicit authoring decisions without changing stored content", () => {
  const captured = {
    name: "Old rules",
    triggers: [{ event: "turn-start", limit: { kind: "once-per-turn" } }],
    duration: { kind: "measured", amount: 1, unit: "turn" },
  };
  const original = structuredClone(captured);
  assert.deepEqual(
    combatCompatibilityIssues(captured)
      .map((x) => x.code)
      .sort(),
    ["turn-duration", "turn-event", "turn-usage"],
  );
  assert.deepEqual(captured, original);
  assert.deepEqual(
    combatCompatibilityIssues({
      triggers: [{ event: "round-start", limit: { kind: "once-per-round" } }],
      notes: "turn-start",
      extensions: { event: "turn-start" },
    }),
    [],
  );
});
test("legacy encounter history is identified without exposing internal IDs in messages", () => {
  const issues = combatCompatibilityIssues({
    identity: { id: "opaque-id" },
    phase: "active",
    turnIndex: 2,
    initiative: [],
    combatants: [],
  });
  assert.equal(issues[0].code, "legacy-encounter");
  assert.ok(!issues[0].message.includes("opaque-id"));
});
