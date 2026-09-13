import test from "node:test";
import assert from "node:assert/strict";
import {
  executeWorldRules,
  starterMovementRules,
  validateWorldRule,
  validateWorldRules,
} from "../dist/index.js";
const literal = (value) => ({ kind: "literal", value });
const context = (key) => ({ kind: "context", key });
const field = (key) => ({
  kind: "state",
  scope: "runtime",
  entity: context("actorId"),
  field: key,
});
const target = (key) => ({ entity: context("actorId"), field: key });
const audit = { createdBy: "gm", updatedAt: "2026-09-13T00:00:00.000Z" };
function rule(id, effects, more = {}) {
  return {
    formatVersion: 1,
    id,
    name: id,
    revision: 1,
    lifecycle: "enabled",
    priority: 10,
    trigger: { event: "aow:test", version: 1 },
    effects,
    audit,
    ...more,
  };
}
function state() {
  return {
    runtime: {
      hero: {
        type: "actor",
        fields: {
          position: { x: 0, y: 0, z: 1 },
          score: 1,
          other: 0,
          "aow:movementRemaining": 30,
          "aow:moves": 0,
        },
      },
      gate: { type: "location", fields: { open: true } },
    },
    captured: { harbor: { type: "location", fields: { open: true } } },
    schema: {
      actor: {
        position: { type: "point", writable: true },
        score: { type: "number", writable: true },
        other: { type: "number", writable: true },
        "aow:movementRemaining": { type: "number", writable: true },
        "aow:moves": { type: "number", writable: true },
      },
      location: { open: { type: "boolean", writable: false } },
    },
  };
}
function event(type = "aow:test", extra = {}) {
  return {
    formatVersion: 1,
    id: "root",
    rootEventId: "root",
    idempotencyKey: "request",
    source: "gm",
    type,
    version: 1,
    context: { actorId: "hero", ...extra },
  };
}
const execute = (rules, more = {}) =>
  executeWorldRules({ rules, event: event(), state: state(), ...more });

test("rule-free and disabled libraries are inert and do not mutate input", () => {
  const baseline = state(),
    before = structuredClone(baseline);
  const result = execute([], { state: baseline });
  assert.equal(result.status, "no-op");
  assert.deepEqual(result.state, baseline);
  assert.deepEqual(baseline, before);
  assert.deepEqual(result.writes, []);
  assert.equal(
    execute([
      rule(
        "disabled",
        [{ kind: "increment", target: target("score"), value: literal(2) }],
        { lifecycle: "disabled" },
      ),
    ]).status,
    "no-op",
  );
});

test("ordered effects see own preceding state; emitted event chains to a second rule", () => {
  const rules = [
    rule("first", [
      { kind: "set", target: target("score"), value: literal(2) },
      { kind: "increment", target: target("score"), value: literal(3) },
      {
        kind: "emit",
        event: "aow:follow",
        context: { actorId: context("actorId"), observed: field("score") },
      },
    ]),
    rule(
      "second",
      [{ kind: "set", target: target("other"), value: context("observed") }],
      { trigger: { event: "aow:follow", version: 1 } },
    ),
  ];
  const result = execute(rules);
  assert.equal(result.status, "applied");
  assert.equal(result.state.runtime.hero.fields.score, 5);
  assert.equal(result.state.runtime.hero.fields.other, 5);
  const follow = result.events.find((e) => e.type === "aow:follow");
  assert.equal(follow.parentEventId, "root");
  assert.equal(follow.rootEventId, "root");
  assert.equal(follow.causedBy.ruleId, "first");
  assert.equal(result.writes.at(-1).eventId, follow.id);
  assert.ok(
    result.trace.some((t) => t.kind === "effect" && t.effectIndex === 1),
  );
});

test("same-priority rules read common baseline; later priorities observe preceding stages", () => {
  const rules = [
    rule("A", [{ kind: "set", target: target("score"), value: literal(7) }]),
    rule("B", [
      { kind: "set", target: target("other"), value: field("score") },
    ]),
  ];
  let result = execute(rules);
  assert.equal(result.state.runtime.hero.fields.other, 1);
  result = execute([rules[0], { ...rules[1], priority: 20 }]);
  assert.equal(result.state.runtime.hero.fields.other, 7);
  assert.deepEqual(execute([...rules].reverse()).state, execute(rules).state);
});

