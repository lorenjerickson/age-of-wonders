import { describe, it, expect } from "vitest";
import {
  parseRuleNodeRoute,
  replaceRuleNode,
  resolveRuleNode,
  ruleOwner,
  ruleNodePatch,
} from "./ruleNodeModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
const effect = {
  kind: "branch",
  private: { keep: true },
  predicate: { kind: "always" },
  whenTrue: [{ kind: "narrative", text: "before" }],
  whenFalse: [{ kind: "narrative", text: "keep" }],
};
const root = {
  activation: "action",
  outcomes: [{ id: "outcome", private: true, effects: [effect] }],
  targets: [],
};
const action = { identity: { id: "a/id" }, components: root };
const fixtures: [string, MechanicsObject][] = [
  ["actions/a%2Fid", { actions: [action], private: true }],
  [
    "traits/t/actions/a%2Fid",
    {
      traits: [
        {
          identity: { id: "t" },
          components: { actions: [action], grants: ["keep"] },
        },
      ],
    },
  ],
  [
    "vehicle/actions/a%2Fid",
    { vehicle: { actions: [action], speeds: { keep: true } } },
  ],
];
describe("nested rule owner mutation", () => {
  for (const [path, source] of fixtures) {
    it(`changes exact branch child under ${path}`, () => {
      const route = parseRuleNodeRoute(
        `${path}/rule/outcomes/0/effects/0/whenTrue/0`,
      )!;
      const before = structuredClone(source);
      const updated = mechanicsObject({
        ...source,
        ...ruleNodePatch(source, route, { kind: "narrative", text: "after" }),
      });
      const owner = ruleOwner(updated, route);
      expect(
        resolveRuleNode(owner.root, owner.type, route.segments).value,
      ).toEqual({ kind: "narrative", text: "after" });
      expect(
        resolveRuleNode(owner.root, owner.type, [
          "outcomes",
          "0",
          "effects",
          "0",
          "whenFalse",
        ]).value,
      ).toEqual(effect.whenFalse);
      expect(
        resolveRuleNode(owner.root, owner.type, [
          "outcomes",
          "0",
          "effects",
          "0",
        ]).value,
      ).toMatchObject({ private: { keep: true } });
      expect(source).toEqual(before);
    });
    it(`adds/removes optional filters under ${path}`, () => {
      const route = parseRuleNodeRoute(`${path}/rule/targets/new`)!;
      const updated = mechanicsObject({
        ...source,
        ...ruleNodePatch(source, route, { kind: "creature" }),
      });
      const filters = parseRuleNodeRoute(`${path}/rule/targets/0/filters/new`)!;
      const saved = mechanicsObject({
        ...updated,
        ...ruleNodePatch(updated, filters, { kind: "never" }),
      });
      const owner = ruleOwner(saved, filters);
      expect(
        resolveRuleNode(owner.root, owner.type, ["targets", "0", "filters"])
          .value,
      ).toEqual([{ kind: "never" }]);
      const removal = parseRuleNodeRoute(`${path}/rule/targets/0/filters/0`)!;
      const cleared = mechanicsObject({
        ...saved,
        ...ruleNodePatch(saved, removal, undefined),
      });
      expect(
        resolveRuleNode(ruleOwner(cleared, removal).root, "action", [
          "targets",
          "0",
          "filters",
        ]).value,
      ).toEqual([]);
    });
  }
  it("mutates Trigger without changing siblings", () => {
    const source = {
      traits: [
        {
          identity: { id: "t" },
          components: {
            triggers: [
              { event: "hit", effects: [effect] },
              { event: "miss", effects: [] },
            ],
          },
        },
      ],
    };
    const route = parseRuleNodeRoute(
      "traits/t/triggers/0/rule/effects/0/predicate",
    )!;
    const updated = mechanicsObject({
      ...source,
      ...ruleNodePatch(source, route, { kind: "never" }),
    });
    expect(ruleOwner(updated, route).root).toMatchObject({
      effects: [{ predicate: { kind: "never" }, whenFalse: effect.whenFalse }],
    });
    expect(
      mechanicsObject(
        mechanicsObject((updated.traits as MechanicsObject[])[0]).components,
      ).triggers,
    ).toHaveLength(2);
  });
  it.each([
    "outcomes/0/effects/0/__proto__",
    "outcomes/00",
    "outcomes/-1",
    "outcomes/4",
    "outcomes/0/effects/0/whenTrue/new/invalid",
    "outcomes/0/effects/0/notAField",
  ])("blocks invalid path %s", (path) =>
    expect(() => resolveRuleNode(root, "action", path.split("/"))).toThrow(),
  );
  it("blocks duplicate Outcome identities", () =>
    expect(() =>
      resolveRuleNode(
        { ...root, outcomes: [root.outcomes[0], root.outcomes[0]] },
        "action",
        ["outcomes", "0"],
      ),
    ).toThrow());
  it("blocks malformed parent components", () => {
    const route = parseRuleNodeRoute("actions/a%2Fid/rule/targets")!;
    expect(() =>
      ruleNodePatch({ actions: [{ ...action, components: null }] }, route, []),
    ).toThrow();
  });
  it("removes optional singleton instead of writing undefined", () => {
    const route = parseRuleNodeRoute("actions/a%2Fid/rule/outcomes/0/when")!;
    const updated = mechanicsObject({
      actions: [action],
      ...ruleNodePatch({ actions: [action] }, route, undefined),
    });
    expect(
      resolveRuleNode(ruleOwner(updated, route).root, "action", [
        "outcomes",
        "0",
      ]).value,
    ).not.toHaveProperty("when");
  });
});

