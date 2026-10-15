import { describe, expect, it } from "vitest";
import {
  grantEntries,
  traitGrantOwner,
  moveGrant,
  parseTraitGrantRoute,
  traitGrantsPatch,
} from "./itemTraitGrantsModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import type { WorldDraftRecord } from "./api";

describe("Trait grant routes", () => {
  it("retains encoded Trait identities with ordinal grant paths", () => {
    const route = parseTraitGrantRoute("traits/grants%2Fsecret/grants/0")!;
    expect(route.trait.childId).toBe("grants/secret");
    expect(route.traitPath).toBe("traits/grants%2Fsecret");
    expect(route.grantIndex).toBe("0");
    expect(parseTraitGrantRoute("traits/t/grants")?.grantIndex).toBeUndefined();
    expect(parseTraitGrantRoute("traits/t/grants/new")?.grantIndex).toBe("new");
  });
  it.each([
    "actions/a/grants",
    "traits/new/grants",
    "traits/%6eew/grants",
    "traits/%/grants",
    "traits/t/actions/a/grants",
    "traits/t/grants/0/children",
    "traits/t/grants/%",
    "traits/t/grants/-1",
    "traits/t/grants/01",
    "traits/t/grants/1.5",
    "traits/t/grants/a",
    "traits/t/grants/9007199254740992",
  ])("rejects unsafe routes %s", (path) =>
    expect(parseTraitGrantRoute(path)).toBeUndefined(),
  );
});
describe("Trait grant preservation", () => {
  it.each(
    [null, {}, [null], [1], ["a", {}], [{ id: "a" }]].map((value) => ({
      value,
    })),
  )("blocks malformed collections $value", ({ value }) =>
    expect(() => grantEntries(value)).toThrow(),
  );
  it("reads optional grants without creating them and preserves unknown, empty and duplicate strings", () => {
    const components: MechanicsObject = {};
    expect(grantEntries(components.grants)).toEqual([]);
    expect(components).toEqual({});
    const grants = ["missing", "", "missing"];
    expect(grantEntries(grants)).toEqual(grants);
  });
  it("patches only the selected Trait grants and preserves other rules/private fields", () => {
    const original: MechanicsObject = {
      traits: [
        {
          identity: { id: "t", name: "Chime" },
          private: { secret: true },
          components: {
            grants: ["old", "old", "unknown"],
            actions: [{ private: true }],
            choices: [{ private: true }],
            modifiers: [{ private: true }],
            prerequisites: [{ kind: "always" }],
            triggers: [{ private: true }],
            extension: { secret: true },
          },
        },
        { identity: { id: "sibling" }, components: { grants: ["keep"] } },
      ],
      actions: [{ private: true }],
      vehicle: { private: true },
    };
    const before = structuredClone(original),
      route = parseTraitGrantRoute("traits/t/grants/1")!;
    const traits = original.traits as MechanicsObject[],
      components = mechanicsObject(traits[0].components);
    const patch = traitGrantsPatch(original, route, [
      "old",
      "replacement",
      "unknown",
    ]);
    expect(Object.keys(patch)).toEqual(["traits"]);
    expect(patch.traits?.[0]).toEqual({
      ...traits[0],
      components: { ...components, grants: ["old", "replacement", "unknown"] },
    });
    expect(patch.traits?.[1]).toEqual(traits[1]);
    expect(original).toEqual(before);
    expect(
      traitGrantsPatch(original, route, []).traits?.[0].components.grants,
    ).toEqual([]);
  });
  it.each(
    [
      [],
      [{ identity: { id: "other" } }],
      [{ identity: { id: "t" } }, { identity: { id: "t" } }],
      [{ identity: { id: "new" } }],
    ].map((traits) => ({ traits })),
  )("blocks missing/ambiguous owners $traits", ({ traits }) =>
    expect(() =>
      traitGrantsPatch(
        { traits },
        parseTraitGrantRoute("traits/t/grants")!,
        [],
      ),
    ).toThrow(),
  );
  it("orders duplicate grants by position without mutating their source", () => {
    const source = ["a", "a", "b"];
    expect(moveGrant(source, 1, 1)).toEqual(["a", "b", "a"]);
    expect(moveGrant(source, 0, -1)).toEqual(source);
    expect(moveGrant(source, 2, 1)).toEqual(source);
    expect(source).toEqual(["a", "a", "b"]);
  });
  it("shares named definition choices using persisted source identity and neutral fallbacks", () => {
    const records = [
      {
        resourceType: "definitions",
        sourceId: "one",
        payload: { kind: "trait", identity: { id: "different", name: "Gift" } },
      },
      {
        resourceType: "definitions",
        sourceId: "two",
        payload: { kind: "trait", identity: { name: "Gift" } },
      },
      {
        resourceType: "definitions",
        sourceId: "hidden",
        payload: { kind: "trait", identity: { name: "secret hidden" } },
      },
      {
        resourceType: "locations",
        sourceId: "location",
        payload: { identity: { name: "Elsewhere" } },
      },
    ] as unknown as WorldDraftRecord[];
    expect(prerequisiteDefinitionOptions(records)).toEqual([
      { id: "one", label: "Gift · Trait (1)" },
      { id: "two", label: "Gift · Trait (2)" },
      { id: "hidden", label: "Unnamed definition · Trait" },
    ]);
  });
});

describe("Trait grant owner shape", () => {
  it.each([null, [], "invalid", 1, false].map((value) => ({ value })))(
    "preserves and blocks supplied malformed Trait components $value",
    ({ value }) => {
      const components: MechanicsObject = {
        traits: [{ identity: { id: "t" }, components: value }],
      };
      const original = structuredClone(components),
        route = parseTraitGrantRoute("traits/t/grants/new")!;
      expect(() => traitGrantOwner(components, route)).toThrow(
        "cannot be edited safely",
      );
      expect(() => traitGrantsPatch(components, route, ["grant"])).toThrow(
        "cannot be edited safely",
      );
      expect(components).toEqual(original);
    },
  );
  it("allows absent Trait components to be initialized only by an edit", () => {
    const components: MechanicsObject = { traits: [{ identity: { id: "t" } }] };
    const route = parseTraitGrantRoute("traits/t/grants/new")!;
    expect(traitGrantOwner(components, route).grants).toEqual([]);
    expect(components.traits).toEqual([{ identity: { id: "t" } }]);
    expect(
      traitGrantsPatch(components, route, ["grant"]).traits?.[0].components,
    ).toEqual({ grants: ["grant"] });
  });
});
