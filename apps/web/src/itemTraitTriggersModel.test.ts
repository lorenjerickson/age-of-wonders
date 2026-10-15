import { describe, expect, it } from "vitest";
import {
  parseTraitTriggerRoute,
  traitTriggerOwner,
  traitTriggersPatch,
  triggerEvents,
} from "./itemTraitTriggersModel";
import { effectEntries, moveEntry } from "./itemActionOutcomesModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";

describe("Trait trigger routes", () => {
  it("keeps encoded Trait identities and ordinal trigger/effect addresses", () => {
    const route = parseTraitTriggerRoute(
      "traits/triggers%2Fsecret/triggers/0/effects/2",
    )!;
    expect(route.trait.childId).toBe("triggers/secret");
    expect(route.triggerIndex).toBe("0");
    expect(route.effects).toBe(true);
    expect(route.effectIndex).toBe("2");
    expect(
      parseTraitTriggerRoute("traits/t/triggers")?.triggerIndex,
    ).toBeUndefined();
    expect(parseTraitTriggerRoute("traits/t/triggers/new")?.triggerIndex).toBe(
      "new",
    );
    expect(
      parseTraitTriggerRoute("traits/t/triggers/0/effects/new")?.effectIndex,
    ).toBe("new");
  });
  it.each([
    "actions/a/triggers",
    "traits/new/triggers",
    "traits/%6eew/triggers",
    "traits/%/triggers",
    "traits/t/triggers/%",
    "traits/t/triggers/-1",
    "traits/t/triggers/01",
    "traits/t/triggers/1.5",
    "traits/t/triggers/9007199254740992",
    "traits/t/triggers/new/effects",
    "traits/t/triggers/0/other",
    "traits/t/triggers/0/effects/9007199254740992",
    "traits/t/triggers/0/effects/-1",
    "traits/t/triggers/0/effects/00",
    "traits/t/triggers/0/effects/0/more",
  ])("rejects unsafe route %s", (path) =>
    expect(parseTraitTriggerRoute(path)).toBeUndefined(),
  );
});
describe("Trait trigger edits", () => {
  const route = parseTraitTriggerRoute("traits/t/triggers/0")!;
  it("keeps absent collections absent until an edit", () => {
    const original: MechanicsObject = { traits: [{ identity: { id: "t" } }] };
    expect(traitTriggerOwner(original, route).triggers).toEqual([]);
    expect(original.traits).toEqual([{ identity: { id: "t" } }]);
    expect(
      traitTriggersPatch(original, route, []).traits?.[0].components,
    ).toEqual({ triggers: [] });
  });
  it.each([null, [], "invalid", 1, false].map((value) => ({ value })))(
    "blocks malformed Trait components $value",
    ({ value }) => {
      const original: MechanicsObject = {
        traits: [{ identity: { id: "t" }, components: value }],
      };
      expect(() => traitTriggerOwner(original, route)).toThrow();
      expect(() => traitTriggersPatch(original, route, [])).toThrow();
    },
  );
  it.each([null, {}, [null], [1], ["bad"]].map((value) => ({ value })))(
    "blocks malformed triggers $value",
    ({ value }) => {
      const original: MechanicsObject = {
        traits: [{ identity: { id: "t" }, components: { triggers: value } }],
      };
      expect(() => traitTriggerOwner(original, route)).toThrow();
      expect(() => traitTriggersPatch(original, route, [])).toThrow();
    },
  );
  it.each(
    [
      [],
      [{ identity: { id: "other" } }],
      [{ identity: { id: "t" } }, { identity: { id: "t" } }],
      [{ identity: { id: "new" } }],
    ].map((traits) => ({ traits })),
  )("blocks unsafe owner identities $traits", ({ traits }) =>
    expect(() => traitTriggersPatch({ traits }, route, [])).toThrow(),
  );
  it("patches only trigger collection preserving embedded rules/private data and siblings", () => {
    const original: MechanicsObject = {
      traits: [
        {
          identity: { id: "t", name: "Chime" },
          private: { secret: true },
          components: {
            triggers: [
              {
                event: "hit",
                effects: [{ kind: "custom", private: true }],
                limit: { kind: "custom" },
                predicate: { kind: "never" },
                private: true,
              },
            ],
            actions: [{ secret: true }],
            choices: [{ secret: true }],
            modifiers: [{ secret: true }],
            grants: ["keep"],
            prerequisites: [{ kind: "always" }],
          },
        },
        {
          identity: { id: "sibling" },
          components: { triggers: [{ event: "move", effects: [] }] },
        },
      ],
      vehicle: { private: true },
      actions: [{ private: true }],
    };
    const before = structuredClone(original),
      owner = traitTriggerOwner(original, route),
      next = owner.triggers.map((trigger) => ({ ...trigger, priority: -2.5 }));
    const patch = traitTriggersPatch(original, route, next);
    expect(Object.keys(patch)).toEqual(["traits"]);
    expect(patch.traits?.[1]).toEqual(
      (original.traits as MechanicsObject[])[1],
    );
    expect(patch.traits?.[0]).toEqual({
      ...owner.trait,
      components: { ...owner.components, triggers: next },
    });
    expect(original).toEqual(before);
    const trigger = next[0],
      updated = [{ ...trigger, effects: [] }];
    expect(
      mechanicsObject(
        traitTriggersPatch(original, route, updated).traits?.[0].components,
      ).triggers,
    ).toEqual(updated);
  });
  it("preserves missing effects while metadata changes; explicit effects edits initialize them", () => {
    const original: MechanicsObject = {
      traits: [
        { identity: { id: "t" }, components: { triggers: [{ event: "hit" }] } },
      ],
    };
    const owner = traitTriggerOwner(original, route);
    expect(effectEntries(owner.triggers[0].effects)).toEqual([]);
    expect(
      traitTriggersPatch(original, route, [
        { ...owner.triggers[0], priority: 1 },
      ]).traits?.[0].components.triggers,
    ).toEqual([{ event: "hit", priority: 1 }]);
  });
  it("orders duplicates and custom entries by position immutably", () => {
    const source = effectEntries([
      { event: "hit", private: 1 },
      { event: "hit", private: 2 },
      { event: "custom", private: 3 },
    ]);
    expect(moveEntry(source, 0, 1)).toEqual([source[1], source[0], source[2]]);
    expect(moveEntry(source, 0, -1)).toEqual(source);
  });
  it("offers all common EventType values without custom names as display labels", () => {
    expect(triggerEvents).toHaveLength(29);
    expect(triggerEvents).toContain("profession-advanced");
    expect(triggerEvents).toContain("custom");
  });
});
