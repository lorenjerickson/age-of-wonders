import { describe, expect, it } from "vitest";
import {
  parseItemOwnerRoute,
  resolveItemOwnerNode,
  replaceItemOwnerNode,
  newItemOwnerValue,
} from "./itemOwnerModel";
import type { MechanicsObject } from "./itemMechanicsModel";
const components: MechanicsObject = {
  category: "tool",
  quality: "fine",
  notes: "Keep private notes",
  extension: { custom: true },
  traits: [{ identity: { id: "t", name: "Legacy trait" } }],
  prerequisites: [
    {
      kind: "all",
      predicates: [
        { kind: "always" },
        { kind: "custom", payload: { secret: 1 } },
      ],
    },
  ],
  modifiers: [
    {
      id: "m",
      target: "hp",
      operation: "add",
      predicate: { kind: "not", predicate: { kind: "always" } },
    },
  ],
  attunement: {
    required: true,
    countsAgainstLimit: false,
    prerequisites: [{ kind: "always" }],
    private: true,
  },
  capacity: {
    maximum: { kind: "constant", value: 6 },
    recharge: { timing: "dawn", amount: { terms: [] }, extra: "keep" },
  },
  crafting: {
    time: { kind: "constant", value: 8 },
    toolProficiencies: ["smith", "jeweler"],
    ingredients: [
      {
        itemId: "iron",
        quantity: { kind: "constant", value: 2 },
        consumed: true,
        private: "keep",
      },
    ],
    produces: [{ itemId: "blade", quantity: { kind: "constant", value: 1 } }],
    extra: "keep",
  },
};
describe("Item owner authoring paths", () => {
  it("recognizes the owner entry and leaves existing mechanics routes alone", () => {
    expect(parseItemOwnerRoute("owner")?.segments).toEqual([]);
    expect(
      parseItemOwnerRoute("owner/crafting/ingredients/0")?.segments,
    ).toEqual(["crafting", "ingredients", "0"]);
    expect(parseItemOwnerRoute("traits/t/actions/a")).toBeUndefined();
  });
  it.each([
    "prerequisites/0/predicates/1",
    "modifiers/0/predicate/predicate",
    "attunement/prerequisites/0",
    "capacity",
    "crafting/ingredients/0",
    "crafting/produces/0",
    "crafting/toolProficiencies/1",
  ])("resolves saved %s without exposing identifiers", (path) => {
    const node = resolveItemOwnerNode(components, path.split("/"));
    expect(node.value).toBeDefined();
    expect(node.list).toBe(false);
    expect(node.labels.join(" ")).not.toContain("iron");
  });
  it("changes a nested quantity without dropping imported siblings, private fields or extensions", () => {
    const ingredient = {
      ...((components.crafting as MechanicsObject)
        .ingredients as MechanicsObject[]),
    }[0];
    const result = replaceItemOwnerNode(
      components,
      ["crafting", "ingredients", "0"],
      { ...ingredient, quantity: { kind: "level" } },
    );
    expect(result).toEqual({
      ...components,
      crafting: {
        ...(components.crafting as MechanicsObject),
        ingredients: [{ ...ingredient, quantity: { kind: "level" } }],
      },
    });
    expect(result.traits).toBe(components.traits);
    expect(components).not.toEqual(result);
  });
  it("adds omitted collections and removes optional fields without adding nulls", () => {
    expect(
      replaceItemOwnerNode(components, ["crafting", "cost", "new"], {
        denomination: "gp",
        amount: 5,
      }).crafting,
    ).toEqual({
      ...(components.crafting as MechanicsObject),
      cost: [{ denomination: "gp", amount: 5 }],
    });
    const result = replaceItemOwnerNode(components, ["capacity"], undefined);
    expect(result).not.toHaveProperty("capacity");
    expect(result.crafting).toBe(components.crafting);
  });
  it("edits and removes primitive proficiency entries preserving order", () => {
    expect(
      (
        replaceItemOwnerNode(
          components,
          ["crafting", "toolProficiencies", "0"],
          "carpenter",
        ).crafting as MechanicsObject
      ).toolProficiencies,
    ).toEqual(["carpenter", "jeweler"]);
    expect(
      (
        replaceItemOwnerNode(
          components,
          ["crafting", "toolProficiencies", "0"],
          undefined,
        ).crafting as MechanicsObject
      ).toolProficiencies,
    ).toEqual(["jeweler"]);
  });
  it.each([
    "__proto__",
    "crafting/constructor",
    "crafting/ingredients/-1",
    "crafting/ingredients/04",
    "crafting/ingredients/10",
    "crafting/ingredients/new/itemId",
    "capacity/maximum",
  ])("rejects an unsupported path %s", (path) => {
    expect(() =>
      replaceItemOwnerNode(components, path.split("/"), {}),
    ).toThrow();
  });
  it("blocks malformed imported collections and parents instead of replacing them", () => {
    expect(() =>
      resolveItemOwnerNode({ crafting: { ingredients: [null] } }, [
        "crafting",
        "ingredients",
      ]),
    ).toThrow(/preserved/);
    expect(() =>
      resolveItemOwnerNode({ capacity: "legacy" }, ["capacity"]),
    ).toThrow(/preserved/);
    expect(() =>
      resolveItemOwnerNode({ crafting: { toolProficiencies: [{}] } }, [
        "crafting",
        "toolProficiencies",
      ]),
    ).toThrow(/preserved/);
  });
  it("starts omitted objects with only their required fields", () => {
    expect(newItemOwnerValue("crafting")).toEqual({
      time: { kind: "constant", value: 0 },
      produces: [],
    });
    expect(newItemOwnerValue("attunement")).toEqual({ required: false });
    expect(newItemOwnerValue("capacity")).toEqual({
      maximum: { kind: "constant", value: 0 },
    });
  });
});
