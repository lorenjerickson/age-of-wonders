import { describe, expect, it } from "vitest";
import {
  PRIMARY_NAVIGATION,
  primaryNavigationForPath,
  worldNavigationForPath,
} from "./gmNavigationModel";

describe("GM primary navigation", () => {
  it("contains exactly the five stable IA destinations", () => {
    expect(PRIMARY_NAVIGATION.map(({ label }) => label)).toEqual([
      "Home",
      "Worlds",
      "Campaigns",
      "Players",
      "Settings",
    ]);
    expect(PRIMARY_NAVIGATION.map(({ href }) => href)).toEqual([
      "/",
      "/worlds",
      "/campaigns",
      "/players",
      "/settings",
    ]);
  });

  it("selects a stable destination without inferring a recent record", () => {
    expect(
      primaryNavigationForPath("/worlds/world-internal/creatures")
        .filter(({ active }) => active)
        .map(({ label }) => label),
    ).toEqual(["Worlds"]);
    expect(
      primaryNavigationForPath("/campaigns/campaign-internal")
        .filter(({ active }) => active)
        .map(({ label }) => label),
    ).toEqual(["Campaigns"]);
  });
});

describe("World secondary navigation", () => {
  it("uses the five documented progressive-disclosure groups", () => {
    const groups = worldNavigationForPath(
      "world-internal",
      "/worlds/world-internal",
    );
    expect(groups.map(({ label }) => label)).toEqual([
      "Atlas",
      "Bestiary",
      "Item Compendium",
      "Characters",
      "Rules",
    ]);
    expect(groups.some(({ expanded }) => expanded)).toBe(false);
    expect(
      JSON.stringify(
        groups.map(({ label, children }) => ({
          label,
          children: children.map(({ label: childLabel, note }) => ({
            label: childLabel,
            note,
          })),
        })),
      ),
    ).not.toContain("world-internal");
  });

  it.each([
    ["/worlds/world-internal/atlas", "Atlas"],
    ["/worlds/world-internal/bestiary", "Bestiary"],
    ["/worlds/world-internal/item-compendium", "Item Compendium"],
    ["/worlds/world-internal/creatures", "Bestiary"],
    ["/worlds/world-internal/items/new", "Item Compendium"],
    ["/worlds/world-internal/characters", "Characters"],
    ["/worlds/world-internal/rules", "Rules"],
  ])("expands the active group for %s", (pathname, label) => {
    const groups = worldNavigationForPath("world-internal", pathname);
    expect(groups.find((group) => group.expanded)?.label).toBe(label);
    expect(groups.find((group) => group.active)?.label).toBe(label);
  });
});
