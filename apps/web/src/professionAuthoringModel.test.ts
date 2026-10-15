import { describe, expect, it } from "vitest";
import type { MechanicsObject } from "./itemMechanicsModel";
import {
  newProfessionRule,
  syncProfessionTierOrder,
} from "./professionAuthoringModel";
describe("Profession tier ownership", () => {
  const before: {
    expertiseOrder: string[];
    expertiseLevels: MechanicsObject[];
    future: MechanicsObject;
  } = {
    expertiseOrder: ["model:first", "model:second"],
    expertiseLevels: [
      { tier: "model:first", rank: 1, benefits: { future: { on: true } } },
      { tier: "model:second", rank: 2, benefits: {} },
    ],
    future: { preserve: true },
  };
  it("creates children with adopted rank keys, never fabricated rank identifiers", () => {
    expect(
      newProfessionRule("profession-tier", [
        { key: "adopted:exact", name: "Novice" },
      ]),
    ).toMatchObject({ tier: "adopted:exact" });
    expect(newProfessionRule("profession-acquisition")).toMatchObject({
      startingExpertise: "",
    });
  });
  it("reconciles rank order for intentional reorder, removal and rank changes without losing extensions", () => {
    const next = {
      ...before,
      expertiseLevels: [before.expertiseLevels[1], before.expertiseLevels[0]],
    };
    expect(syncProfessionTierOrder(before, next, ["expertiseLevels"])).toEqual({
      ...next,
      expertiseOrder: ["model:second", "model:first"],
    });
    expect(
      syncProfessionTierOrder(before, { ...before, expertiseLevels: [] }, [
        "expertiseLevels",
        "0",
      ]).expertiseOrder,
    ).toEqual([]);
    const renamed = {
      ...before,
      expertiseLevels: [
        { ...before.expertiseLevels[0], tier: "model:new" },
        before.expertiseLevels[1],
      ],
    };
    expect(
      syncProfessionTierOrder(before, renamed, ["expertiseLevels", "0"])
        .expertiseOrder,
    ).toEqual(["model:new", "model:second"]);
    expect(before.expertiseLevels[0].benefits).toEqual({
      future: { on: true },
    });
  });
  it("preserves existing rank order for unrelated nested saves or malformed and duplicate tiers", () => {
    const imported = {
      ...before,
      expertiseOrder: ["model:second", "model:first"],
    };
    const next = {
      ...imported,
      expertiseLevels: [
        { ...before.expertiseLevels[0], rank: 5 },
        before.expertiseLevels[1],
      ],
    };
    expect(
      syncProfessionTierOrder(imported, next, ["expertiseLevels", "0"]),
    ).toBe(next);
    expect(
      syncProfessionTierOrder(imported, next, [
        "expertiseLevels",
        "0",
        "benefits",
      ]),
    ).toBe(next);
    const duplicate = {
      ...before,
      expertiseLevels: [before.expertiseLevels[0], before.expertiseLevels[0]],
    };
    expect(() =>
      syncProfessionTierOrder(before, duplicate, ["expertiseLevels"]),
    ).toThrow("distinct available rank");
  });
});
