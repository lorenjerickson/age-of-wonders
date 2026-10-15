import { describe, expect, it } from "vitest";
import { astraModifier, formatAstraModifier } from "./astraModifiers";
describe("Astra score modifiers", () => {
  it.each([
    [50, 0],
    [55, 1],
    [45, -1],
    [33, -2],
    [83, 3],
    [54, 0],
    [46, 0],
    [65, 2],
    [35, -2],
    [0, -5],
    [100, 5],
  ])("maps score %s to modifier %s", (score, expected) => {
    expect(astraModifier(score)).toBe(expected);
  });
  it("formats positive, neutral and negative modifiers", () => {
    expect(formatAstraModifier(55)).toBe("+1");
    expect(formatAstraModifier(46)).toBe("0");
    expect(formatAstraModifier(45)).toBe("-1");
  });
});
