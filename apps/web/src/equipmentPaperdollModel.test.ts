import { describe, expect, it } from "vitest";
import {
  clearEquipmentSlot,
  equipmentAtSlot,
  equipmentChoices,
  equipmentCombatSummary,
  equipmentSlotPosition,
  equipPaperdollItem,
  resolveEquipmentSlot,
  type EquipmentPaperdollItem,
} from "./equipmentPaperdollModel";
const slots = ["head", "main-hand", "off-hand", "chest"].map((name) => ({
  id: `aow:equipment-slot-${name}`,
  name,
}));
const main = slots[1].id,
  off = slots[2].id;
const item = (id: string, sets: string[][]): EquipmentPaperdollItem => ({
  id,
  name: id,
  compatibleSlotSets: sets,
});
describe("Equipment paperdoll atomic assignments", () => {
  it("treats legacy Belt assignments and compatibility as Waist occupancy", () => {
    const waistSlots = [{ id: "aow:equipment-slot-waist", name: "Waist" }];
    const saved = [{ slot: "belt", itemDefinitionId: "belt-item" }];
    expect(equipmentAtSlot(saved, waistSlots[0].id, waistSlots)).toEqual(saved);
    expect(resolveEquipmentSlot("aow:equipment-slot-belt", waistSlots)).toBe(
      waistSlots[0].id,
    );
    expect(
      equipmentChoices(
        item("belt-item", [["belt"]]),
        waistSlots[0].id,
        waistSlots,
        saved,
      ),
    ).toEqual([{ slots: [waistSlots[0].id], blocked: false }]);
    expect(clearEquipmentSlot(saved, waistSlots[0].id, waistSlots)).toEqual([]);
  });
  it("matches only exact core aliases and keeps unknown custom slots distinct", () => {
    expect(resolveEquipmentSlot("main-hand", slots)).toBe(main);
    expect(
      resolveEquipmentSlot(main, [{ id: "main-hand", name: "Main hand" }]),
    ).toBe("main-hand");
    expect(resolveEquipmentSlot("custom:main-hand", slots)).toBeUndefined();
    expect(
      equipmentSlotPosition({ id: "custom:head", name: "Head" }),
    ).toBeUndefined();
    expect(equipmentSlotPosition(slots[0])).toBeDefined();
  });
  it("replaces the selected item's entire multi-slot set without changing unrelated legacy or carried rows", () => {
    const carried = {
      slot: "carried",
      itemDefinitionId: "keepsake",
      private: true,
    };
    const helmet = { slot: "head", itemDefinitionId: "helmet", private: true };
    const equipment = [
      { slot: "main-hand", itemDefinitionId: "bow" },
      { slot: "off-hand", itemDefinitionId: "bow" },
      carried,
      helmet,
    ];
    const before = structuredClone(equipment);
    const next = equipPaperdollItem(
      equipment,
      main,
      slots,
      item("sword", [["main-hand"]]),
      [main],
    );
    expect(next).toEqual([
      carried,
      helmet,
      { slot: main, itemDefinitionId: "sword" },
    ]);
    expect(next[0]).toBe(carried);
    expect(equipment).toEqual(before);
    expect(clearEquipmentSlot(equipment, off, slots)).toEqual([
      carried,
      helmet,
    ]);
  });
  it("rejects implicit overwrites of another item's slots and partial multi-slot assignments", () => {
    const bow = item("bow", [["main-hand", "off-hand"]]);
    const equipment = [
      { slot: "main-hand", itemDefinitionId: "sword" },
      { slot: "off-hand", itemDefinitionId: "shield" },
    ];
    expect(equipmentChoices(bow, main, slots, equipment)).toEqual([
      { slots: [main, off], blocked: true },
    ]);
    expect(() =>
      equipPaperdollItem(equipment, main, slots, bow, [main, off]),
    ).toThrow("unavailable");
    expect(() => equipPaperdollItem([], main, slots, bow, [main])).toThrow(
      "unavailable",
    );
    expect(
      equipmentChoices(
        item("broken", [
          ["main-hand", "custom:missing"],
          ["main-hand", "main-hand"],
        ]),
        main,
        slots,
        [],
      ),
    ).toEqual([]);
  });
  it("moves only the explicitly equipped carried item into a complete canonical set", () => {
    const equipment = [
      { slot: "carried", itemDefinitionId: "bow" },
      { slot: "carried", itemDefinitionId: "book" },
    ];
    expect(
      equipPaperdollItem(
        equipment,
        main,
        slots,
        item("bow", [["main-hand", "off-hand"]]),
        [main, off],
      ),
    ).toEqual([
      { slot: "carried", itemDefinitionId: "book" },
      { slot: main, itemDefinitionId: "bow" },
      { slot: off, itemDefinitionId: "bow" },
    ]);
  });
  it("preserves ambiguous assignments until explicit clearing", () => {
    const equipment = [
      { slot: "main-hand", itemDefinitionId: "sword" },
      { slot: main, itemDefinitionId: "bow" },
      { slot: "off-hand", itemDefinitionId: "bow" },
    ];
    expect(equipmentAtSlot(equipment, main, slots)).toHaveLength(2);
    expect(
      equipmentChoices(item("new", [["main-hand"]]), main, slots, equipment)[0]
        .blocked,
    ).toBe(true);
    expect(clearEquipmentSlot(equipment, main, slots)).toEqual([]);
  });
});

