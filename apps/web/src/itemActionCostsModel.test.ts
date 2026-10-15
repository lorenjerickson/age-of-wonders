import { describe, expect, it } from "vitest";
import {
  actionCostsPatch,
  isOpaqueItemBinding,
  newActionCost,
  parseCostRoute,
} from "./itemActionCostsModel";
import { effectEntries, moveEntry } from "./itemActionOutcomesModel";
import { type MechanicsObject } from "./itemMechanicsModel";
const action: MechanicsObject = {
  identity: { id: "a", name: "Action" },
  kind: "action",
  private: { note: "secret" },
  components: {
    activation: "action",
    outcomes: [{ id: "o", effects: [] }],
    costs: [{ kind: "custom", payload: { secret: true } }],
  },
};
describe("Action cost editing", () => {
  it.each([
    "actions/a",
    "traits/t/actions/a",
    "vehicle/actions/a",
    "actions/costs",
    "traits/costs/actions/costs",
    "actions/a%2Fb",
  ])("addresses owner structurally: %s", (path) => {
    expect(parseCostRoute(`${path}/costs/0`)).toMatchObject({
      actionPath: path,
      costIndex: "0",
    });
    expect(parseCostRoute(`${path}/costs/new`)?.costIndex).toBe("new");
  });
  it.each([
    "actions/new/costs",
    "actions/a/costs/-1",
    "actions/a/costs/01",
    "actions/a/costs/1.5",
    "actions/a/costs/nope",
    "actions/a/costs/0/more",
    "actions/%ZZ/costs",
    "actions/costs",
    "traits/t/costs",
  ])("rejects malformed route %s", (path) =>
    expect(parseCostRoute(path)).toBeUndefined(),
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
      const costs = [{ kind: "hit-die", amount: 2 }];
      const patch = actionCostsPatch(
        components,
        parseCostRoute(`${path}/costs`)!,
        costs,
      );
      const patched =
        owner === "direct"
          ? patch.actions
          : owner === "trait"
            ? patch.traits?.[0]?.components.actions
            : patch.vehicle?.actions;
      expect(patched).toEqual([
        { ...action, components: { ...(action.components as object), costs } },
        sibling,
      ]);
      if (owner === "trait")
        expect(patch.traits?.[0]).toMatchObject({
          private: { note: "keep" },
          components: { grants: ["keep"] },
        });
      if (owner === "vehicle") expect(patch.vehicle?.crew).toBe(3);
      expect(action.components).toMatchObject({ costs: [{ kind: "custom" }] });
    },
  );
  it("refuses missing Action and malformed collections without normalizing data", () => {
    const route = parseCostRoute("actions/a/costs")!;
    expect(() => actionCostsPatch({ actions: [] }, route, [])).toThrow(
      "no longer",
    );
    expect(() => effectEntries([null])).toThrow("preserved");
  });
  it("reorders advanced costs without changing expressions, IDs or private fields", () => {
    const values = [
      { kind: "capacity", band: "chosen", sourceId: "keep" },
      {
        kind: "resource",
        cost: {
          resource: "stamina",
          amount: { kind: "path", path: "actor.level" },
        },
      },
      { kind: "custom", key: "homebrew:x", payload: { secret: true } },
    ];
    expect(moveEntry(values, 0, 1)).toEqual([values[1], values[0], values[2]]);
  });
  it("does not materialize optional fields in new costs", () => {
    expect(newActionCost("economy")).toEqual({
      kind: "economy",
      activation: "action",
    });
    expect(newActionCost("item-use")).not.toHaveProperty("amount");
    expect(newActionCost("capacity")).not.toHaveProperty("sourceId");
    expect(newActionCost("resource")).toEqual({
      kind: "resource",
      cost: { resource: "", amount: { kind: "constant", value: 0 } },
    });
  });
  it("protects obvious imported identifiers while allowing authored bindings", () => {
    expect(isOpaqueItemBinding("123e4567-e89b-12d3-a456-426614174000")).toBe(
      true,
    );
    expect(
      isOpaqueItemBinding("item:123e4567-e89b-12d3-a456-426614174000"),
    ).toBe(true);
    expect(isOpaqueItemBinding("equipped.weapon")).toBe(false);
  });
});
