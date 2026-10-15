import { describe, expect, it } from "vitest";
import {
  parseCombatTerms,
  reorderCombatActivities,
} from "./sessionCombatModel";
import type { CombatActivity } from "@aow/common";
describe("combat declaration helpers", () => {
  it("retains independent signed dice and explicit zero contributions", () => {
    expect(parseCombatTerms("1d20 + 2 - 1d4")).toEqual([
      { kind: "dice", count: 1, sides: 20, sign: 1 },
      { kind: "constant", value: 2 },
      { kind: "dice", count: 1, sides: 4, sign: -1 },
    ]);
    expect(parseCombatTerms("0")).toEqual([{ kind: "constant", value: 0 }]);
  });
  it.each(["", " ", "2.5", "1d0", "101d6", "2 +", "Infinity"])(
    "rejects incomplete or unsupported formula %s",
    (value) => expect(() => parseCombatTerms(value)).toThrow(),
  );
  it("reorders declarations without changing their content or original array", () => {
    const activities: CombatActivity[] = [
      { id: "move", name: "Move", kind: "move", path: [{ x: 1, y: 1 }] },
      { id: "return", name: "Return", kind: "move", path: [{ x: 0, y: 0 }] },
    ];
    expect(
      reorderCombatActivities(activities, 1, -1).map((a) => a.name),
    ).toEqual(["Return", "Move"]);
    expect(activities.map((a) => a.name)).toEqual(["Move", "Return"]);
    expect(reorderCombatActivities(activities, 0, -1)).toEqual(activities);
  });
});
