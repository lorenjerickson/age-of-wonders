import { describe, expect, it } from "vitest";
import {
  actionOutcomesPatch,
  effectEntries,
  moveEntry,
  newRuleEffect,
  outcomeEntries,
  parseOutcomeRoute,
} from "./itemActionOutcomesModel";
import { type MechanicsObject } from "./itemMechanicsModel";
const action: MechanicsObject = {
  identity: { id: "a", name: "Action" },
  kind: "action",
  private: { note: "secret" },
  components: {
    activation: "action",
    outcomes: [{ id: "old", effects: [] }],
    costs: [{ kind: "custom" }],
  },
};
describe("Item Action outcome editing", () => {
  it.each([
    "actions/a",
    "traits/t/actions/a",
    "vehicle/actions/a",
    "actions/outcomes",
    "traits/outcomes/actions/outcomes",
  ])("addresses all existing owners: %s", (path) => {
    const route = parseOutcomeRoute(`${path}/outcomes/o/effects/0`)!;
    expect(route.actionPath).toBe(path);
    expect(route.outcomeId).toBe("o");
    expect(route.effectIndex).toBe("0");
  });
  it.each([
    "actions/new/outcomes",
    "actions/a/outcomes/o/effects/-1",
    "actions/a/outcomes/o/effects/01",
    "actions/a/outcomes/o/other",
    "actions/a/outcomes/%ZZ",
  ])("rejects malformed route %s", (path) =>
    expect(parseOutcomeRoute(path)).toBeUndefined(),
  );
  it("preserves private fields, unexposed mechanics and sibling Actions", () => {
    const sibling = { ...action, identity: { id: "other" } };
    const components: MechanicsObject = {
      actions: [action, sibling],
      private: { secret: true },
    };
    const patch = actionOutcomesPatch(
      components,
      parseOutcomeRoute("actions/a/outcomes")!,
      [{ id: "new-outcome", effects: [] }],
    );
    expect(patch.actions?.[0]).toEqual({
      ...action,
      components: {
        ...(action.components as object),
        outcomes: [{ id: "new-outcome", effects: [] }],
      },
    });
    expect(patch.actions?.[1]).toEqual(sibling);
    expect((components.actions as MechanicsObject[])[0]).toEqual(action);
  });
  it.each(["trait", "vehicle"])(
    "patches nested %s owner without losing siblings",
    (owner) => {
      const components: MechanicsObject =
        owner === "trait"
          ? {
              traits: [
                {
                  identity: { id: "t" },
                  components: { actions: [action], grants: ["keep"] },
                },
              ],
            }
          : {
              vehicle: {
                actions: [action],
                speeds: { walk: { value: 10, unit: "foot" } },
                crew: 3,
              },
            };
      const route = parseOutcomeRoute(
        `${owner === "trait" ? "traits/t" : "vehicle"}/actions/a/outcomes`,
      )!;
      const patch = actionOutcomesPatch(components, route, []);
      if (owner === "trait")
        expect(patch.traits?.[0]?.components).toEqual({
          actions: [
            {
              ...action,
              components: { ...(action.components as object), outcomes: [] },
            },
          ],
          grants: ["keep"],
        });
      else
        expect(patch.vehicle).toMatchObject({
          crew: 3,
          speeds: { walk: { value: 10, unit: "foot" } },
          actions: [{ components: { outcomes: [] } }],
        });
    },
  );
  it("retains advanced Effects and predicates during ordering", () => {
    const outcomes = [
      {
        id: "a",
        when: { kind: "custom", reference: "rule" },
        effects: [{ kind: "custom", payload: { secret: true } }],
      },
      { id: "b", effects: [] },
    ];
    expect(moveEntry(outcomes, 0, 1)).toEqual([outcomes[1], outcomes[0]]);
    expect(outcomes[0]?.id).toBe("a");
    expect(effectEntries(outcomes[0]?.effects)).toEqual(outcomes[0]?.effects);
  });
  it("refuses ambiguous imported identities without modifying them", () => {
    const values = [
      { id: "same", effects: [] },
      { id: "same", effects: [] },
    ];
    expect(() => outcomeEntries(values)).toThrow("unique identities");
    expect(values).toHaveLength(2);
    expect(() => effectEntries([null])).toThrow("preserved");
  });
  it("omits optional booleans and visibility in new Effects", () => {
    expect(newRuleEffect("heal")).not.toHaveProperty("upToMaximum");
    expect(newRuleEffect("move")).not.toHaveProperty("forced");
    expect(newRuleEffect("narrative")).not.toHaveProperty("visibility");
  });
});
