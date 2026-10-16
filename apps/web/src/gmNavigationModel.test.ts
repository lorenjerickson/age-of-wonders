import { worldNavigationCounts } from "./gmNavigationModel";
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
      primaryNavigationForPath("/worlds/world-internal/bestiary")
        .filter(({ active }) => active)
        .map(({ label }) => label),
    ).toEqual(["Worlds"]);
    expect(
      primaryNavigationForPath("/campaigns/campaign-internal")
        .filter(({ active }) => active)
        .map(({ label }) => label),
    ).toEqual(["Campaigns"]);
  });

  it("keeps installation Settings separate from ordinary GM authority", () => {
    expect(
      primaryNavigationForPath("/worlds", {
        gm: true,
        systemAdministrator: false,
      }).map(({ label }) => label),
    ).not.toContain("Settings");
    expect(
      primaryNavigationForPath("/settings", {
        gm: false,
        systemAdministrator: true,
      }).map(({ label }) => label),
    ).toEqual(["Settings"]);
  });
});

describe("World secondary navigation", () => {
  it("exposes editable destinations as a flat list", () => {
    const items = worldNavigationForPath(
      "world-internal",
      "/worlds/world-internal",
    );
    expect(items.map(({ label }) => label)).toEqual([
      "Atlas",
      "Bestiary",
      "Characters",
      "Codex",
      "Backgrounds",
      "Conditions",
      "Effects",
      "Professions",
      "Skills",
      "Items",
      "Overview",
      "Rules",
    ]);
    expect(
      items.filter(({ active }) => active).map(({ label }) => label),
    ).toEqual(["Overview"]);
    expect(items.every((item) => !("children" in item))).toBe(true);
  });

  it.each([
    ["atlas/locations/location/map", "Atlas"],
    ["bestiary/creatures/creature", "Bestiary"],
    ["item-compendium/items/item", "Items"],
    ["characters/skills/skill", "Skills"],
    ["characters/professions/profession", "Professions"],
    ["characters/backgrounds/background", "Backgrounds"],
    ["characters/models", "Rules"],
    ["characters/model/attributes/attribute", "Rules"],
    ["rules", "Rules"],
    ["versions/draft/review", "Overview"],
  ])("selects exactly the owning destination for %s", (path, label) => {
    expect(
      worldNavigationForPath("world-internal", `/worlds/world-internal/${path}`)
        .filter(({ active }) => active)
        .map(({ label }) => label),
    ).toEqual([label]);
  });

  it("encodes the world identifier only in URLs", () => {
    const items = worldNavigationForPath(
      "world/secret",
      "/worlds/world%2Fsecret/atlas",
    );
    expect(items.find(({ active }) => active)?.label).toBe("Atlas");
    expect(
      items.every(({ href }) => href.startsWith("/worlds/world%2Fsecret")),
    ).toBe(true);
    expect(items.map(({ label }) => label).join(" ")).not.toContain("secret");
  });
});

it("counts all Atlas locations and only current Codex collections", () => {
  expect(
    worldNavigationCounts([
      { resourceType: "locations", payload: {} },
      { resourceType: "locations", payload: {} },
      ...["item", "creature", "profession", "skill", "background"].map(
        (kind) => ({ resourceType: "definitions", payload: { kind } }),
      ),
      ...[
        "world-conditions",
        "world-effects",
        "world-rules",
        "world-character-templates",
      ].map((resourceType) => ({ resourceType, payload: {} })),
    ]),
  ).toEqual({ locations: 2, codex: 5 });
});