test("same-priority competing writes fail closed even when values agree", () => {
  const effect = { kind: "set", target: target("score"), value: literal(7) };
  for (const rules of [
    [rule("A", [effect]), rule("B", [effect])],
    [rule("A", [effect]), rule("B", [{ ...effect, value: literal(8) }])],
  ]) {
    const result = execute(rules);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.state, state());
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.writes, []);
    assert.match(result.diagnostics[0], /Same-priority/);
  }
  const result = execute([
    rule("A", [{ kind: "set-local", key: "cost", value: literal(1) }]),
    rule("B", [{ kind: "set-local", key: "cost", value: literal(1) }]),
  ]);
  assert.equal(result.status, "failed");
});

test("bounded scoped queries see nonactor runtime/captured state and targets bind to event context", () => {
  const condition = {
    kind: "all",
    predicates: ["runtime", "captured"].map((scope) => ({
      kind: "compare",
      left: {
        kind: "query-count",
        scope,
        entityType: "location",
        field: "open",
        equals: literal(true),
      },
      operator: "eq",
      right: literal(1),
    })),
  };
  const result = execute(
    [
      rule(
        "query",
        [
          {
            kind: "set",
            target: { entity: context("recipient"), field: "other" },
            value: literal(9),
          },
        ],
        { condition },
      ),
    ],
    { event: event("aow:test", { recipient: "hero" }) },
  );
  assert.equal(result.status, "applied");
  assert.equal(result.state.runtime.hero.fields.other, 9);
  const invalid = execute([
    rule("query", [
      {
        kind: "set",
        target: { entity: literal("gate"), field: "open" },
        value: literal(false),
      },
    ]),
  ]);
  assert.equal(invalid.status, "failed");
  assert.match(invalid.diagnostics[0], /read-only/);
});

test("recorded dice suspension and replay never create fresh entropy; result events trigger rules", () => {
  const rules = [
    rule("roll", [
      {
        kind: "roll",
        count: 2,
        sides: 6,
        resultEvent: "aow:dice-result",
        context: { actorId: context("actorId") },
      },
    ]),
    rule(
      "react",
      [{ kind: "set", target: target("other"), value: context("total") }],
      { trigger: { event: "aow:dice-result", version: 1 } },
    ),
  ];
  const pending = execute(rules);
  assert.equal(pending.status, "needs-entropy");
  assert.deepEqual(pending.writes, []);
  assert.deepEqual(pending.events, []);
  assert.deepEqual(pending.state, state());
  const tape = [{ ...pending.requests[0], values: [3, 5] }];
  const result = execute(rules, { entropy: tape });
  assert.equal(result.status, "applied");
  assert.equal(result.state.runtime.hero.fields.other, 8);
  assert.ok(result.events.some((e) => e.type === "aow:dice-requested"));
  assert.equal(
    result.events.find((e) => e.type === "aow:dice-result").source,
    "dice",
  );
  assert.deepEqual(execute(rules, { entropy: tape }), result);
  assert.deepEqual(result.rolls, tape);
  assert.equal(
    execute(rules, { entropy: [{ ...tape[0], values: [9, 5] }] }).status,
    "failed",
  );
});

test("runaway event chains roll back all intermediate effects and have bounded traces", () => {
  const rules = [
    rule("loop", [
      { kind: "increment", target: target("score"), value: literal(1) },
      {
        kind: "emit",
        event: "aow:test",
        context: { actorId: context("actorId") },
      },
    ]),
  ];
  for (const limits of [
    { events: 5 },
    { effects: 3 },
    { operations: 4 },
    { depth: 2 },
    { trace: 3 },
  ]) {
    const result = execute(rules, { limits });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.state, state());
    assert.deepEqual(result.writes, []);
    assert.deepEqual(result.events, []);
    assert.ok(result.trace.length <= (limits.trace ?? 2048));
  }
});

test("effective writes emit state changes; unchanged assignments do not", () => {
  const result = execute([
    rule("same", [{ kind: "set", target: target("score"), value: literal(1) }]),
  ]);
  assert.equal(result.status, "no-op");
  assert.equal(result.events.length, 1);
  assert.equal(result.writes.length, 0);
});

