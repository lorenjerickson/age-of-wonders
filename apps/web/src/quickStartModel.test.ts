import { describe, expect, it } from "vitest";
import {
  parseQuickStartProgress,
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
  });

  it("scopes local progress by GM and ignores malformed values", () => {
    expect(quickStartStorageKey("  Game Master ")).toBe(
      quickStartStorageKey("game master"),
    );
    expect(quickStartStorageKey("game master")).not.toContain("game");
    expect([...parseQuickStartProgress("not json")]).toEqual([]);
    expect(
      [...parseQuickStartProgress('["choose-world","not-an-activity"]')],
    ).toEqual(["choose-world"]);
  });
});
