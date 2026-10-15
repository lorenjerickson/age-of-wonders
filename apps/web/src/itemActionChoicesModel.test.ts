import { describe, expect, it } from "vitest";
import {
  itemChoicesPatch,
  choiceEntries,
  editableOptionValue,
  newChoice,
  newChoiceOption,
  parseChoiceRoute,
} from "./itemActionChoicesModel";
import { type MechanicsObject } from "./itemMechanicsModel";
const action: MechanicsObject = {
  identity: { id: "a", name: "Action" },
  kind: "action",
  private: { note: "keep" },
  components: {
    costs: [{ kind: "custom", payload: { keep: true } }],
    choices: [
      {
        id: "c",
        prompt: "Choose",
        minimum: 1,
        maximum: 1,
        optionCatalog: "hidden",
        options: [
          {
            id: "o",
            label: "Option",
            value: { advanced: true },
            prerequisites: [{ kind: "always" }],
          },
        ],
      },
    ],
  },
};
describe("Action choice editing", () => {
  it.each([
    "actions/a",
    "traits/t/actions/a",
    "vehicle/actions/a",
    "actions/choices",
    "traits/choices/actions/options",
    "actions/a%2Fb",
  ])("parses nested identity routes structurally: %s", (path) => {
    expect(
      parseChoiceRoute(`${path}/choices/choices/options/options`),
    ).toMatchObject({
      entityPath: path,
      choiceId: "choices",
      options: true,
      optionId: "options",
    });
    expect(
      parseChoiceRoute(`${path}/choices/c%2Fd/options/o%2Fp`),
    ).toMatchObject({ choiceId: "c/d", optionId: "o/p" });
    expect(parseChoiceRoute(`${path}/choices/new`)).toMatchObject({
      choiceId: "new",
      options: false,
    });
  });
  it.each([
    "actions/new/choices",
    "actions/a/choices/new/options",
    "actions/a/choices/c/nope",
    "actions/a/choices/c/options/o/more",
    "actions/%ZZ/choices",
    "actions/a/choices/%ZZ",
    "actions/a/choices/c/options/%ZZ",
    "actions/choices",
  ])("rejects unavailable route %s", (path) =>
    expect(parseChoiceRoute(path)).toBeUndefined(),
  );
  it.each([
    null,
    [null],
    [{ id: "" }],
    [{ id: "new" }],
    [{ id: "same" }, { id: "same" }],
  ])("refuses ambiguous imported collections %#", (value) =>
    expect(() => choiceEntries(value)).toThrow("preserved"),
  );
  it("keeps undefined options absent until explicitly edited", () => {
    expect(choiceEntries(undefined)).toEqual([]);
    expect(newChoice()).not.toHaveProperty("options");
    expect(newChoice()).not.toHaveProperty("visibility");
    expect(newChoice()).not.toHaveProperty("allowDuplicates");
    expect(newChoiceOption()).not.toHaveProperty("prerequisites");
  });
  it.each(["direct", "trait", "vehicle"])(
    "preserves %s siblings and owner state",
    (owner) => {
      const sibling = { ...action, identity: { id: "b" } },
        actions = [action, sibling];
      const components: MechanicsObject =
        owner === "direct"
          ? { actions }
          : owner === "trait"
            ? {
                traits: [
                  {
                    identity: { id: "t" },
                    private: { note: "keep" },
                    components: { actions, grants: ["keep"] },
                  },
                ],
              }
            : { vehicle: { actions, crew: 3 } };
      const path =
        owner === "direct"
          ? "actions/a"
          : owner === "trait"
            ? "traits/t/actions/a"
            : "vehicle/actions/a";
      const choices = [
        {
          ...choiceEntries((action.components as MechanicsObject).choices)[0],
          prompt: "Changed",
        },
      ];
      const patch = itemChoicesPatch(
        components,
        parseChoiceRoute(`${path}/choices`)!,
        choices,
      );
      const patched =
        owner === "direct"
          ? patch.actions
          : owner === "trait"
            ? patch.traits?.[0]?.components.actions
            : patch.vehicle?.actions;
      expect(patched).toEqual([
        {
          ...action,
          components: { ...(action.components as object), choices },
        },
        sibling,
      ]);
      if (owner === "trait")
        expect(patch.traits?.[0]).toMatchObject({
          private: { note: "keep" },
          components: { grants: ["keep"] },
        });
      if (owner === "vehicle") expect(patch.vehicle?.crew).toBe(3);
      expect(action.components).toMatchObject({
        choices: [{ prompt: "Choose" }],
      });
    },
  );
  it("refuses writing a missing Action", () =>
    expect(() =>
      itemChoicesPatch(
        { actions: [] },
        parseChoiceRoute("actions/a/choices")!,
        [],
      ),
    ).toThrow("no longer"));
  it.each(["text", "", 0, -2.5, true, false, null])(
    "edits JSON primitive %j",
    (v) => expect(editableOptionValue(v, new Set())).toBe(true),
  );
  it.each([
    [1],
    { a: true },
    undefined,
    NaN,
    Infinity,
    "123e4567-e89b-12d3-a456-426614174000",
    "definition:123e4567-e89b-12d3-a456-426614174000",
    "known-id",
  ])("protects advanced or opaque value %j", (v) =>
    expect(editableOptionValue(v, new Set(["known-id"]))).toBe(false),
  );
});

