import { describe, expect, it } from "vitest";
import {
  itemPrerequisitesPatch,
  newActionPrerequisite,
  parsePrerequisiteRoute,
  prerequisiteCollection,
  prerequisiteDefinitionOptions,
  prerequisiteEntity,
  prerequisiteOwner,
  prerequisiteRoot,
} from "./itemActionPrerequisitesModel";
import { effectEntries, moveEntry } from "./itemActionOutcomesModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import type { WorldDraftRecord } from "./api";
const action: MechanicsObject = {
  identity: { id: "a", name: "Action" },
  kind: "action",
  private: { note: "secret" },
  components: {
    activation: "action",
    outcomes: [{ id: "o", effects: [] }],
    prerequisites: [{ kind: "custom", payload: { secret: true } }],
  },
};
describe("Action prerequisite editing", () => {
  it.each([
    "actions/a",
    "traits/t/actions/a",
    "vehicle/actions/a",
    "actions/prerequisites",
    "traits/prerequisites/actions/prerequisites",
    "actions/a%2Fb",
  ])("addresses owner structurally: %s", (path) => {
    expect(parsePrerequisiteRoute(`${path}/prerequisites/0`)).toMatchObject({
      entityPath: path,
      prerequisiteIndex: "0",
    });
    expect(
      parsePrerequisiteRoute(`${path}/prerequisites/new`)?.prerequisiteIndex,
    ).toBe("new");
  });
  it.each([
    "actions/new/prerequisites",
    "actions/a/prerequisites/-1",
    "actions/a/prerequisites/01",
    "actions/a/prerequisites/1.5",
    "actions/a/prerequisites/nope",
    "actions/a/prerequisites/0/more",
    "actions/%ZZ/prerequisites",
    "actions/prerequisites",
  ])("rejects malformed route %s", (path) =>
    expect(parsePrerequisiteRoute(path)).toBeUndefined(),
  );
  it.each(["direct", "trait", "vehicle"])(
    "preserves %s parent, siblings and private data",
    (owner) => {
      const sibling = { ...action, identity: { id: "b" } };
      const actions = [action, sibling];
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
      const prerequisites = [
        { kind: "has-tag", subject: "actor", tag: "ready" },
      ];
      const patch = itemPrerequisitesPatch(
        components,
        parsePrerequisiteRoute(`${path}/prerequisites`)!,
        prerequisites,
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
          components: { ...(action.components as object), prerequisites },
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
        prerequisites: [{ kind: "custom" }],
      });
    },
  );
  it("refuses missing Action and malformed collections without normalizing data", () => {
    const route = parsePrerequisiteRoute("actions/a/prerequisites")!;
    expect(() => itemPrerequisitesPatch({ actions: [] }, route, [])).toThrow(
      "no longer",
    );
    expect(() => effectEntries([null])).toThrow("preserved");
  });
  it("reorders advanced predicates without changing expressions or private fields", () => {
    const values = [
      { kind: "all", predicates: [{ kind: "never" }], private: { keep: true } },
      { kind: "has-definition", subject: "actor", definitionId: "keep" },
      { kind: "custom", rule: "keep", payload: { secret: true } },
    ];
    expect(moveEntry(values, 0, 1)).toEqual([values[1], values[0], values[2]]);
  });
  it("preserves optional absence and starts with explicit empty authored bindings", () => {
    expect(newActionPrerequisite("always")).toEqual({ kind: "always" });
    expect(newActionPrerequisite("is-attuned")).toEqual({
      kind: "is-attuned",
      subject: "",
    });
    expect(newActionPrerequisite("within-distance")).toEqual({
      kind: "within-distance",
      source: "",
      target: "",
      distance: { value: 0, unit: "foot" },
    });
    expect(() => newActionPrerequisite("custom")).toThrow("Unsupported");
    expect(() => newActionPrerequisite("toString")).toThrow("Unsupported");
  });
  it.each([
    "always",
    "never",
    "has-condition",
    "has-tag",
    "is-proficient",
    "is-attuned",
    "is-sustaining-operation",
    "damage-type",
    "within-distance",
    "visible",
    "has-cover",
    "relation",
  ])("creates supported %s predicate without engine assumptions", (kind) => {
    expect(newActionPrerequisite(kind)).toMatchObject({ kind });
    expect(Object.values(newActionPrerequisite(kind))).not.toContain("actor");
  });
});

describe("definition-reference prerequisites", () => {
  const record = (
    id: string,
    name: string,
    kind = "item",
    resourceType = "definitions",
  ): WorldDraftRecord => ({
    sourceId: id,
    resourceType,
    payload: {
      kind,
      identity: { id: "payload-id", name },
      components: {
        actions: [{ identity: { id: "embedded", name: "Embedded Action" } }],
      },
    },
  });
  it("offers every persisted draft definition using source identity, excluding instances and embedded definitions", () => {
    expect(
      prerequisiteDefinitionOptions([
        record("sword", "Sword"),
        record("discipline", "Stealth", "discipline"),
        record("instance", "Owned sword", "item", "item-instances"),
        record("location", "Hall", "location", "locations"),
        record("sword", "Duplicate record"),
        record("", "Missing identity"),
      ]),
    ).toEqual([
      { id: "sword", label: "Sword · Item" },
      { id: "discipline", label: "Stealth · Discipline" },
    ]);
  });
  it("disambiguates equal name and kind without displaying IDs", () => {
    expect(
      prerequisiteDefinitionOptions([
        record("one", "Training"),
        record("two", "Training"),
        record("three", "Training", "skill"),
      ]),
    ).toEqual([
      { id: "one", label: "Training · Item (1)" },
      { id: "two", label: "Training · Item (2)" },
      { id: "three", label: "Training · Skill" },
    ]);
  });
  it("uses neutral fallbacks for absent or opaque names and unknown kinds", () => {
    const uuid = "a31c0fa9-df78-4651-9344-4e53d3f44eaf";
    const labels = prerequisiteDefinitionOptions([
      record(uuid, uuid, uuid),
      record("opaque-ref", "actor.opaque-ref", "toString"),
      record("empty", ""),
    ]).map((option) => option.label);
    expect(labels).toEqual([
      "Unnamed definition · Definition (1)",
      "Unnamed definition · Definition (2)",
      "Unnamed definition · Item",
    ]);
    expect(JSON.stringify(labels)).not.toContain(uuid);
    expect(JSON.stringify(labels)).not.toContain("opaque-ref");
  });
  it("starts incomplete without inventing a definition reference", () => {
    expect(newActionPrerequisite("has-definition")).toEqual({
      kind: "has-definition",
      subject: "",
    });
  });
  it.each([undefined, "", "unavailable-definition"])(
    "preserves unresolved reference %s and private data in a nested save",
    (definitionId) => {
      const prerequisite: MechanicsObject = {
        kind: "has-definition",
        subject: "actor",
        private: { keep: true },
        ...(definitionId === undefined ? {} : { definitionId }),
      };
      const components = {
        actions: [
          {
            ...action,
            components: {
              prerequisites: [
                {
                  kind: "all",
                  private: { keep: true },
                  predicates: [prerequisite],
                },
              ],
            },
          },
        ],
      };
      const before = structuredClone(components);
      const route = parsePrerequisiteRoute(
        "actions/a/prerequisites/0/children/0",
      )!;
      const updated = itemPrerequisitesPatch(components, route, [
        { ...prerequisite, subject: "target" },
      ]);
      expect(
        prerequisiteCollection(
          updated.actions![0].components.prerequisites,
          [0],
        ).entries,
      ).toEqual([{ ...prerequisite, subject: "target" }]);
      expect(components).toEqual(before);
    },
  );
});

