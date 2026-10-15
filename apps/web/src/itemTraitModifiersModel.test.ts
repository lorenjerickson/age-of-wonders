import { describe, expect, it } from "vitest";
import {
  modifierEntries,
  modifierOperations,
  modifierStacking,
  newTraitModifier,
  parseTraitModifierRoute,
  traitModifiersPatch,
  traitModifierOwner,
} from "./itemTraitModifiersModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { moveEntry } from "./itemActionOutcomesModel";
describe("Trait modifier routes", () => {
  it("uses structural markers and decoded IDs", () => {
    const route = parseTraitModifierRoute(
      "traits/modifiers%2Fsecret/modifiers/new%2Fmodifier",
    );
    expect(route?.trait.childId).toBe("modifiers/secret");
    expect(route?.modifierId).toBe("new/modifier");
    expect(route?.traitPath).toBe("traits/modifiers%2Fsecret");
  });
  it.each([
    "actions/a/modifiers",
    "traits/new/modifiers",
    "traits/%6eew/modifiers",
    "traits/a/actions/b/modifiers",
    "traits/a/modifiers/b/extra",
    "traits/%/modifiers",
    "traits/a/modifiers/%",
    "traits/a",
  ])("rejects unsupported route %s", (path) =>
    expect(parseTraitModifierRoute(path)).toBeUndefined(),
  );
  it("supports listing and creation without requiring modifier presence", () => {
    expect(
      parseTraitModifierRoute("traits/t/modifiers")?.modifierId,
    ).toBeUndefined();
    expect(parseTraitModifierRoute("traits/t/modifiers/new")?.modifierId).toBe(
      "new",
    );
  });
});
describe("Trait modifier identity and preservation", () => {
  it.each([
    null,
    {},
    [null],
    [{ target: "x" }],
    [{ id: "" }],
    [{ id: "new" }],
    [{ id: 42 }],
    [{ id: "x" }, { id: "x" }],
  ])("blocks malformed or ambiguous collection %j", (value) =>
    expect(() => modifierEntries(value)).toThrow(),
  );
  it("does not invent optional values on creation or read", () => {
    expect(modifierEntries(undefined)).toEqual([]);
    expect(newTraitModifier()).toEqual({
      id: expect.any(String),
      target: "",
      operation: "add",
    });
  });
  it("changes only modifiers on the selected Trait", () => {
    const original: MechanicsObject = {
      traits: [
        {
          identity: { id: "t" },
          private: { hidden: true },
          components: {
            actions: [
              {
                identity: { id: "a" },
                components: { prerequisites: [{ kind: "always" }] },
              },
            ],
            choices: [{ id: "c", options: [] }],
            prerequisites: [{ kind: "never" }],
            grants: [{ private: true }],
            triggers: [{ private: true }],
            modifiers: [
              {
                id: "m",
                target: "actor.armor",
                operation: "set",
                value: { kind: "custom", payload: { secret: true } },
                predicate: { kind: "custom", payload: { hidden: true } },
                private: { keep: true },
              },
              { id: "n", operation: "allow", target: "actor.fly" },
            ],
          },
        },
        { identity: { id: "sibling" }, components: { private: true } },
      ],
      vehicle: { private: true },
      actions: [{ private: true }],
    };
    const before = structuredClone(original),
      route = parseTraitModifierRoute("traits/t/modifiers/m")!;
    const traits = original.traits as MechanicsObject[],
      components = mechanicsObject(traits[0].components),
      modifiers = modifierEntries(components.modifiers);
    const patch = traitModifiersPatch(
      original,
      route,
      modifiers.map((modifier, i) =>
        i === 0 ? { ...modifier, priority: -0.5 } : modifier,
      ),
    );
    const changed = (patch.traits as unknown as MechanicsObject[])[0];
    expect(mechanicsObject(changed.components)).toEqual({
      ...components,
      modifiers: [{ ...modifiers[0], priority: -0.5 }, modifiers[1]],
    });
    expect(changed.private).toEqual(traits[0].private);
    expect(patch.traits?.[1]).toEqual(traits[1]);
    expect(Object.keys(patch)).toEqual(["traits"]);
    expect(original).toEqual(before);
    const reordered = moveEntry(modifiers, 0, 1);
    expect(reordered).toEqual([modifiers[1], modifiers[0]]);
    expect(
      traitModifiersPatch(original, route, reordered).traits?.[0].components
        .modifiers,
    ).toEqual(reordered);
    expect(
      traitModifiersPatch(original, route, []).traits?.[0].components.modifiers,
    ).toEqual([]);
  });
  it("blocks missing and ambiguous Trait owners before changing data", () => {
    const route = parseTraitModifierRoute("traits/t/modifiers")!;
    for (const traits of [
      [],
      [{ identity: { id: "other" } }],
      [{ identity: { id: "t" } }, { identity: { id: "t" } }],
      [{ identity: { id: "new" } }],
    ])
      expect(() => traitModifiersPatch({ traits }, route, [])).toThrow();
  });
  it.each([null, false, 0, "imported", []])(
    "blocks malformed Trait components %j on both read and write",
    (value) => {
      const components = {
        traits: [{ identity: { id: "t" }, components: value }],
      };
      const before = structuredClone(components);
      const route = parseTraitModifierRoute("traits/t/modifiers/new")!;
      expect(() => traitModifierOwner(components, route)).toThrow("preserved");
      expect(() =>
        traitModifiersPatch(components, route, [newTraitModifier()]),
      ).toThrow("preserved");
      expect(components).toEqual(before);
    },
  );
  it("does not overwrite a malformed existing collection via direct patch callers", () => {
    const components = {
      traits: [{ identity: { id: "t" }, components: { modifiers: null } }],
    };
    expect(() =>
      traitModifiersPatch(
        components,
        parseTraitModifierRoute("traits/t/modifiers")!,
        [],
      ),
    ).toThrow("preserved");
  });
  it("keeps omitted components untouched until an explicit collection mutation", () => {
    const components = {
      traits: [{ identity: { id: "t" }, private: { hidden: true } }],
    };
    const route = parseTraitModifierRoute("traits/t/modifiers")!;
    expect(traitModifierOwner(components, route).modifiers).toEqual([]);
    expect(components.traits[0]).not.toHaveProperty("components");
    expect(traitModifiersPatch(components, route, []).traits?.[0]).toEqual({
      ...components.traits[0],
      components: { modifiers: [] },
    });
  });
  it("enumerates every common operation and stacking policy", () => {
    expect(modifierOperations).toHaveLength(13);
    expect(modifierStacking).toEqual([
      "stack",
      "highest",
      "lowest",
      "replace",
      "unique-by-source",
    ]);
  });
});
