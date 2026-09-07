import { describe, expect, it } from "vitest";
import {
  QUICK_START_ACTIVITIES,
  quickStartKeyFromSearch,
  quickStartStorageKey,
  quickStartSuffix,
} from "./quickStartModel";

describe("Quick Start context", () => {
  it("accepts only canonical activity keys", () => {
    expect(quickStartKeyFromSearch("?quickStart=choose-world")).toBe(
      "choose-world",
    );
    expect(quickStartKeyFromSearch("?quickStart=unknown")).toBeUndefined();
    expect(quickStartSuffix("?quickStart=choose-world&ignored=yes")).toBe(
      "?quickStart=choose-world",
    );
    expect(quickStartKeyFromSearch("?quickStart=plan-session")).toBe(
      "plan-session",
    );
  });

  it("scopes local workspace preferences by GM", () => {
    expect(quickStartStorageKey("  Game Master ")).toBe(
      quickStartStorageKey("game master"),
    );
    expect(quickStartStorageKey("game master")).not.toContain("game");
  });

  it("uses versioned server-compatible activity definitions", () => {
    expect(QUICK_START_ACTIVITIES.every(({ revision }) => revision === 2)).toBe(
      true,
    );
    expect(QUICK_START_ACTIVITIES.every(({ steps }) => steps.length > 0)).toBe(
      true,
    );
  });
});
