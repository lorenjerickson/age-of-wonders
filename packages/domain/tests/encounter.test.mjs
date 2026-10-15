import test from "node:test";
import assert from "node:assert/strict";
import {
  Encounter,
  createEncounterState,
  projectEncounter,
  CombatEntropy,
} from "../dist/index.js";
const constant = (n) => [
  {
    source: { kind: "base", id: "base", name: "Configured base" },
    label: "Base",
    terms: [{ kind: "constant", value: n }],
  },
];
const dice = (count, sides, sign = 1) => [
  {
    source: { kind: "base", id: "base", name: "Configured base" },
    label: "Base",
    terms: [{ kind: "dice", count, sides, sign }],
  },
];
const profile = () => ({
  attack: constant(15),
  defense: constant(5),
  damage: dice(1, 6),
  resistance: constant(2),
  might: constant(3),
  reachSquares: 1,
  movementCheckpoints: 6,
  resources: { potion: 1 },
  rules: [
    {
      id: "heal",
      name: "Potion",
      kind: "potion",
      impossible: "skip",
      cost: { resource: "potion", amount: 1, payment: "on-completion" },
      completion: { kind: "apply-hp", amount: 3 },
    },
  ],
  pairings: [],
  attackCost: { kind: "free" },
  reactions: [
    {
      id: "block",
      name: "Block",
      defense: constant(2),
      timing: "before",
      cost: { kind: "free" },
    },
  ],
});
const actor = (id, x = 0, y = 0) => ({
  entityId: id,
  name: `Actor ${id}`,
  controllerIds: [id],
  playerControlled: true,
  visibleToPlayers: true,
  hp: 10,
  maxHp: 10,
  position: { sceneId: "scene", point: { x, y } },
  profile: profile(),
});
const encounter = (actors = [actor("a"), actor("b", 1)]) =>
  new Encounter(
    createEncounterState({
      identity: {
        id: "enc",
        version: { revision: 0, updatedAt: "2026-10-14T00:00:00Z" },
      },
      name: "Encounter",
      combatants: actors,
      environment: { grid: "square", scale: { unit: "foot", value: 5 } },
    }),
  );
let seq = 0;
const execute = (e, command, context = {}) =>
  e.command("execute", {
    initiator: "test",
    params: {
      command: {
        commandId: `command-${++seq}`,
        expectedRevision: e.state.data.revision,
        ...command,
      },
    },
    context: {
      userId: "gm",
      isGm: true,
      rolls: Array(200).fill(0.5),
      ...context,
    },
  });