describe("catalog actor rule ownership", () => {
  it.each([
    "actions",
    "bonusActions",
    "reactions",
    "legendaryActions",
    "mythicActions",
    "lairActions",
  ])("preserves siblings editing %s", (collection) => {
    const source: MechanicsObject = {
      [collection]: [action, { ...action, identity: { id: "other" } }],
      private: { secret: true },
      skills: [{ skillDefinitionId: "skill", bonus: 2 }],
    };
    const path = [
      collection,
      "0",
      "components",
      "outcomes",
      "0",
      "effects",
      "0",
      "whenTrue",
      "0",
    ];
    const before = structuredClone(source);
    const next = replaceRuleNode(source, "monster", path, {
      kind: "narrative",
      text: "edited",
    });
    expect(resolveRuleNode(next, "monster", path).value).toEqual({
      kind: "narrative",
      text: "edited",
    });
    expect(source).toEqual(before);
    expect(next.skills).toEqual(source.skills);
    expect((next[collection] as unknown[])[1]).toEqual(
      (source[collection] as unknown[])[1],
    );
  });
  it("keeps Character defaults and private data when adding Choice prerequisites", () => {
    const source = {
      attributeDefaults: { "core:strength": 10 },
      private: true,
      choices: [
        {
          id: "choice",
          options: [{ id: "option", value: { custom: [1, 2] } }],
        },
      ],
    };
    const path = ["choices", "0", "options", "0", "prerequisites", "new"];
    const next = replaceRuleNode(source, "character-template", path, {
      kind: "always",
    });
    expect(next.attributeDefaults).toEqual(source.attributeDefaults);
    expect(next.private).toBe(true);
    expect(
      resolveRuleNode(next, "character-template", path.slice(0, -1)).value,
    ).toEqual([{ kind: "always" }]);
  });
  it("rejects malformed actor parent and unrelated owner paths", () => {
    expect(() =>
      resolveRuleNode(
        { actions: [{ identity: { id: "bad" }, components: null }] },
        "monster",
        ["actions", "0", "components", "outcomes"],
      ),
    ).toThrow();
    expect(() =>
      resolveRuleNode({ actions: [] }, "character-template", ["actions"]),
    ).toThrow();
  });
});

it("preserves malformed actor identity collections by blocking writes", () => {
  for (const actions of [[action, action], [{ ...action, kind: "custom" }]])
    expect(() =>
      resolveRuleNode({ actions }, "monster", ["actions", "0"]),
    ).toThrow();
});
