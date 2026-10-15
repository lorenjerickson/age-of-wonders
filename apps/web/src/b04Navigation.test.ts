import { describe, expect, it } from "vitest";
import { contextualNavigationStack } from "./contextualNavigationModel";
const locationId = "893d3d45-bb94-4f1a-aa12-aa123f911982";
const claimId = "d34f11d0-5f4a-4f13-8984-00699830e5ec";
const data = {
  worldName: "Coast",
  records: [
    {
      resourceType: "locations",
      sourceId: locationId,
      payload: {
        name: "Harbor",
        placement: { kind: "root" },
        discoveries: [{ id: claimId, statement: "The tide hides a passage" }],
      },
    },
    {
      resourceType: "world-placements",
      sourceId: "placement-private",
      payload: { name: "Night watch" },
    },
    {
      resourceType: "world-rules",
      sourceId: "rule-private",
      payload: { name: "Difficult footing" },
    },
  ],
  modelElements: [{ elementId: "element-private", name: "Agility" }],
};
describe("B04 dedicated collection navigation", () => {
  it.each([
    [
      `/worlds/world/atlas/locations/${locationId}/discoveries/entry-${claimId}`,
      ["Harbor", "Discoveries", "The tide hides a passage"],
    ],
    [
      `/worlds/world/atlas/locations/${locationId}/creatures/entry-placement-private`,
      ["Harbor", "Creatures", "Night watch"],
    ],
    [
      "/worlds/world/characters/model/attributes/element-private",
      ["Attributes", "Agility"],
    ],
    [
      "/worlds/world/rules/rule-private/effects/2/edit",
      ["World rules", "Difficult footing", "Effects", "Effect 2"],
    ],
    [
      "/worlds/world/rules/rule-private/conditions/children/1/edit",
      [
        "World rules",
        "Difficult footing",
        "Conditions",
        "Condition 1",
        "Edit condition",
      ],
    ],
  ])("reconstructs named ancestry for %s", (path, expected) => {
    const stack = contextualNavigationStack(path as string, data);
    expect(
      stack.slice(-(expected as string[]).length).map((s) => s.label),
    ).toEqual(expected);
    expect(stack.map((s) => s.label).join(" ")).not.toMatch(
      /private|893d3d45|d34f11d0/,
    );
  });
  it("uses neutral labels for unresolved and opaque names", () => {
    const bad = {
      ...data,
      modelElements: [
        { elementId: "element-private", name: "element-private" },
      ],
    };
    expect(
      contextualNavigationStack(
        "/worlds/world/characters/model/attributes/element-private",
        bad,
      ).at(-1)?.label,
    ).toBe("Model element");
    expect(
      contextualNavigationStack(
        `/worlds/world/atlas/locations/${locationId}/discoveries/unknown`,
        data,
      ).at(-1)?.label,
    ).toBe("Discovery");
  });
  it("keeps existing Location map and Model list navigation unchanged", () => {
    expect(
      contextualNavigationStack(
        `/worlds/world/atlas/locations/${locationId}/map`,
        data,
      ).at(-1)?.label,
    ).toBe("Harbor");
    expect(
      contextualNavigationStack(
        "/worlds/world/characters/model/attributes/effective",
        data,
      ).at(-1)?.kind,
    ).toBe("World");
  });
});