describe("Equipment combat totals", () => {
  const dice = (count: number, size: number) => ({
    terms: [{ kind: "dice", count, size }],
  });
  it("counts armor once across slots, combines dice, and excludes carried items", () => {
    const armor = { ...item("armor", []), combat: { defense: dice(1, 4) } };
    const helm = { ...item("helm", []), combat: { defense: dice(2, 4) } };
    const result = equipmentCombatSummary(
      [
        { slot: "chest", itemDefinitionId: "armor" },
        { slot: "arms", itemDefinitionId: "armor" },
        { slot: "head", itemDefinitionId: "helm" },
        { slot: "carried", itemDefinitionId: "missing" },
      ],
      [armor, helm],
    );
    expect(result.defense).toBe("3d4");
    expect(result.resistance).toBe("0");
    expect(result.incomplete).toBe(false);
  });
  it("keeps weapon alternatives separate and applies additive shared modifiers once", () => {
    const sword = {
      ...item("sword", []),
      combat: {
        attack: dice(1, 4),
        damage: [{ amount: dice(1, 8), type: "slashing" }],
      },
    };
    const bow = {
      ...item("bow", []),
      combat: { damage: [{ amount: dice(2, 6), type: "piercing" }] },
    };
    const charm = {
      ...item("charm", []),
      combat: {
        modifiers: [
          {
            target: "combat.attack",
            operation: "add",
            value: { kind: "constant", value: 2 },
          },
          {
            target: "resistance",
            operation: "add",
            value: { kind: "literal", value: 3 },
            predicate: { kind: "always" },
          },
          { target: "resistance", operation: "subtract", value: 1 },
        ],
      },
    };
    const result = equipmentCombatSummary(
      [sword, bow, charm].map((i) => ({
        slot: "head",
        itemDefinitionId: i.id,
      })),
      [sword, bow, charm],
    );
    expect(result.weapons).toEqual([
      { name: "sword", attack: "1d4 +2", damage: "1d8 slashing" },
      { name: "bow", attack: "2", damage: "2d6 piercing" },
    ]);
    expect(result.resistance).toBe("2");
  });
  it("keeps opposing dice as independent rolls while constants cancel", () => {
    const charm = {
      ...item("charm", []),
      combat: {
        modifiers: [
          { target: "defense", operation: "add", value: dice(1, 6) },
          { target: "defense", operation: "subtract", value: dice(1, 6) },
          { target: "defense", operation: "add", value: 2 },
          { target: "defense", operation: "subtract", value: 2 },
        ],
      },
    };
    expect(
      equipmentCombatSummary(
        [{ slot: "head", itemDefinitionId: "charm" }],
        [charm],
      ).defense,
    ).toBe("1d6 −1d6");
  });
  it("reports unavailable, conditional, variable and non-additive sources without invented totals", () => {
    const charm = {
      ...item("charm", []),
      combat: {
        modifiers: [
          {
            target: "defense",
            operation: "add",
            value: 9,
            predicate: { kind: "has-tag" },
          },
          { target: "attack", operation: "multiply", value: 2 },
          {
            target: "resistance",
            operation: "add",
            value: 4,
            stacking: "highest",
          },
          {
            target: "damage",
            operation: "add",
            value: { kind: "attribute-score", attribute: "might" },
          },
          { target: "unrelated.defense", operation: "add", value: 100 },
        ],
      },
    };
    const result = equipmentCombatSummary(
      [
        { slot: "head", itemDefinitionId: "charm" },
        { slot: "chest", itemDefinitionId: "missing" },
      ],
      [charm],
    );
    expect([
      result.attack,
      result.defense,
      result.damage,
      result.resistance,
    ]).toEqual(["0", "0", "0", "0"]);
    expect(result.notes).toHaveLength(4);
    expect(result.incomplete).toBe(true);
  });
});
