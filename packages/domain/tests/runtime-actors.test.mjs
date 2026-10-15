import test from "node:test";
import assert from "node:assert/strict";
import {
  Creature,
  Character,
  GrantedModifier,
  ActiveEffect,
} from "../dist/index.js";
const actor = () => ({
  ...Creature.fromCaptured({
    id: "actor",
    entityId: "entity",
    name: "Actor",
    definitionId: "captured",
    updatedAt: "before",
  }),
  extensions: {
    private: { secret: 1 },
    "aow:rules": { "aow:movementRemaining": 5 },
  },
  imported: { keep: true },
});
test("Character inherits actor commands and preserves sparse captured data", async () => {
  const owner = Character.deserializePayload(actor());
  assert.ok(owner instanceof Creature);
  const seen = [];
  const subscription = owner.state$.subscribe((state) => seen.push(state));
  const receipt = await owner.command("place", {
    initiator: "gm",
    context: {},
    params: {
      locationId: "room",
      position: { x: 1, y: 2, z: 0 },
      updatedAt: "after",
    },
  });
  assert.equal(receipt.status, "committed");
  assert.equal(owner.state.data.identity.version.revision, 2);
  assert.deepEqual(owner.state.data.imported, { keep: true });
  assert.equal(owner.state.data.hitPoints, undefined);
  assert.equal(owner.serialize().type, "character");
  assert.equal(seen.length, 2);
  assert.throws(() =>
    Character.assertUnique("hero", [{ characterId: "hero" }]),
  );
  subscription.unsubscribe();
  owner.dispose();
});
test("runtime rules preserve private data, mapped positions and explicit bonus actions", () => {
  const original = actor(),
    before = Creature.ruleFields(original);
  const next = Creature.applyRuleFields(original, {
    before,
    after: { ...before, position: { x: 2, y: 3, z: 0 }, "aow:bonusActions": 0 },
    updatedAt: "after",
  });
  assert.equal(next.extensions["aow:rules"]["aow:bonusActions"], 0);
  assert.deepEqual(next.extensions.private, { secret: 1 });
  assert.equal(next.identity.version.revision, 2);
  assert.equal(original.identity.version.revision, 1);
  assert.throws(
    () =>
      Creature.applyRuleFields(original, {
        before,
        after: { ...before, name: "changed" },
        updatedAt: "after",
      }),
    /unsupported/,
  );
  assert.deepEqual(Creature.movementResources(next), { movementRemaining: 5 });
  const cleared = Creature.place(
    { ...next, currentLocationId: "room" },
    { locationId: "elsewhere", position: null, updatedAt: "later" },
  );
  assert.equal(cleared.currentLocationId, "room");
  assert.equal(cleared.terrainPosition, undefined);
});
test("Creature repeatability and authored maximum differ from singleton realization", () => {
  const existing = [
    { source: { sourceCreatureId: "wolf" }, runtimeCreatureId: "wolf-one" },
  ];
  assert.equal(
    Creature.existingEmbodiment(
      { strategy: "one-per-instance" },
      "wolf",
      existing,
    ),
    existing[0],
  );
  assert.equal(
    Creature.existingEmbodiment(
      { strategy: "one-per-realization" },
      "wolf",
      existing,
    ),
    undefined,
  );
  assert.throws(
    () =>
      Creature.existingEmbodiment(
        { strategy: "one-per-realization", maximumPerCampaignInstance: 1 },
        "wolf",
        existing,
      ),
    /maximum/,
  );
});
const recipe = {
  id: "health",
  label: "Health",
  kind: "rolled-flat",
  stacking: "add",
  dice: [{ count: 2, sides: 6 }],
  target: { kind: "health-maximum" },
};
const acquisition = {
  id: "grant",
  eventId: "event",
  source: { kind: "background", definitionId: "background" },
  definition: recipe,
  rolls: [[2, 5]],
};
test("modifier acquisition captures once, retries without entropy, adds sources and honors active state", async () => {
  const first = GrantedModifier.acquire(acquisition);
  assert.equal(first.resolution.value, 7);
  const retry = GrantedModifier.acquire(
    {
      ...acquisition,
      id: "different",
      rolls: undefined,
      definition: { ...recipe, label: "edited source" },
    },
    [first],
  );
  assert.deepEqual(retry, first);
  const second = GrantedModifier.acquire(
    { ...acquisition, id: "second", eventId: "second-event", rolls: [[1, 1]] },
    [first],
  );
  assert.equal(
    GrantedModifier.contributions([first, second], recipe.target).flat,
    9,
  );
  const owner = GrantedModifier.deserializePayload(first);
  await owner.command("setActive", {
    initiator: "gm",
    context: {},
    params: { active: false },
  });
  assert.equal(
    GrantedModifier.contributions(
      [owner.serialize().data, second],
      recipe.target,
    ).flat,
    2,
  );
  assert.equal(GrantedModifier.remove([first, second], first.id).length, 1);
  owner.dispose();
  assert.throws(
    () => GrantedModifier.acquire({ ...acquisition, rolls: [[8, 1]] }),
    /valid captured/,
  );
});
test("creation recipes use explicit acquisition tier and Background Skill references", () => {
  const records = [
    {
      sourceId: "background",
      payload: {
        kind: "background",
        components: {
          modifierGrants: [recipe],
          skillProficiencyIds: ["skill"],
        },
      },
    },
    {
      sourceId: "skill",
      payload: {
        kind: "skill",
        components: { modifierGrants: [{ ...recipe, id: "skill-grant" }] },
      },
    },
    {
      sourceId: "profession",
      payload: {
        kind: "profession",
        components: {
          acquisition: [
            { kind: "character-creation", startingExpertise: "aow:novice" },
          ],
          expertiseLevels: [
            {
              tier: "aow:novice",
              benefits: { modifierGrants: [{ ...recipe, id: "novice" }] },
            },
            {
              tier: "aow:master",
              benefits: { modifierGrants: [{ ...recipe, id: "master" }] },
            },
          ],
        },
      },
    },
  ];
  assert.deepEqual(
    GrantedModifier.creationRecipes(records, "background", "profession").map(
      (entry) => entry.definition.id,
    ),
    ["health", "skill-grant", "novice"],
  );
  const perCheck = GrantedModifier.acquire({
    ...acquisition,
    definition: {
      ...recipe,
      kind: "roll-dice",
      target: { kind: "roll", roll: "hit" },
    },
    rolls: undefined,
  });
  assert.deepEqual(perCheck.resolution, { kind: "per-check" });
});
test("imported acquisition reuse preserves entropy/provenance only for exact captured source recipe", () => {
  const grant = GrantedModifier.acquire(acquisition);
  assert.deepEqual(
    GrantedModifier.reusableCreationGrant([grant], acquisition.source, recipe),
    grant,
  );
  assert.equal(
    GrantedModifier.reusableCreationGrant([grant], acquisition.source, {
      ...recipe,
      label: "Changed",
    }),
    undefined,
  );
  assert.equal(
    GrantedModifier.reusableCreationGrant(
      [grant],
      { kind: "background", definitionId: "other" },
      recipe,
    ),
    undefined,
  );
  assert.throws(
    () =>
      GrantedModifier.reusableCreationGrant(
        [grant, grant],
        acquisition.source,
        recipe,
      ),
    /ambiguous/,
  );
});
test("Character activation port validates Instance binding and retains approved sparse provenance", () => {
  const sheet = {
    identity: { id: "hero" },
    campaignInstanceId: "instance",
    ownerMembershipId: "member",
    name: "Hero",
    modifierGrants: [GrantedModifier.acquire(acquisition)],
    private: { note: "retained" },
  };
  const overlay = Character.fromApprovedSheet(sheet, {
    entityId: "entity",
    campaignInstanceId: "instance",
    updatedAt: "today",
  });
  assert.equal(overlay.identity.id, "hero");
  assert.deepEqual(overlay.modifierGrants, sheet.modifierGrants);
  assert.deepEqual(
    overlay.extensions["aow:approvedCharacterSheet"].private,
    sheet.private,
  );
  assert.equal(overlay.hitPoints, undefined);
  assert.throws(
    () =>
      Character.fromApprovedSheet(sheet, {
        entityId: "entity",
        campaignInstanceId: "other",
        updatedAt: "today",
      }),
    /different Character or Campaign Instance/,
  );
});
const effect = (id, duration) => ({
  id,
  name: "Captured effect",
  appliedAt: "before",
  duration,
  conditions: ["poisoned"],
  extensions: { private: { retained: true } },
});
test("effect duration owner advances authored units/events while retaining special and permanent effects", async () => {
  const timed = effect("timed", {
    kind: "measured",
    amount: 3,
    unit: "round",
  });
  assert.equal(
    ActiveEffect.advance(timed, { elapsed: { amount: 1, unit: "round" } })
      .remaining,
    2,
  );
  assert.equal(
    ActiveEffect.advance(timed, { elapsed: { amount: 1, unit: "minute" } })
      .remaining,
    3,
  );
  assert.equal(
    ActiveEffect.advance(timed, { elapsed: { amount: 3, unit: "round" } }),
    undefined,
  );
  assert.equal(
    ActiveEffect.advance(
      effect("event", { kind: "until-event", event: "rest" }),
      { event: "rest" },
    ),
    undefined,
  );
  assert.ok(
    ActiveEffect.advance(
      effect("special", { kind: "special", description: "Until repaired" }),
      { event: "rest" },
    ),
  );
  assert.ok(
    ActiveEffect.advance(effect("permanent", { kind: "permanent" }), {
      elapsed: { amount: 1000, unit: "round" },
    }),
  );
  assert.equal(
    ActiveEffect.advance(effect("instant", { kind: "instantaneous" }), {}),
    undefined,
  );
  const owner = ActiveEffect.deserializePayload(timed),
    expirations = [];
  owner.events.expired.listen((event) => expirations.push(event));
  await owner.command("advance", {
    initiator: "clock",
    context: {},
    params: { elapsed: { amount: 3, unit: "round" } },
  });
  await owner.command("advance", {
    initiator: "clock",
    context: {},
    params: { elapsed: { amount: 3, unit: "round" } },
  });
  assert.equal(expirations.length, 1);
  assert.equal(owner.state.data.expired, true);
  assert.deepEqual(
    ActiveEffect.deserialize(owner.serialize()).state.data.effect.extensions,
    timed.extensions,
  );
  owner.dispose();
});
test("Creature owns independent condition sources, idempotent application and explicit expiration/removal", async () => {
  const owner = Character.deserializePayload({
    ...actor(),
    conditions: ["prone"],
  });
  const command = (name, params) =>
    owner.command(name, {
      initiator: "gm",
      context: {},
      params: { ...params, updatedAt: "after" },
    });
  const first = effect("first", {
      kind: "measured",
      amount: 1,
      unit: "round",
    }),
    second = effect("second", { kind: "permanent" });
  await command("applyEffect", { effect: first });
  await command("applyEffect", { effect: second });
  assert.deepEqual(Character.ruleFields(owner.serialize().data).conditions, [
    "prone",
    "poisoned",
  ]);
  const revision = owner.state.metadata.revision;
  assert.equal(
    (await command("applyEffect", { effect: first })).status,
    "unchanged",
  );
  assert.equal(owner.state.metadata.revision, revision);
  await command("advanceEffects", { elapsed: { amount: 1, unit: "round" } });
  assert.deepEqual(Character.effectiveConditions(owner.serialize().data), [
    "prone",
    "poisoned",
  ]);
  assert.deepEqual(
    owner.state.data.activeEffects.map((effect) => effect.id),
    ["second"],
  );
  await command("removeEffect", { effectId: "second" });
  assert.deepEqual(Character.effectiveConditions(owner.serialize().data), [
    "prone",
  ]);
  assert.deepEqual(owner.state.data.extensions.private, { secret: 1 });
  owner.dispose();
});
