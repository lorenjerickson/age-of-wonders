import { describe, expect, it } from "vitest";
import type { WorldDraftRecord } from "./api";
import {
  equipmentBonuses,
  worldEquipmentItems,
  worldEquipmentSlots,
} from "./worldEquipmentPresentation";

describe("World equipment presentation", () => {
  it("consolidates Belt and Waist support into one Waist slot", () => {
    expect(
      worldEquipmentSlots(
        ["aow:equipment-slot-belt", "aow:equipment-slot-waist"],
        [{ key: "aow:equipment-slot-waist", name: "Waist" }],
      ),
    ).toEqual([{ id: "aow:equipment-slot-waist", name: "Waist" }]);
  });
  it("projects artwork, description, compatibility and bonuses without changing saved items", () => {
    const records = [
      {
        resourceType: "definitions",
        sourceId: "item-secret",
        sourceRevision: 1,
        payload: {
          kind: "item",
          identity: { name: "Gloves", description: "Flexible steel scales" },
          image: { assetId: "image-secret" },
          components: {
            equippable: { compatibleSlotSets: [["hands"]] },
            armor: {
              defenseDice: { terms: [{ kind: "dice", count: 1, size: 2 }] },
            },
            modifiers: [
              {
                target: "health.maximum",
                operation: "add",
                value: { kind: "constant", value: 2 },
              },
            ],
          },
        },
      },
    ] as WorldDraftRecord[];
    const before = structuredClone(records);
    const result = worldEquipmentItems(records)[0];
    expect(result).toMatchObject({
      name: "Gloves",
      description: "Flexible steel scales",
      image: { assetId: "image-secret" },
      compatibleSlotSets: [["hands"]],
      bonuses: ["Defense: 1d2", "Health maximum: +2"],
    });
    expect(result.combat?.defense).toEqual({
      terms: [{ kind: "dice", count: 1, size: 2 }],
    });
    expect(result.combat?.modifiers?.[0]).toMatchObject({
      target: "health.maximum",
      operation: "add",
      value: { kind: "constant", value: 2 },
    });
    expect(records).toEqual(before);
  });
  it("uses neutral labels when references cannot be resolved", () => {
    expect(worldEquipmentSlots(["slot-secret"], [])).toEqual([
      { id: "slot-secret", name: "Equipment slot" },
    ]);
    expect(
      equipmentBonuses(
        {
          modifiers: [
            {
              sourceLabel: "item-secret",
              target: "item-secret",
              operation: "add",
              value: { kind: "constant", value: 1 },
            },
          ],
        },
        new Set(["item-secret"]),
      ),
    ).toEqual(["Item modifier: +1"]);
  });
});