describe("compound prerequisite editing", () => {
  const privateData = { notes: "retain" };
  const advanced = {
    kind: "custom",
    rule: "extension:keep",
    payload: { secret: true },
  };
  const roots: MechanicsObject[] = [
    {
      kind: "all",
      private: privateData,
      predicates: [
        advanced,
        {
          kind: "any",
          private: privateData,
          predicates: [
            {
              kind: "not",
              private: privateData,
              predicate: {
                kind: "has-tag",
                subject: "actor",
                tag: "ready",
                private: privateData,
              },
            },
            advanced,
          ],
        },
      ],
    },
    advanced,
  ];
  const components = {
    actions: [
      {
        ...action,
        components: { ...(action.components as object), prerequisites: roots },
      },
    ],
  };
  it.each([
    "actions/a",
    "traits/children/actions/prerequisites",
    "vehicle/actions/a%2Fb",
  ])("parses repeated nested collections for %s", (path) => {
    expect(
      parsePrerequisiteRoute(
        `${path}/prerequisites/0/children/1/children/0/children/0`,
      ),
    ).toMatchObject({
      entityPath: path,
      parentIndices: [0, 1, 0],
      prerequisiteIndex: "0",
      collectionPath: "prerequisites/0/children/1/children/0/children",
    });
    expect(
      parsePrerequisiteRoute(`${path}/prerequisites/0/children/1/children/new`),
    ).toMatchObject({ parentIndices: [0, 1], prerequisiteIndex: "new" });
    expect(
      parsePrerequisiteRoute(`${path}/prerequisites/0/children`),
    ).toMatchObject({ parentIndices: [0], prerequisiteIndex: undefined });
  });
  it.each([
    "new/children",
    "-1/children",
    "01/children",
    "0/children/new/children",
    "0/children/children",
    "0/children/0/other",
    "9007199254740992/children",
    "0/children/9007199254740992",
  ])("rejects ambiguous child route %s", (tail) => {
    expect(
      parsePrerequisiteRoute(`actions/a/prerequisites/${tail}`),
    ).toBeUndefined();
  });
  it("replaces a mixed all-any-not leaf immutably while retaining every ancestor and sibling", () => {
    const before = structuredClone(components);
    const route = parsePrerequisiteRoute(
      "actions/a/prerequisites/0/children/1/children/0/children/0",
    )!;
    const leaf = prerequisiteCollection(roots, route.parentIndices).entries[0];
    const patch = itemPrerequisitesPatch(components, route, [
      { ...leaf, tag: "changed" },
    ]);
    const updated = patch.actions![0].components.prerequisites;
    expect(prerequisiteCollection(updated, [0, 1, 0]).entries).toEqual([
      { ...leaf, tag: "changed" },
    ]);
    expect(prerequisiteCollection(updated, [0]).entries[0]).toEqual(advanced);
    expect(prerequisiteCollection(updated, [0, 1]).entries[1]).toEqual(
      advanced,
    );
    expect(prerequisiteCollection(updated, []).entries[1]).toEqual(advanced);
    for (const path of [[0], [0, 1], [0, 1, 0]])
      expect(prerequisiteCollection(updated, path).parent?.private).toEqual(
        privateData,
      );
    expect(components).toEqual(before);
  });
  it("removes and explicitly replaces a not child, preserving missing state without inventing a predicate", () => {
    const route = parsePrerequisiteRoute(
      "actions/a/prerequisites/0/children/1/children/0/children",
    )!;
    const removed = itemPrerequisitesPatch(components, route, []);
    const root = removed.actions![0].components.prerequisites;
    expect(prerequisiteCollection(root, [0, 1, 0]).parent).toEqual({
      kind: "not",
      private: privateData,
    });
    expect(prerequisiteCollection(root, [0, 1, 0]).entries).toEqual([]);
    const replaced = itemPrerequisitesPatch(
      { actions: effectEntries(removed.actions) },
      route,
      [{ kind: "never" }],
    );
    expect(
      prerequisiteCollection(
        replaced.actions![0].components.prerequisites,
        [0, 1, 0],
      ).entries,
    ).toEqual([{ kind: "never" }]);
    expect(() =>
      itemPrerequisitesPatch(components, route, [
        { kind: "always" },
        { kind: "never" },
      ]),
    ).toThrow("one child");
  });
  it.each([
    { kind: "all", predicates: null },
    { kind: "any", predicates: [null] },
    { kind: "not", predicate: [] },
    { kind: "not", predicate: "invalid" },
    { kind: "compare", payload: privateData },
  ])(
    "refuses traversal through malformed or unsupported parents %j",
    (parent) => {
      const malformed = mechanicsObject({
        actions: [{ ...action, components: { prerequisites: [parent] } }],
      });
      const before = structuredClone(malformed);
      const route = parsePrerequisiteRoute(
        "actions/a/prerequisites/0/children",
      )!;
      expect(() => prerequisiteCollection([parent], [0])).toThrow("preserved");
      expect(() => itemPrerequisitesPatch(malformed, route, [])).toThrow(
        "preserved",
      );
      expect(malformed).toEqual(before);
    },
  );
  it("supports unresolved absent compound children but refuses nonexistent indices", () => {
    expect(prerequisiteCollection([{ kind: "all" }], [0]).entries).toEqual([]);
    expect(prerequisiteCollection([{ kind: "any" }], [0]).entries).toEqual([]);
    expect(prerequisiteCollection([{ kind: "not" }], [0]).entries).toEqual([]);
    for (const path of [[99], [-1], [0, 99], [0.5]])
      expect(() => prerequisiteCollection(roots, path)).toThrow("preserved");
  });
  it("creates compound values with canonical child fields", () => {
    expect(newActionPrerequisite("all")).toEqual({
      kind: "all",
      predicates: [],
    });
    expect(newActionPrerequisite("any")).toEqual({
      kind: "any",
      predicates: [],
    });
    expect(newActionPrerequisite("not")).toEqual({
      kind: "not",
      predicate: { kind: "always" },
    });
  });
});