describe("Trait choice ownership", () => {
  const trait: MechanicsObject = {
    identity: { id: "t", name: "Trait" },
    kind: "trait",
    private: { note: "keep" },
    components: {
      actions: [action],
      prerequisites: [{ kind: "always" }],
      grants: [{ kind: "custom", payload: { keep: true } }],
      modifiers: [{ kind: "custom" }],
      triggers: [{ kind: "custom" }],
      choices: [
        {
          id: "c",
          prompt: "Choose",
          minimum: 1,
          maximum: 2,
          optionCatalog: "hidden",
          private: { keep: true },
          options: [
            {
              id: "o",
              label: "First",
              value: { complex: true },
              prerequisites: [{ kind: "never" }],
            },
            { id: "other", label: "Other", value: null },
          ],
        },
        { id: "sibling", prompt: "Sibling", minimum: 0, maximum: 1 },
      ],
    },
  };
  it.each([
    "traits/t",
    "traits/t%2Fslash",
    "traits/choices",
    "traits/actions",
    "traits/options",
  ])("parses Trait owner %s", (path) => {
    expect(parseChoiceRoute(`${path}/choices`)).toMatchObject({
      entityPath: path,
      ownerKind: "trait",
      entity: { collection: "traits" },
      options: false,
    });
    expect(
      parseChoiceRoute(`${path}/choices/c%2Fd/options/o%2Fp`),
    ).toMatchObject({ choiceId: "c/d", optionId: "o/p", options: true });
  });
  it.each([
    "traits/new/choices",
    "traits/%6Eew/choices",
    "traits/%ZZ/choices",
    "traits/t/choices/%6Eew/options",
    "traits/t/choices/c/options/o/extra",
  ])("rejects unsafe Trait route %s", (path) =>
    expect(parseChoiceRoute(path)).toBeUndefined(),
  );
  it("updates Trait Options without changing any sibling or other owned rule", () => {
    const sibling: MechanicsObject = {
      identity: { id: "other" },
      components: { choices: [] },
    };
    const components: MechanicsObject = {
      traits: [trait, sibling],
      actions: [action],
      private: { root: true },
    };
    const before = structuredClone(components);
    const originalChoices = choiceEntries(
      (trait.components as MechanicsObject).choices,
    );
    const choices = originalChoices.map((choice) =>
      choice.id === "c"
        ? {
            ...choice,
            options: choiceEntries(choice.options).map((option) =>
              option.id === "o" ? { ...option, label: "Changed" } : option,
            ),
          }
        : choice,
    );
    const patch = itemChoicesPatch(
      components,
      parseChoiceRoute("traits/t/choices/c/options/o")!,
      choices,
    );
    expect(patch).toEqual({
      traits: [
        {
          ...trait,
          components: { ...(trait.components as MechanicsObject), choices },
        },
        sibling,
      ],
    });
    expect(components).toEqual(before);
    expect(choiceEntries(choices[0].options)[0]).toMatchObject({
      value: { complex: true },
      prerequisites: [{ kind: "never" }],
    });
  });
  it("keeps absent choices absent until the first explicit edit", () => {
    const emptyTrait: MechanicsObject = {
      identity: { id: "t" },
      components: { actions: [action] },
    };
    expect(
      choiceEntries((emptyTrait.components as MechanicsObject).choices),
    ).toEqual([]);
    const patch = itemChoicesPatch(
      { traits: [emptyTrait] },
      parseChoiceRoute("traits/t/choices")!,
      [newChoice()],
    );
    expect(patch.traits?.[0]?.components.choices).toHaveLength(1);
    expect(emptyTrait.components).not.toHaveProperty("choices");
  });
  const unavailableTraits: MechanicsObject[][] = [
    [],
    [{ identity: { id: "other" } }],
    [trait, trait],
    [{ identity: { id: "new" } }],
    [{ identity: {} }],
  ];
  it.each(unavailableTraits.map((traits) => ({ traits })))(
    "blocks missing and ambiguous Trait owners %#",
    ({ traits }) => {
      expect(() =>
        itemChoicesPatch({ traits }, parseChoiceRoute("traits/t/choices")!, []),
      ).toThrow();
    },
  );
});