async function plan(e, id, activities) {
  await execute(e, {
    kind: "edit-plan",
    combatantId: id,
    planRevision: e.state.data.plans[id].revision,
    activities,
  });
  await execute(e, {
    kind: "submit-plan",
    combatantId: id,
    planRevision: e.state.data.plans[id].revision,
  });
}
const move = (id, path) => ({ id, name: "Move", kind: "move", path });
const attack = (id, targetId) => ({
  id,
  name: "Strike",
  kind: "attack",
  targetId,
});
const block = (id, targetId) => ({
  id,
  name: "Block",
  kind: "reaction",
  ruleId: "block",
  trigger: "incoming-attack",
  targetId,
  response: { name: "Block" },
});
test("signed dice, fresh defense, margin critical doubles dice only and immediate simulation then atomic publication", async () => {
  const e = encounter();
  await plan(e, "a", [attack("hit", "b")]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.phase, "review");
  assert.equal(e.state.data.simulated[1].hp, 4);
  assert.equal(e.state.data.combatants[1].hp, 10);
  assert.equal(e.state.data.randomCursor, 2);
  await execute(e, { kind: "publish" });
  assert.equal(e.state.data.combatants[1].hp, 4);
  const r = new CombatEntropy([0, 0.99]).roll("signed", [
    ...dice(1, 4),
    ...dice(1, 4, -1),
    ...constant(3),
  ]);
  assert.equal(r.total, 0);
});
test("defender wins ties and damage never heals through resistance", async () => {
  const a = actor("a"),
    b = actor("b", 1);
  a.profile.attack = constant(5);
  const e = encounter([a, b]);
  await plan(e, "a", [attack("hit", "b")]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.simulated[1].hp, 10);
  assert.equal(e.state.data.randomCursor, 0);
});
test("logical slots: move/move, potion/move, reaction/interaction, idle/interaction; publication does not revalidate spent routes/resources", async () => {
  const a = actor("a"),
    b = actor("b", 0, 3);
  a.hp = 5;
  b.profile.rules = [
    {
      id: "lasso",
      name: "Lasso",
      kind: "interaction",
      impossible: "skip",
      completion: { kind: "apply-hp", amount: 0 },
    },
  ];
  const e = encounter([a, b]);
  await plan(e, "a", [
    move("m", [{ x: 1, y: 0 }]),
    { id: "p", name: "Potion", kind: "potion", ruleId: "heal", targetId: "a" },
    block("r", "a"),
  ]);
  await plan(e, "b", [
    move("m", [
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]),
    {
      id: "l",
      name: "Lasso",
      kind: "interaction",
      ruleId: "lasso",
      targetId: "a",
    },
    {
      id: "h",
      name: "Hogtie",
      kind: "interaction",
      ruleId: "lasso",
      targetId: "a",
    },
  ]);
  await execute(e, { kind: "lock" });
  for (let i = 0; i < 4; i++) await execute(e, { kind: "step" });
  assert.equal(e.state.data.phase, "review");
  assert.equal(e.state.data.slot, 4);
  assert.equal(e.state.data.plans.a.reactionStates.r.status, "armed");
  await execute(e, { kind: "publish" });
  assert.equal(e.state.data.combatants[0].hp, 8);
  assert.equal(e.state.data.combatants[0].position.point.x, 1);
  assert.equal(e.state.data.plans.a.reactionStates.r.status, "expired");
});
test("ownership, stale plans, movement bounds and postlock writes reject without modifying state", async () => {
  const e = encounter();
  await assert.rejects(
    execute(
      e,
      { kind: "edit-plan", combatantId: "a", planRevision: 0, activities: [] },
      { userId: "b", isGm: false },
    ),
    /not permitted/,
  );
  await assert.rejects(
    plan(e, "a", [move("far", [{ x: 2, y: 0 }])]),
    /adjacent/,
  );
  assert.equal(e.state.data.revision, 0);
  await execute(e, { kind: "lock" });
  await assert.rejects(
    execute(e, {
      kind: "edit-plan",
      combatantId: "a",
      planRevision: 0,
      activities: [],
    }),
    /closed/,
  );
});
test("unsubmitted drafts are idle; restart/replay and pause preserve locked plans", async () => {
  let e = encounter();
  await execute(e, {
    kind: "edit-plan",
    combatantId: "a",
    planRevision: 0,
    activities: [attack("hit", "b")],
  });
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "pause" });
  e = Encounter.deserialize(e.serialize());
  assert.equal(e.state.data.paused, true);
  await execute(e, { kind: "resume" });
  const cmd = {
    kind: "step",
    commandId: "retry",
    expectedRevision: e.state.data.revision,
  };
  await execute(e, cmd);
  const state = e.serialize();
  await execute(e, cmd);
  assert.deepEqual(e.serialize(), state);
  assert.equal(e.state.data.simulated[1].hp, 10);
});
test("attack versus ongoing movement pauses and accepted after interpretation affects reach, independent of roster permutation", async () => {
  async function run(reverse) {
    const actors = [actor("a"), actor("b", 1)];
    const e = encounter(reverse ? actors.reverse() : actors);
    await plan(e, "a", [attack("hit", "b")]);
    await plan(e, "b", [
      move("evade", [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]),
    ]);
    await execute(e, { kind: "lock" });
    await execute(e, { kind: "step" });
    assert.equal(e.state.data.phase, "adjudication");
    assert.equal(e.state.data.plans.a.cursor, 0);
    const restored = Encounter.deserialize(e.serialize());
    await execute(restored, {
      kind: "adjudicate",
      conflictId: restored.state.data.conflict.id,
      choice: "after",
    });
    return restored.state.data.simulated.find((c) => c.entityId === "b");
  }
  assert.deepEqual(await run(false), await run(true));
});
test("all matching reactions trigger, later reaction waits for movement", async () => {
  const a = actor("a"),
    b = actor("b", 1),
    c = actor("c", 1, 1);
  const e = encounter([a, b, c]);
  await plan(e, "a", [attack("hit", "b")]);
  await plan(e, "b", [block("r", "b")]);
  await plan(e, "c", [block("r", "b")]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.plans.b.reactionStates.r.status, "triggered");
  assert.equal(e.state.data.plans.c.reactionStates.r.status, "triggered");
  assert.equal(e.state.data.simulated[1].hp, 8);
});
test("two arrivals collision tie persists once, stationary defender wins tie", async () => {
  const e = encounter([actor("a"), actor("b", 2)]);
  await plan(e, "a", [move("m", [{ x: 1, y: 0 }])]);
  await plan(e, "b", [move("m", [{ x: 1, y: 0 }])]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  await execute(e, {
    kind: "adjudicate",
    conflictId: e.state.data.conflict.id,
    choice: "simultaneous",
  });
  assert.equal(e.state.data.phase, "adjudication");
  assert.deepEqual(e.state.data.conflict.choices, ["custom"]);
  await assert.rejects(
    execute(e, {
      kind: "adjudicate",
      conflictId: e.state.data.conflict.id,
      choice: "simultaneous",
    }),
    /interpretations/,
  );
  const s = encounter();
  await plan(s, "a", [move("m", [{ x: 1, y: 0 }])]);
  await execute(s, { kind: "lock" });
  await execute(s, { kind: "step" });
  await execute(s, {
    kind: "adjudicate",
    conflictId: s.state.data.conflict.id,
    choice: "simultaneous",
  });
  assert.equal(s.state.data.simulated[0].prone, true);
});
test("death then resurrection never restores a discarded plan; player projection excludes hidden roster/profile/private rolls", async () => {
  const hidden = actor("b", 1);
  hidden.visibleToPlayers = false;
  const e = encounter([actor("a"), hidden]);
  await plan(e, "a", [attack("hit", "b")]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "change-combatant", combatantId: "a", hp: 0 });
  await execute(e, { kind: "change-combatant", combatantId: "a", hp: 10 });
  assert.equal(e.state.data.plans.a.discarded, true);
  const p = projectEncounter(e.serialize().data, { userId: "a", isGm: false });
  assert.equal(p.combatants.length, 1);
  assert.equal("profile" in p.combatants[0], false);
  assert.equal("simulated" in p, false);
  assert.deepEqual(p.history, []);
});
test("attack budget blocks overplanning, unsupported rules and legacy state cannot silently execute", async () => {
  const a = actor("a");
  a.profile.resources.action = 1;
  a.profile.attackCost = {
    kind: "resource",
    resource: "action",
    amount: 1,
    payment: "on-completion",
  };
  const e = encounter([a, actor("b", 1)]);
  await assert.rejects(
    plan(e, "a", [attack("1", "b"), attack("2", "b")]),
    /resources/,
  );
  assert.throws(() => new Encounter({ phase: "initiative" }), /Legacy/);
});
test("hit with resistance exceeding damage applies zero; capacities reset but consumables persist", async () => {
  const a = actor("a"),
    b = actor("b", 1);
  a.profile.attack = constant(6);
  a.profile.damage = constant(1);
  b.profile.resistance = constant(20);
  a.profile.resources.action = 1;
  a.profile.roundResourceLimits = { action: 1 };
  a.profile.attackCost = {
    kind: "resource",
    resource: "action",
    amount: 1,
    payment: "on-completion",
  };
  const e = encounter([a, b]);
  await plan(e, "a", [
    attack("hit", "b"),
    { id: "p", name: "Potion", kind: "potion", ruleId: "heal", targetId: "a" },
  ]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.simulated[1].hp, 10);
  await execute(e, { kind: "publish" });
  assert.equal(e.state.data.combatants[0].profile.resources.action, 0);
  await execute(e, { kind: "next-round" });
  assert.equal(e.state.data.combatants[0].profile.resources.action, 1);
  assert.equal(e.state.data.combatants[0].profile.resources.potion, 0);
});
test("actor-keyed entropy lanes make collision outcomes invariant to roster iteration", async () => {
  async function run(reverse) {
    const a = actor("a"),
      b = actor("b", 2);
    a.profile.might = dice(1, 20);
    b.profile.might = dice(1, 20);
    const e = encounter(reverse ? [b, a] : [a, b]);
    await plan(e, "a", [move("m", [{ x: 1, y: 0 }])]);
    await plan(e, "b", [move("m", [{ x: 1, y: 0 }])]);
    await execute(e, { kind: "lock" });
    await execute(e, { kind: "step" });
    await execute(
      e,
      {
        kind: "adjudicate",
        conflictId: e.state.data.conflict.id,
        choice: "simultaneous",
      },
      { rollsByActor: { a: [0.8], b: [0.1] } },
    );
    assert.equal(e.state.data.randomCursor, 2);
    return e.state.data.simulated.filter((c) => c.prone).map((c) => c.entityId);
  }
  assert.deepEqual(await run(false), ["b"]);
  assert.deepEqual(await run(true), ["b"]);
});
test("unconscious actors declare only death-save and await explicit GM result", async () => {
  const a = actor("a");
  a.hp = 0;
  a.incapacitation = "unconscious";
  a.profile.rules.push({
    id: "save",
    name: "Death save",
    kind: "death-save",
    impossible: "skip",
    completion: { kind: "gm-confirmation" },
  });
  const e = encounter([a, actor("b", 1)]);
  await assert.rejects(plan(e, "a", [attack("hit", "b")]), /unconscious/);
  await plan(e, "a", [
    {
      id: "s",
      name: "Death save",
      kind: "death-save",
      ruleId: "save",
      targetId: "a",
    },
  ]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.phase, "adjudication");
  await execute(e, {
    kind: "adjudicate",
    conflictId: e.state.data.conflict.id,
    choice: "custom",
    reason: "Configured death save succeeds.",
    outcomes: [{ combatantId: "a", hp: 1, incapacitation: null }],
  });
  assert.equal(e.state.data.simulated[0].hp, 1);
  assert.equal(e.state.data.phase, "review");
});
test("captured summon acts next slot only through declared summoner capacity", async () => {
  const a = actor("a"),
    b = actor("b", 3),
    summon = actor("summon", 2);
  summon.removed = true;
  a.profile.resources.summonAction = 1;
  a.profile.rules.push({
    id: "summon",
    name: "Summon",
    kind: "summon",
    impossible: "skip",
    completion: {
      kind: "summon",
      sameRoundAttackCost: {
        kind: "resource",
        resource: "summonAction",
        amount: 1,
        payment: "on-completion",
      },
    },
  });
  const e = encounter([a, b, summon]);
  await plan(e, "a", [
    {
      id: "s",
      name: "Summon",
      kind: "summon",
      ruleId: "summon",
      targetId: "summon",
      summonedAttack: { name: "Summoned strike", targetId: "b" },
    },
  ]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.simulated[1].hp, 10);
  assert.equal(e.state.data.simulated[0].profile.resources.summonAction, 0);
  assert.equal(e.state.data.simulated[2].removed, false);
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.simulated[1].hp, 4);
});
test("replace reaction waits for GM, preserves owner next activity and records trigger", async () => {
  const a = actor("a"),
    b = actor("b", 1);
  b.profile.reactions[0].timing = "replace";
  const e = encounter([a, b]);
  await plan(e, "a", [attack("hit", "b")]);
  await plan(e, "b", [block("r", "b"), move("later", [{ x: 2, y: 0 }])]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.phase, "adjudication");
  assert.deepEqual(e.state.data.conflict.choices, ["custom"]);
  await execute(e, {
    kind: "adjudicate",
    conflictId: e.state.data.conflict.id,
    choice: "custom",
    reason: "Block replaces the incoming strike.",
    outcomes: [{ combatantId: "b", hp: 10 }],
  });
  assert.equal(e.state.data.plans.b.cursor, 1);
  assert.equal(e.state.data.plans.b.reactionStates.r.status, "triggered");
  await execute(e, { kind: "step" });
  assert.equal(e.state.data.simulated[1].position.point.x, 2);
});
test("custom reaction resolution consumes only the recorded matching reservations", async () => {
  const a = actor("a", -1),
    b = actor("b", 1),
    c = actor("c", 0, 3);
  b.profile.reactions[0].timing = "replace";
  c.profile.reactions[0].timing = "after";
  const e = encounter([a, b, c]);
  await plan(e, "a", [move("m", [{ x: 0, y: 0 }]), attack("hit", "b")]);
  await plan(e, "b", [block("r", "b")]);
  await plan(e, "c", [
    block("r", "a"),
    { id: "p", name: "Potion", kind: "potion", ruleId: "heal", targetId: "c" },
  ]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  await execute(e, { kind: "step" });
  await execute(e, {
    kind: "adjudicate",
    conflictId: e.state.data.conflict.id,
    choice: "custom",
    reason: "Block replaces the strike; potion completes.",
    outcomes: [
      { combatantId: "b", hp: 10 },
      { combatantId: "c", hp: 10 },
    ],
  });
  assert.equal(e.state.data.plans.b.reactionStates.r.status, "triggered");
  assert.equal(e.state.data.plans.c.reactionStates.r.status, "armed");
});
test("reopening keeps revoked ownership, clears discarded plans and resets remaining reaction lifecycle", async () => {
  const e = encounter();
  await plan(e, "a", [block("r", "a")]);
  await plan(e, "b", [move("m", [{ x: 2, y: 0 }]), block("r", "b")]);
  await execute(e, { kind: "lock" });
  await execute(e, { kind: "step" });
  await execute(e, {
    kind: "change-combatant",
    combatantId: "a",
    controllerIds: ["replacement"],
  });
  await execute(e, { kind: "reopen" });
  assert.deepEqual(e.state.data.combatants[0].controllerIds, ["replacement"]);
  assert.deepEqual(e.state.data.plans.a.activities, []);
  assert.equal(e.state.data.plans.a.discarded, false);
  assert.equal(e.state.data.plans.b.reactionStates.r.status, "pending");
  assert.ok(e.state.data.history.some((h) => h.superseded));
  await assert.rejects(
    execute(
      e,
      {
        kind: "edit-plan",
        combatantId: "a",
        planRevision: e.state.data.plans.a.revision,
        activities: [],
      },
      { userId: "a", isGm: false },
    ),
    /not permitted/,
  );
});