describe("Choice Option prerequisite editing", () => {
  it.each([
    "actions/a",
    "traits/t/actions/a",
    "vehicle/actions/a",
    "actions/choices",
    "traits/prerequisites/actions/options",
    "actions/a%2Fb",
  ])("addresses nested Option structurally: %s", (path) => {
    const ownerPath = `${path}/choices/prerequisites/options/options%2Fmarked`;
    expect(
      parsePrerequisiteRoute(`${ownerPath}/prerequisites/0/children/1`),
    ).toMatchObject({
      entityPath: path,
      ownerPath,
      choiceId: "prerequisites",
      optionId: "options/marked",
      parentIndices: [0],
      prerequisiteIndex: "1",
      collectionPath:
        "choices/prerequisites/options/options%2Fmarked/prerequisites/0/children",
    });
    expect(
      parsePrerequisiteRoute(`${ownerPath}/prerequisites/new`)
        ?.prerequisiteIndex,
    ).toBe("new");
  });
  it.each([
    "choices/new/options/o/prerequisites",
    "choices/%6eew/options/o/prerequisites",
    "choices/c/options/%6eew/prerequisites",
    "choices/c/options/new/prerequisites",
    "choices/c/options/prerequisites",
    "choices/c/wrong/o/prerequisites",
    "choices/%ZZ/options/o/prerequisites",
    "choices/c/options/%ZZ/prerequisites",
    "choices/c/options/o/prerequisites/01",
    "choices/c/options/o/prerequisites/0/more",
    "choices/c/options/o/prerequisites/new/children",
  ])("rejects malformed Option route %s", (tail) => {
    expect(parsePrerequisiteRoute(`actions/a/${tail}`)).toBeUndefined();
  });
  it.each(["direct", "trait", "vehicle"])(
    "patches only %s Option subtree",
    (owner) => {
      const option = {
        id: "options/marked",
        label: "Complex option",
        value: { arbitrary: [1, { nested: true }] },
        private: { note: "secret" },
        prerequisites: [
          {
            kind: "all",
            extension: true,
            predicates: [
              { kind: "never" },
              { kind: "custom", payload: { keep: true } },
            ],
          },
        ],
      };
      const siblingOption = { id: "other", value: null };
      const choice = {
        id: "prerequisites",
        prompt: "Choose",
        optionCatalog: { id: "keep" },
        options: [option, siblingOption],
      };
      const siblingChoice = { id: "other-choice", options: [] };
      const selected = {
        ...action,
        components: {
          ...mechanicsObject(action.components),
          choices: [choice, siblingChoice],
        },
      };
      const actions = effectEntries([
        selected,
        { ...action, identity: { id: "other-action" } },
      ]);
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
      const actionPath =
        owner === "direct"
          ? "actions/a"
          : owner === "trait"
            ? "traits/t/actions/a"
            : "vehicle/actions/a";
      const route = parsePrerequisiteRoute(
        `${actionPath}/choices/prerequisites/options/options%2Fmarked/prerequisites/0/children`,
      )!;
      const before = structuredClone(components);
      const predicates: MechanicsObject[] = [
        { kind: "always" },
        {
          kind: "compare",
          operator: "eq",
          left: { kind: "constant", value: 2 },
          right: { kind: "constant", value: 2 },
        },
      ];
      const patch = itemPrerequisitesPatch(components, route, predicates);
      const expected = structuredClone(before);
      const expectedActions =
        owner === "direct"
          ? expected.actions
          : owner === "trait"
            ? mechanicsObject(
                (expected.traits as MechanicsObject[])[0].components,
              ).actions
            : mechanicsObject(expected.vehicle).actions;
      const choiceComponents = mechanicsObject(
        (expectedActions as MechanicsObject[])[0].components,
      );
      const target = (
        (choiceComponents.choices as MechanicsObject[])[0]
          .options as MechanicsObject[]
      )[0];
      (target.prerequisites as MechanicsObject[])[0].predicates = predicates;
      expect(patch).toEqual(expected);
      expect(components).toEqual(before);
    },
  );
  it.each([
    "missing-choice",
    "missing-option",
    "duplicate-choice",
    "duplicate-option",
    "reserved-option",
    "malformed-options",
  ])("rejects %s without falling back to Action", (kind) => {
    const options =
      kind === "malformed-options"
        ? {}
        : [
            { id: kind === "reserved-option" ? "new" : "o", value: null },
            ...(kind === "duplicate-option" ? [{ id: "o", value: null }] : []),
          ];
    const choices = [
      { id: "c", options },
      ...(kind === "duplicate-choice" ? [{ id: "c", options: [] }] : []),
    ];
    const components = {
      actions: [
        {
          ...action,
          components: { ...mechanicsObject(action.components), choices },
        },
      ],
    };
    const route = parsePrerequisiteRoute(
      `actions/a/choices/${kind === "missing-choice" ? "gone" : "c"}/options/${kind === "missing-option" ? "gone" : "o"}/prerequisites`,
    )!;
    const before = structuredClone(components);
    expect(() => itemPrerequisitesPatch(components, route, [])).toThrow();
    expect(components).toEqual(before);
  });
  it("clears Option prerequisites without clearing Action prerequisites", () => {
    const components = {
      actions: [
        {
          ...action,
          components: {
            ...mechanicsObject(action.components),
            choices: [
              {
                id: "c",
                options: [
                  {
                    id: "o",
                    value: false,
                    prerequisites: [{ kind: "always" }],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    const patch = itemPrerequisitesPatch(
      components,
      parsePrerequisiteRoute("actions/a/choices/c/options/o/prerequisites")!,
      [],
    );
    expect(patch.actions?.[0].components.prerequisites).toEqual(
      mechanicsObject(action.components).prerequisites,
    );
    expect(
      patch.actions?.[0].components.choices?.[0].options?.[0].prerequisites,
    ).toEqual([]);
  });
});

describe("Item-owned Trait prerequisites", () => {
  const trait: MechanicsObject = {
    identity: { id: "prerequisites/marked", name: "Prepared" },
    kind: "trait",
    private: { note: "Trait secret" },
    components: {
      prerequisites: [
        {
          kind: "all",
          private: { note: "ancestor" },
          predicates: [
            { kind: "custom", key: "homebrew:keep", payload: { x: 1 } },
            {
              kind: "not",
              private: { note: "nested" },
              predicate: { kind: "has-tag", subject: "actor", tag: "ready" },
            },
          ],
        },
        { kind: "never", private: { note: "root sibling" } },
      ],
      actions: [
        {
          ...action,
          components: {
            ...mechanicsObject(action.components),
            choices: [
              {
                id: "choice",
                options: [
                  {
                    id: "option",
                    label: "Keep",
                    prerequisites: [{ kind: "never" }],
                  },
                ],
              },
            ],
          },
        },
      ],
      grants: [{ key: "homebrew:grant", payload: { keep: true } }],
      modifiers: [{ private: { note: "modifier" } }],
      triggers: [{ private: { note: "trigger" } }],
    },
  };
  const sibling: MechanicsObject = {
    identity: { id: "sibling", name: "Untouched" },
    components: { prerequisites: [{ kind: "always" }] },
  };
  const components: MechanicsObject = {
    private: { note: "Item component secret" },
    traits: [trait, sibling],
    actions: [action],
    vehicle: { crew: 3, actions: [action] },
  };
  const path = "traits/prerequisites%2Fmarked";

  it.each(["traits/t", "traits/prerequisites", "traits/actions", path])(
    "addresses Trait structurally: %s",
    (entityPath) => {
      expect(
        parsePrerequisiteRoute(`${entityPath}/prerequisites/0/children/new`),
      ).toMatchObject({
        ownerKind: "trait",
        entityPath,
        ownerPath: entityPath,
        entity: {
          collection: "traits",
          childId: decodeURIComponent(entityPath.split("/")[1]),
        },
        parentIndices: [0],
        prerequisiteIndex: "new",
        collectionPath: "prerequisites/0/children",
      });
    },
  );
  it.each([
    "traits/new/prerequisites",
    "traits/%6eew/prerequisites",
    "traits/%ZZ/prerequisites",
    "traits/t/prerequisites/01",
    "traits/t/prerequisites/-1",
    "traits/t/prerequisites/1.5",
    "traits/t/prerequisites/new/children",
    "traits/t/prerequisites/0/children/9007199254740992",
    "traits/t/prerequisites/0/unexpected",
    "traits/t/prerequisites/0/children/new/children",
  ])("rejects unsafe Trait path %s", (value) => {
    expect(parsePrerequisiteRoute(value)).toBeUndefined();
  });
  it("resolves Trait components without changing Action or Option ownership", () => {
    const route = parsePrerequisiteRoute(`${path}/prerequisites`)!;
    expect(prerequisiteEntity(components, route)).toBe(trait);
    expect(prerequisiteOwner(trait, route)).toBe(trait.components);
    const actionRoute = parsePrerequisiteRoute(
      `${path}/actions/a/prerequisites`,
    )!;
    expect(actionRoute.ownerKind).toBe("action");
    expect(prerequisiteEntity(components, actionRoute).kind).toBe("action");
    const optionRoute = parsePrerequisiteRoute(
      `${path}/actions/a/choices/choice/options/option/prerequisites`,
    )!;
    expect(optionRoute.ownerKind).toBe("option");
    expect(
      prerequisiteOwner(
        prerequisiteEntity(components, optionRoute),
        optionRoute,
      ),
    ).toMatchObject({ id: "option" });
  });
  it("changes only the selected nested predicate preserving every ancestor and owned collection", () => {
    const before = structuredClone(components);
    const route = parsePrerequisiteRoute(
      `${path}/prerequisites/0/children/1/children`,
    )!;
    const next: MechanicsObject[] = [
      { kind: "has-definition", subject: "actor", definitionId: "target" },
    ];
    const patch = itemPrerequisitesPatch(components, route, next);
    const expected = structuredClone(components);
    const expectedTrait = effectEntries(expected.traits)[0];
    const expectedRoot = effectEntries(
      mechanicsObject(expectedTrait.components).prerequisites,
    )[0];
    effectEntries(expectedRoot.predicates)[1].predicate = next[0];
    expect(patch).toEqual({ traits: expected.traits });
    expect(components).toEqual(before);
  });
  it("reorders and clears only Trait prerequisites", () => {
    const route = parsePrerequisiteRoute(`${path}/prerequisites`)!;
    const original = effectEntries(
      mechanicsObject(trait.components).prerequisites,
    );
    const reordered = itemPrerequisitesPatch(
      components,
      route,
      moveEntry(original, 0, 1),
    );
    expect(reordered.traits?.[0].components).toEqual({
      ...mechanicsObject(trait.components),
      prerequisites: [original[1], original[0]],
    });
    expect(reordered.traits?.[1]).toBe(sibling);
    const removed = itemPrerequisitesPatch(components, route, []);
    expect(removed.traits?.[0].components).toEqual({
      ...mechanicsObject(trait.components),
      prerequisites: [],
    });
    expect(mechanicsObject(trait.components).prerequisites).toBe(original);
  });
  it.each([
    undefined,
    [],
    [null],
    [sibling],
    [trait, trait],
    [{ ...trait, identity: {} }],
    [{ ...trait, identity: { id: "new" } }],
  ])("blocks unavailable or ambiguous Trait collections %j", (traits) => {
    const source = traits === undefined ? {} : { traits };
    const route = parsePrerequisiteRoute(`${path}/prerequisites`)!;
    const before = structuredClone(source);
    expect(() =>
      itemPrerequisitesPatch(source as MechanicsObject, route, []),
    ).toThrow();
    expect(source).toEqual(before);
  });
  it("adds to an omitted prerequisites collection preserving the omission on the source", () => {
    const bare: MechanicsObject = {
      identity: { id: "t" },
      components: { actions: [action] },
    };
    const patch = itemPrerequisitesPatch(
      { traits: [bare] },
      parsePrerequisiteRoute("traits/t/prerequisites")!,
      [{ kind: "always" }],
    );
    expect(patch.traits?.[0].components).toEqual({
      actions: [action],
      prerequisites: [{ kind: "always" }],
    });
    expect(mechanicsObject(bare.components)).not.toHaveProperty(
      "prerequisites",
    );
  });
});

describe("Trait Choice Option prerequisites", () => {
  const path =
    "traits/choices%2Fsecret/choices/options%2Fsecret/options/prerequisites";
  const source: MechanicsObject = {
    traits: [
      {
        identity: { id: "choices/secret", name: "Chime" },
        components: {
          prerequisites: [{ kind: "never" }],
          actions: [action],
          private: { keep: true },
          choices: [
            {
              id: "options/secret",
              prompt: "Tone",
              options: [
                {
                  id: "prerequisites",
                  label: "Deep",
                  value: { keep: true },
                  prerequisites: [
                    {
                      kind: "not",
                      predicate: { kind: "always" },
                      private: true,
                    },
                  ],
                },
                { id: "other", value: false },
              ],
            },
          ],
        },
      },
      { identity: { id: "sibling" }, components: {} },
    ],
  };
  it("resolves an Option on a real Trait and patches only its nested prerequisites", () => {
    const route = parsePrerequisiteRoute(`${path}/prerequisites/0/children`)!;
    expect(route.ownerKind).toBe("option");
    expect(route.entity.collection).toBe("traits");
    expect(route.entityPath).toBe("traits/choices%2Fsecret");
    const entity = prerequisiteEntity(source, route);
    expect(prerequisiteOwner(entity, route).id).toBe("prerequisites");
    const before = structuredClone(source);
    const patch = itemPrerequisitesPatch(source, route, [{ kind: "never" }]);
    const expected = structuredClone(source);
    const trait = effectEntries(expected.traits)[0];
    const choice = effectEntries(mechanicsObject(trait.components).choices)[0];
    const option = effectEntries(choice.options)[0];
    effectEntries(option.prerequisites)[0].predicate = { kind: "never" };
    expect(patch).toEqual(expected);
    expect(source).toEqual(before);
  });
  it.each([
    "traits/new/choices/c/options/o/prerequisites",
    "traits/t/choices/new/options/o/prerequisites",
    "traits/t/choices/%6Eew/options/o/prerequisites",
    "traits/t/choices/c/options/new/prerequisites",
    "traits/t/choices/c/options/%6Eew/prerequisites",
    "traits/t/choices/c/options/o/prerequisites/-1",
  ])("blocks unsafe route %s", (path) =>
    expect(parsePrerequisiteRoute(path)).toBeUndefined(),
  );
  it("blocks a missing Option without mutating its Trait", () => {
    const route = parsePrerequisiteRoute(
      "traits/choices%2Fsecret/choices/options%2Fsecret/options/missing/prerequisites",
    )!;
    const before = structuredClone(source);
    expect(() => itemPrerequisitesPatch(source, route, [])).toThrow("Option");
    expect(source).toEqual(before);
  });
});

describe("Trait Modifier predicate editing", () => {
  const path = "traits/t/modifiers/m/predicate";
  const modifier: MechanicsObject = {
    id: "m",
    target: "armor",
    operation: "add",
    value: { kind: "constant", value: 2 },
    private: { secret: true },
    predicate: {
      kind: "all",
      predicates: [
        { kind: "always" },
        { kind: "not", predicate: { kind: "never" }, private: true },
      ],
      private: true,
    },
  };
  function fixture(predicateModifier = modifier): MechanicsObject {
    return {
      actions: [action],
      private: { keep: true },
      traits: [
        {
          identity: { id: "t", name: "Trait" },
          components: {
            modifiers: [
              predicateModifier,
              { id: "sibling", target: "speed", operation: "add" },
            ],
            actions: [action],
            prerequisites: [{ kind: "never" }],
            choices: [{ id: "choice", prompt: "Choose" }],
          },
          private: true,
        },
        { identity: { id: "other" }, components: {} },
      ],
    };
  }
  function savedModifier(patch: ReturnType<typeof itemPrerequisitesPatch>) {
    return mechanicsObject(
      effectEntries(
        mechanicsObject(
          effectEntries(mechanicsObject(patch).traits)[0].components,
        ).modifiers,
      )[0],
    );
  }
  it.each(["m", "predicate", "a%2Fb", "%70redicate"])(
    "resolves structural marker and encoded identity %s",
    (id) => {
      expect(
        parsePrerequisiteRoute(
          `traits/t/modifiers/${id}/predicate/0/children/new`,
        ),
      ).toMatchObject({
        ownerKind: "modifier",
        entityPath: "traits/t",
        ownerPath: `traits/t/modifiers/${id}`,
        modifierId: decodeURIComponent(id),
        parentIndices: [0],
        prerequisiteIndex: "new",
        collectionPath: `modifiers/${id}/predicate/0/children`,
      });
    },
  );
  it.each([
    "traits/new/modifiers/m/predicate",
    "traits/t/modifiers/new/predicate",
    "traits/t/modifiers/%6eew/predicate",
    "traits/t/modifiers/%ZZ/predicate",
    "traits/t/modifiers/m/prerequisites",
    `${path}/-1`,
    `${path}/0/children/01`,
    `${path}/0/more`,
  ])("rejects unsafe route %s", (value) =>
    expect(parsePrerequisiteRoute(value)).toBeUndefined(),
  );
  it("preserves all unrelated data while replacing a root predicate", () => {
    const components = fixture(),
      route = parsePrerequisiteRoute(path)!;
    const result = itemPrerequisitesPatch(components, route, [
      { kind: "has-tag", subject: "self", tag: "ready" },
    ]);
    const expected = fixture({
      ...modifier,
      predicate: { kind: "has-tag", subject: "self", tag: "ready" },
    });
    expect(result).toEqual({ traits: expected.traits });
    expect(components).toEqual(fixture());
  });
  it("removes the optional root without writing a prerequisites array", () => {
    const result = savedModifier(
      itemPrerequisitesPatch(fixture(), parsePrerequisiteRoute(path)!, []),
    );
    const expected = { ...modifier };
    delete expected.predicate;
    expect(result).toEqual(expected);
    expect(result).not.toHaveProperty("prerequisites");
  });
  it("adapts absence only on read and creates a single predicate", () => {
    const empty = { ...modifier };
    delete empty.predicate;
    const route = parsePrerequisiteRoute(path)!,
      components = fixture(empty),
      owner = prerequisiteOwner(prerequisiteEntity(components, route), route);
    expect(prerequisiteRoot(owner, route)).toEqual([]);
    expect(owner).not.toHaveProperty("predicate");
    expect(
      savedModifier(
        itemPrerequisitesPatch(components, route, [{ kind: "always" }]),
      ).predicate,
    ).toEqual({ kind: "always" });
  });
  it("rejects multiple roots", () =>
    expect(() =>
      itemPrerequisitesPatch(fixture(), parsePrerequisiteRoute(path)!, [
        { kind: "always" },
        { kind: "never" },
      ]),
    ).toThrow("one optional predicate"));
  it("edits nested children without losing ancestor extensions", () => {
    const result = savedModifier(
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute(`${path}/0/children/1/children`)!,
        [{ kind: "has-tag", subject: "self", tag: "ready" }],
      ),
    );
    expect(result.predicate).toEqual({
      kind: "all",
      predicates: [
        { kind: "always" },
        {
          kind: "not",
          predicate: { kind: "has-tag", subject: "self", tag: "ready" },
          private: true,
        },
      ],
      private: true,
    });
  });
  it("removes nested not child without removing the root", () => {
    const result = savedModifier(
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute(`${path}/0/children/1/children`)!,
        [],
      ),
    );
    expect(result.predicate).toEqual({
      kind: "all",
      predicates: [{ kind: "always" }, { kind: "not", private: true }],
      private: true,
    });
  });
  it.each([null, [], "bad"].map((predicate) => ({ predicate })))(
    "blocks malformed root $predicate",
    ({ predicate }) =>
      expect(() =>
        itemPrerequisitesPatch(
          fixture({ ...modifier, predicate }),
          parsePrerequisiteRoute(path)!,
          [],
        ),
      ).toThrow(),
  );
  it("preserves custom root extensions on explicit replacement", () => {
    expect(
      savedModifier(
        itemPrerequisitesPatch(
          fixture({
            ...modifier,
            predicate: { kind: "custom", payload: { private: true } },
          }),
          parsePrerequisiteRoute(path)!,
          [{ kind: "always" }],
        ),
      ),
    ).toEqual({ ...modifier, predicate: { kind: "always" } });
  });
  it.each(
    [
      [{ ...modifier, id: "new" }],
      [modifier, modifier],
      [{ ...modifier, id: 1 }],
    ].map((modifiers) => ({ modifiers })),
  )("blocks ambiguous or reserved identities", ({ modifiers }) => {
    const components: MechanicsObject = {
      traits: [{ identity: { id: "t" }, components: { modifiers } }],
    };
    expect(() =>
      itemPrerequisitesPatch(components, parsePrerequisiteRoute(path)!, []),
    ).toThrow();
  });
  it("blocks missing owner and out of range ancestor", () => {
    expect(() =>
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute("traits/t/modifiers/missing/predicate")!,
        [],
      ),
    ).toThrow("Modifier");
    expect(() =>
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute(`${path}/1/children`)!,
        [],
      ),
    ).toThrow("unavailable");
  });
});

describe("Trait Trigger predicate editing", () => {
  const path = "traits/t/triggers/0/predicate";
  const trigger: MechanicsObject = {
    event: "hit",
    effects: [{ kind: "narrative", text: "Keep" }],
    limit: { count: 2 },
    private: { keep: true },
    predicate: {
      kind: "all",
      private: true,
      predicates: [
        { kind: "always" },
        { kind: "not", private: true, predicate: { kind: "never" } },
      ],
    },
  };
  function fixture(value = trigger): MechanicsObject {
    return {
      actions: [action],
      private: true,
      traits: [
        {
          identity: { id: "t", name: "Trait" },
          private: true,
          components: {
            triggers: [value, { event: "miss", effects: [] }],
            actions: [action],
            modifiers: [{ id: "m", predicate: { kind: "never" } }],
            choices: [{ id: "c", options: [] }],
            grants: ["keep"],
          },
        },
        { identity: { id: "sibling" }, components: {} },
      ],
    };
  }
  function saved(patch: ReturnType<typeof itemPrerequisitesPatch>) {
    return effectEntries(
      mechanicsObject(
        effectEntries(mechanicsObject(patch).traits)[0].components,
      ).triggers,
    )[0];
  }
  it.each(["t", "predicate", "a%2Fb", "%70redicate"])(
    "resolves encoded Trait %s",
    (id) => {
      expect(
        parsePrerequisiteRoute(
          `traits/${id}/triggers/0/predicate/0/children/new`,
        ),
      ).toMatchObject({
        ownerKind: "trigger",
        entityPath: `traits/${id}`,
        ownerPath: `traits/${id}/triggers/0`,
        triggerIndex: 0,
        parentIndices: [0],
        prerequisiteIndex: "new",
        collectionPath: "triggers/0/predicate/0/children",
      });
    },
  );
  it.each(["new", "%6eew", "-1", "01", "1.5", "9007199254740992", "%ZZ"])(
    "rejects unsafe Trigger %s",
    (index) => {
      expect(
        parsePrerequisiteRoute(`traits/t/triggers/${index}/predicate`),
      ).toBeUndefined();
    },
  );
  it.each([
    "traits/new/triggers/0/predicate",
    "traits/t/triggers/0/prerequisites",
    `${path}/-1`,
    `${path}/0/children/01`,
    `${path}/0/extra`,
  ])("rejects unsafe path %s", (value) => {
    expect(parsePrerequisiteRoute(value)).toBeUndefined();
  });
  it("changes only the chosen predicate and preserves source", () => {
    const source = fixture();
    expect(
      itemPrerequisitesPatch(source, parsePrerequisiteRoute(path)!, [
        { kind: "has-tag", subject: "self", tag: "ready" },
      ]),
    ).toEqual({
      traits: fixture({
        ...trigger,
        predicate: { kind: "has-tag", subject: "self", tag: "ready" },
      }).traits,
    });
    expect(source).toEqual(fixture());
  });
  it("removes root by deleting the optional property", () => {
    const expected = { ...trigger };
    delete expected.predicate;
    expect(
      saved(
        itemPrerequisitesPatch(fixture(), parsePrerequisiteRoute(path)!, []),
      ),
    ).toEqual(expected);
  });
  it("leaves absence untouched when reading and adds one root", () => {
    const empty = { ...trigger };
    delete empty.predicate;
    const route = parsePrerequisiteRoute(path)!,
      source = fixture(empty);
    const owner = prerequisiteOwner(prerequisiteEntity(source, route), route);
    expect(prerequisiteRoot(owner, route)).toEqual([]);
    expect(owner).not.toHaveProperty("predicate");
    expect(
      saved(itemPrerequisitesPatch(source, route, [{ kind: "always" }]))
        .predicate,
    ).toEqual({ kind: "always" });
  });
  it("refuses a second root", () => {
    expect(() =>
      itemPrerequisitesPatch(fixture(), parsePrerequisiteRoute(path)!, [
        { kind: "always" },
        { kind: "never" },
      ]),
    ).toThrow("one optional predicate");
  });
  it("replaces nested children and preserves ancestor extensions", () => {
    expect(
      saved(
        itemPrerequisitesPatch(
          fixture(),
          parsePrerequisiteRoute(`${path}/0/children/1/children`)!,
          [{ kind: "has-tag", subject: "self", tag: "ready" }],
        ),
      ).predicate,
    ).toEqual({
      kind: "all",
      private: true,
      predicates: [
        { kind: "always" },
        {
          kind: "not",
          private: true,
          predicate: { kind: "has-tag", subject: "self", tag: "ready" },
        },
      ],
    });
  });
  it("removes only the nested not child", () => {
    expect(
      saved(
        itemPrerequisitesPatch(
          fixture(),
          parsePrerequisiteRoute(`${path}/0/children/1/children`)!,
          [],
        ),
      ).predicate,
    ).toEqual({
      kind: "all",
      private: true,
      predicates: [{ kind: "always" }, { kind: "not", private: true }],
    });
  });
  it.each([null, [], "bad"].map((predicate) => ({ predicate })))(
    "blocks malformed root $predicate",
    ({ predicate }) => {
      expect(() =>
        itemPrerequisitesPatch(
          fixture({ ...trigger, predicate }),
          parsePrerequisiteRoute(path)!,
          [],
        ),
      ).toThrow();
    },
  );
  it.each([null, [], "bad"].map((components) => ({ components })))(
    "blocks malformed Trait components",
    ({ components }) => {
      expect(() =>
        itemPrerequisitesPatch(
          { traits: [{ identity: { id: "t" }, components }] },
          parsePrerequisiteRoute(path)!,
          [],
        ),
      ).toThrow();
    },
  );
  it.each([null, {}, "bad", [null], ["bad"]].map((triggers) => ({ triggers })))(
    "blocks malformed Trigger collection",
    ({ triggers }) => {
      expect(() =>
        itemPrerequisitesPatch(
          { traits: [{ identity: { id: "t" }, components: { triggers } }] },
          parsePrerequisiteRoute(path)!,
          [],
        ),
      ).toThrow();
    },
  );
  it("blocks missing owner and out of range ancestor", () => {
    expect(() =>
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute("traits/t/triggers/5/predicate")!,
        [],
      ),
    ).toThrow("Trigger");
    expect(() =>
      itemPrerequisitesPatch(
        fixture(),
        parsePrerequisiteRoute(`${path}/1/children`)!,
        [],
      ),
    ).toThrow("unavailable");
  });
  it("preserves custom data unless explicitly replaced", () => {
    const custom = {
      ...trigger,
      predicate: { kind: "custom", payload: { private: true } },
    };
    const route = parsePrerequisiteRoute(path)!;
    expect(
      prerequisiteCollection(prerequisiteRoot(custom, route), []).entries,
    ).toEqual([custom.predicate]);
    expect(
      saved(
        itemPrerequisitesPatch(fixture(custom), route, [{ kind: "always" }]),
      ),
    ).toEqual({ ...trigger, predicate: { kind: "always" } });
  });
});

describe("Outcome singleton predicates", () => {
  const outcome: MechanicsObject = {
    id: "o/secret",
    private: { notes: "keep" },
    effects: [{ kind: "narrative", text: "Keep effect" }],
    when: {
      kind: "all",
      private: true,
      predicates: [
        { kind: "always" },
        { kind: "not", private: true, predicate: { kind: "never" } },
      ],
    },
  };
  const action = (value: MechanicsObject[string] = outcome) => ({
    identity: { id: "a/secret", name: "Strike" },
    private: true,
    components: {
      limit: { kind: "once-per-turn" },
      outcomes: [value, { id: "sibling", effects: [] }],
    },
  });
  const fixtures: { path: string; source: MechanicsObject }[] = [
    { path: "actions/a%2Fsecret", source: { actions: [action()] } },
    {
      path: "traits/t/actions/a%2Fsecret",
      source: {
        traits: [
          {
            identity: { id: "t" },
            components: { actions: [action()], grants: [] },
          },
        ],
      },
    },
    {
      path: "vehicle/actions/a%2Fsecret",
      source: { vehicle: { actions: [action()], armorClass: 10 } },
    },
  ];
  for (const { path, source } of fixtures) {
    const root = `${path}/outcomes/o%2Fsecret/predicate`;
    it(`routes and preserves ${path}`, () => {
      const route = parsePrerequisiteRoute(root)!;
      expect(route).toMatchObject({
        ownerKind: "outcome",
        outcomeId: "o/secret",
        entityPath: path,
        ownerPath: `${path}/outcomes/o%2Fsecret`,
        collectionPath: "outcomes/o%2Fsecret/predicate",
        parentIndices: [],
      });
      const before = structuredClone(source);
      const patched = mechanicsObject({
        ...source,
        ...itemPrerequisitesPatch(source, route, [
          { kind: "never", private: true },
        ]),
      });
      const updated = prerequisiteOwner(
        prerequisiteEntity(patched, route),
        route,
      );
      expect(updated).toEqual({
        ...outcome,
        when: { kind: "never", private: true },
      });
      expect(prerequisiteEntity(patched, route).components).toMatchObject({
        limit: { kind: "once-per-turn" },
        outcomes: [updated, { id: "sibling", effects: [] }],
      });
      expect(source).toEqual(before);
    });
    it(`removes and adds optional when on ${path}`, () => {
      const route = parsePrerequisiteRoute(root)!;
      const cleared = mechanicsObject({
        ...source,
        ...itemPrerequisitesPatch(source, route, []),
      });
      const owner = prerequisiteOwner(
        prerequisiteEntity(cleared, route),
        route,
      );
      expect(owner).not.toHaveProperty("when");
      expect(prerequisiteRoot(owner, route)).toEqual([]);
      const restored = mechanicsObject({
        ...cleared,
        ...itemPrerequisitesPatch(cleared, route, [{ kind: "always" }]),
      });
      expect(
        prerequisiteOwner(prerequisiteEntity(restored, route), route).when,
      ).toEqual({ kind: "always" });
    });
    it(`edits nested not on ${path}`, () => {
      const route = parsePrerequisiteRoute(`${root}/0/children/1/children`)!;
      const patched = mechanicsObject({
        ...source,
        ...itemPrerequisitesPatch(source, route, [
          { kind: "has-tag", subject: "self", tag: "ready" },
        ]),
      });
      expect(
        prerequisiteOwner(prerequisiteEntity(patched, route), route).when,
      ).toEqual({
        ...mechanicsObject(outcome.when),
        predicates: [
          { kind: "always" },
          {
            kind: "not",
            private: true,
            predicate: { kind: "has-tag", subject: "self", tag: "ready" },
          },
        ],
      });
      expect(() =>
        itemPrerequisitesPatch(source, parsePrerequisiteRoute(root)!, [
          { kind: "always" },
          { kind: "never" },
        ]),
      ).toThrow("one optional predicate");
    });
  }
  it.each([
    "actions/new/outcomes/o/predicate",
    "actions/a/outcomes/new/predicate",
    "actions/a/outcomes/%6eew/predicate",
    "actions/a/outcomes/%ZZ/predicate",
    "actions/a/outcomes/o/prerequisites",
    "actions/a/outcomes/o/predicate/-1",
    "actions/a/outcomes/o/predicate/0/children/01",
    "actions/a/outcomes/o/predicate/9007199254740992",
  ])("rejects unsafe route %s", (path) => {
    expect(parsePrerequisiteRoute(path)).toBeUndefined();
  });
  const route = parsePrerequisiteRoute(
    "actions/a%2Fsecret/outcomes/o%2Fsecret/predicate",
  )!;
  it.each([null, [], "bad"].map((when) => ({ when })))(
    "blocks malformed when $when",
    ({ when }) => {
      expect(() =>
        itemPrerequisitesPatch(
          { actions: [action({ ...outcome, when })] },
          route,
          [],
        ),
      ).toThrow();
    },
  );
  it.each([null, [], "bad"].map((components) => ({ components })))(
    "blocks malformed Action components $components",
    ({ components }) => {
      expect(() =>
        itemPrerequisitesPatch(
          { actions: [{ ...action(), components }] },
          route,
          [],
        ),
      ).toThrow("unsupported data");
    },
  );
  it.each(
    [
      null,
      {},
      "bad",
      [null],
      [{ id: "same" }, { id: "same" }],
      [{ id: "new" }],
    ].map((outcomes) => ({ outcomes })),
  )("blocks malformed Outcome collection", ({ outcomes }) => {
    expect(() =>
      itemPrerequisitesPatch(
        { actions: [{ ...action(), components: { outcomes } }] },
        route,
        [],
      ),
    ).toThrow();
  });
  it("blocks missing Outcome and preserves custom predicate until replacement", () => {
    expect(() =>
      itemPrerequisitesPatch(
        { actions: [action({ id: "missing" })] },
        route,
        [],
      ),
    ).toThrow("Outcome");
    const custom = {
      ...outcome,
      when: { kind: "custom", private: { secret: true } },
    };
    const source = { actions: [action(custom)] };
    expect(
      prerequisiteRoot(
        prerequisiteOwner(prerequisiteEntity(source, route), route),
        route,
      ),
    ).toEqual([custom.when]);
    expect(source.actions[0].components.outcomes[0]).toEqual(custom);
  });
});