test("supported-profile validation rejects unknown effects, fields, unbounded structures and forged engine facts", () => {
  assert.equal(
    validateWorldRule(
      rule("bad", [{ kind: "execute-code", code: "return true" }]),
    ).valid,
    false,
  );
  assert.equal(
    validateWorldRules([
      rule("same", [{ kind: "set-local", key: "a", value: literal(1) }]),
      rule("same", [{ kind: "set-local", key: "a", value: literal(2) }]),
    ]).valid,
    false,
  );
  assert.equal(
    validateWorldRule({
      ...rule("bad", [{ kind: "set-local", key: "a", value: literal(1) }]),
      secret: true,
    }).valid,
    false,
  );
  assert.equal(
    validateWorldRule(
      rule("bad", [{ kind: "emit", event: "aow:state-changed", context: {} }]),
    ).valid,
    false,
  );
  assert.equal(
    validateWorldRule(
      rule("bad", [{ kind: "emit", event: "aow:dice-result", context: {} }]),
    ).valid,
    false,
  );
  assert.equal(
    execute([], { event: event("aow:state-changed") }).status,
    "failed",
  );
  assert.equal(
    execute([], { event: { ...event(), source: "dice" } }).status,
    "failed",
  );
  assert.equal(
    execute([
      rule("bad", [
        { kind: "set", target: target("score"), value: literal("not numeric") },
      ]),
    ]).status,
    "failed",
  );
  assert.equal(
    execute([
      rule("bad", [
        { kind: "set", target: target("hostSecret"), value: literal(2) },
      ]),
    ]).status,
    "failed",
  );
  const cyclic = { kind: "not" };
  cyclic.predicate = cyclic;
  assert.equal(
    validateWorldRule(
      rule("bad", [{ kind: "set-local", key: "x", value: literal(1) }], {
        condition: cyclic,
      }),
    ).valid,
    false,
  );
});

test("explicit starter uses authored cost, terrain gates, budget, movement and observable state-change chain", () => {
  const rules = starterMovementRules({
    budgetFeet: 30,
    ids: ["budget", "record", "base", "slope", "move", "after"],
    ...audit,
  });
  const root = event("aow:movement-declared", {
    destination: { x: 2, y: 0, z: 1 },
    distanceFeet: 10,
    slopedSegments: 2,
    contactCount: 0,
    originInteriorCount: 0,
    destinationSupported: true,
  });
  const result = execute(rules, { event: root });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.state.runtime.hero.fields.position, {
    x: 2,
    y: 0,
    z: 1,
  });
  assert.equal(result.state.runtime.hero.fields["aow:movementRemaining"], 10);
  assert.equal(result.state.runtime.hero.fields["aow:moves"], 1);
  assert.ok(
    result.writes.some((w) => w.field === "aow:moves" && w.eventId !== "root"),
  );
  const tired = state();
  tired.runtime.hero.fields["aow:movementRemaining"] = 19;
  assert.equal(execute(rules, { event: root, state: tired }).status, "no-op");
  assert.equal(
    execute(rules, {
      event: { ...root, context: { ...root.context, contactCount: 1 } },
    }).status,
    "no-op",
  );
  assert.equal(
    execute(rules, {
      event: {
        ...root,
        context: { ...root.context, destinationSupported: false },
      },
    }).status,
    "no-op",
  );
  const fresh = state();
  delete fresh.runtime.hero.fields["aow:movementRemaining"];
  delete fresh.runtime.hero.fields["aow:moves"];
  assert.equal(
    execute(rules, { event: root, state: fresh }).state.runtime.hero.fields[
      "aow:movementRemaining"
    ],
    10,
  );
  assert.deepEqual(execute([], { event: root, state: fresh }).state, fresh);
});

test("context and local lookups never read inherited object properties", () => {
  const condition = {
    kind: "all",
    predicates: ["context", "local"].map((kind) => ({
      kind: "compare",
      left: { kind, key: "toString" },
      operator: "eq",
      right: literal(null),
    })),
  };
  const result = execute([
    rule(
      "own fields only",
      [{ kind: "set", target: target("other"), value: literal(4) }],
      { condition },
    ),
  ]);
  assert.equal(result.status, "applied");
  assert.equal(result.state.runtime.hero.fields.other, 4);
  assert.equal(
    execute([], { event: { ...event(), unexpected: true } }).status,
    "failed",
  );
});

test("emit-only and recorded-roll-only chains require review while local-only evaluation remains inert", () => {
  const emitted = execute([
    rule("signal", [{ kind: "emit", event: "aow:signal", context: {} }]),
  ]);
  assert.equal(emitted.status, "applied");
  assert.deepEqual(emitted.writes, []);
  const roller = rule("roll only", [
    {
      kind: "roll",
      count: 1,
      sides: 6,
      resultEvent: "aow:dice-result",
      context: {},
    },
  ]);
  const pending = execute([roller]);
  const rolled = execute([roller], {
    entropy: [{ ...pending.requests[0], values: [4] }],
  });
  assert.equal(rolled.status, "applied");
  assert.deepEqual(rolled.writes, []);
  assert.equal(
    execute([
      rule("calculate", [
        { kind: "set-local", key: "answer", value: literal(42) },
      ]),
    ]).status,
    "no-op",
  );
});
