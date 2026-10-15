import { describe, expect, it } from "vitest";
import {
  type MechanicsObject,
  itemMechanicsSaveInput,
  mechanicsEntries,
  mechanicsObject,
  mechanicsName,
  mechanicsOwner,
  mechanicsPatch,
  newItemMechanic,
  parseMechanicsRoute,
} from "./itemMechanicsModel";
import {
  newUsageLimit,
  usageLimitKinds,
  withoutUsageField,
} from "./triggerUsageLimitModel";
const trait = {
  ...newItemMechanic(false, "t"),
  identity: {
    ...(newItemMechanic(false, "t").identity as object),
    name: "Hull",
  },
  components: {
    actions: [newItemMechanic(true, "a")],
    choices: [{ id: "existing" }],
  },
  extensions: { "homebrew:secret": { value: "retained" } },
};
const components = {
  traits: [trait, newItemMechanic(false, "other")],
  actions: [newItemMechanic(true, "direct")],
  vehicle: {
    vehicleType: "water",
    size: "large",
    speeds: { sail: { value: 30, unit: "foot" } },
    actions: [newItemMechanic(true, "vehicle-action")],
    unknown: "keep",
  },
};
describe("Item mechanics editing boundaries", () => {
  describe.each([
    "actions/direct",
    "traits/t/actions/a",
    "vehicle/actions/vehicle-action",
  ])("Action usage limits at %s", (path) => {
    it.each(usageLimitKinds)(
      "saves %s while retaining other Action rules and owner data",
      (kind) => {
        const route = parseMechanicsRoute(path)!;
        const original = mechanicsEntries(
          mechanicsOwner(components, route).actions,
        )[0];
        const originalComponents = {
          ...mechanicsObject(original.components),
          costs: [{ kind: "custom", handler: "keep" }],
          prerequisites: [{ kind: "never" }],
          private: { note: "private rules" },
        };
        const edited = {
          ...original,
          components: { ...originalComponents, limit: newUsageLimit(kind) },
        };
        const patch = mechanicsPatch(components, route, [edited]);
        const next = mechanicsObject({ ...components, ...patch });
        expect(mechanicsOwner(next, route).actions).toEqual([edited]);
        const cleared = {
          ...edited,
          components: withoutUsageField(edited.components, "limit"),
        };
        expect(cleared.components).toEqual(originalComponents);
        expect(Object.keys(patch)).toEqual([
          route.traitId
            ? "traits"
            : route.vehicleActions
              ? "vehicle"
              : "actions",
        ]);
        if (route.traitId) {
          expect(patch.traits?.[0].components.choices).toEqual(
            trait.components.choices,
          );
          expect(patch.traits?.[1]).toEqual(components.traits[1]);
        }
        if (route.vehicleActions)
          expect(patch.vehicle).toMatchObject({
            unknown: "keep",
            speeds: components.vehicle.speeds,
          });
      },
    );
  });
  it.each([null, [], "imported", 42])(
    "blocks malformed supplied owner data %j instead of normalizing it",
    (malformed) => {
      const traitRoute = parseMechanicsRoute("traits/t/actions/new")!;
      const vehicleRoute = parseMechanicsRoute("vehicle/actions/new")!;
      const brokenTrait = {
        ...components,
        traits: [{ ...trait, components: malformed }],
      };
      const brokenVehicle = { ...components, vehicle: malformed };
      expect(() => mechanicsOwner(brokenTrait, traitRoute)).toThrow();
      expect(() => mechanicsPatch(brokenTrait, traitRoute, [])).toThrow();
      expect(() => mechanicsOwner(brokenVehicle, vehicleRoute)).toThrow();
      expect(() => mechanicsPatch(brokenVehicle, vehicleRoute, [])).toThrow();
    },
  );
  it("replaces a Trait action without changing sibling traits or hidden rules", () => {
    const route = parseMechanicsRoute("traits/t/actions/a")!;
    expect(mechanicsOwner(components, route).actions).toEqual(
      trait.components.actions,
    );
    const replacement = {
      ...newItemMechanic(true, "a"),
      identity: {
        ...(newItemMechanic(true, "a").identity as object),
        name: "Revised",
      },
    };
    const patch = mechanicsPatch(components, route, [replacement]);
    expect(patch.traits?.[0]).toEqual({
      ...trait,
      components: { ...trait.components, actions: [replacement] },
    });
    expect(patch.traits?.[1]).toEqual(components.traits[1]);
    expect(Object.keys(patch)).toEqual(["traits"]);
    expect(components.traits[0]).toEqual(trait);
  });
  it("removes Vehicle actions without changing Vehicle data or Item actions", () => {
    expect(
      mechanicsPatch(components, parseMechanicsRoute("vehicle/actions")!, []),
    ).toEqual({ vehicle: { ...components.vehicle, actions: [] } });
  });
  it("preserves omission vs explicit clear operations", () => {
    expect(mechanicsPatch(components, { collection: "vehicle" }, null)).toEqual(
      { vehicle: null },
    );
    expect(mechanicsPatch(components, { collection: "traits" }, [])).toEqual({
      traits: [],
    });
  });
  it("rejects malformed identities and duplicates rather than erasing or editing the wrong child", () => {
    expect(() => mechanicsEntries([trait, trait])).toThrow("unique");
    expect(() => mechanicsEntries([{ identity: { id: 123 } }])).toThrow(
      "unique",
    );
    expect(() => mechanicsEntries([null])).toThrow("unsupported");
    expect(() =>
      mechanicsOwner(components, { collection: "actions", traitId: "missing" }),
    ).toThrow("no longer");
  });
  it("sends only the changed mechanics section with the exact captured revision", () => {
    const payload = {
      identity: { name: "Ship", description: "Private notes", tags: ["kept"] },
      kind: "item",
      modelValues: { "aow:item-family": "aow:vehicle" },
      components: {
        ...components,
        category: "vehicle",
        quality: "standard",
        equippable: { compatibleSlotSets: [["aow:slot"]] },
      },
    };
    const input = itemMechanicsSaveInput(payload, 7, { actions: [] });
    expect(input).toMatchObject({
      expectedStorageRevision: 7,
      name: "Ship",
      description: "Private notes",
      actions: [],
      compatibleEquipmentSlotSets: [["aow:slot"]],
    });
    expect(input).not.toHaveProperty("traits");
    expect(input).not.toHaveProperty("vehicle");
    expect(input).not.toHaveProperty("image");
  });
  it.each([
    { identity: { name: 4 } },
    { identity: { name: "Item", description: null } },
    { components: null },
    { components: { category: 4, quality: "standard" } },
    { components: { category: "tool", quality: null } },
    { components: { category: "tool", quality: "standard", equippable: null } },
    { components: { category: "tool", quality: "standard", equippable: [] } },
    {
      components: {
        category: "tool",
        quality: "standard",
        equippable: { private: true },
      },
    },
    {
      components: {
        category: "tool",
        quality: "standard",
        equippable: { compatibleSlotSets: [null] },
      },
    },
    {
      components: {
        category: "tool",
        quality: "standard",
        equippable: { compatibleSlotSets: [[5]] },
      },
    },
  ])("blocks coercive nested saves for malformed overview %j", (changes) => {
    const payload = {
      kind: "item",
      identity: { name: "Item" },
      modelValues: { "aow:item-family": "aow:tool" },
      components: { category: "tool", quality: "standard" },
      ...changes,
    } as MechanicsObject;
    const before = structuredClone(payload);
    expect(() => itemMechanicsSaveInput(payload, 1, { traits: [] })).toThrow(
      "preserved",
    );
    expect(payload).toEqual(before);
  });
  it("does not invent an omitted overview description for a nested mutation", () => {
    const input = itemMechanicsSaveInput(
      {
        kind: "item",
        identity: { name: "Item" },
        modelValues: { "aow:item-family": "aow:tool" },
        components: { category: "tool", quality: "standard" },
      },
      1,
      { traits: [] },
    );
    expect(input).not.toHaveProperty("description");
    expect(input.compatibleEquipmentSlotSets).toEqual([]);
  });
  it("uses canonical source metadata and rejects unsupported routes", () => {
    expect(newItemMechanic(true, "a")).toMatchObject({
      identity: { source: { namespace: "homebrew", edition: "1" } },
      components: { activation: "action", outcomes: [] },
    });
    expect(parseMechanicsRoute("vehicle/unknown")).toBeUndefined();
    expect(
      parseMechanicsRoute("traits/homebrew%3Atrait%2Fone/actions/action%20one"),
    ).toEqual({
      collection: "actions",
      traitId: "homebrew:trait/one",
      childId: "action one",
    });
    expect(parseMechanicsRoute("traits/%ZZ")).toBeUndefined();
    expect(parseMechanicsRoute("traits/t/actions/a/unknown")).toBeUndefined();
  });
});

describe("mechanics display names", () => {
  it.each([
    "550e8400-e29b-41d4-a716-446655440000",
    "Imported 550e8400-e29b-41d4-a716-446655440000 name",
    "abcdef0123456789abcdef0123",
    "trait-internal",
  ])("masks opaque or own identity names %s without mutating data", (name) => {
    const value = { identity: { id: "trait-internal", name } };
    expect(mechanicsName(value, "Trait")).toBe("Trait");
    expect(value.identity.name).toBe(name);
  });
  it("resolves friendly names and masks other known record references", () => {
    expect(
      mechanicsName({ identity: { id: "t", name: "Quiet wheels" } }, "Trait"),
    ).toBe("Quiet wheels");
    expect(
      mechanicsName(
        { identity: { name: "Reference: item-secret" } },
        "Trait",
        new Set(["item-secret"]),
      ),
    ).toBe("Trait");
  });
});
