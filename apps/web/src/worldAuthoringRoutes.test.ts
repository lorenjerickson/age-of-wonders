import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

describe("World authoring route architecture", () => {
  it.each([
    [
      "/worlds/world-id/atlas/locations/location-id/map",
      "/_gm/worlds/$worldId/atlas/locations/$locationId/map",
    ],
    [
      "/worlds/world-id/characters/professions/engineer/rule/expertiseLevels/0/benefits",
      "/_gm/worlds/$worldId/characters/$definitionKind/$definitionId_/$section/$",
    ],
    [
      "/worlds/world-id/characters/backgrounds/sailor/rule/choices/new",
      "/_gm/worlds/$worldId/characters/$definitionKind/$definitionId_/$section/$",
    ],
    ["/worlds/new", "/_gm/worlds/new"],
    ["/worlds/world-id/atlas", "/_gm/worlds/$worldId/atlas"],
    [
      "/worlds/world-id/atlas/locations/new",
      "/_gm/worlds/$worldId/atlas/locations/$locationId",
    ],
    ["/worlds/world-id/bestiary", "/_gm/worlds/$worldId/bestiary"],
    [
      "/worlds/world-id/bestiary/creatures/new",
      "/_gm/worlds/$worldId/bestiary/creatures/$creatureId",
    ],
    [
      "/worlds/world-id/item-compendium",
      "/_gm/worlds/$worldId/item-compendium",
    ],
    [
      "/worlds/world-id/item-compendium/items/new",
      "/_gm/worlds/$worldId/item-compendium/items/$itemId",
    ],
    [
      "/worlds/world-id/characters/skills",
      "/_gm/worlds/$worldId/characters/$definitionKind/",
    ],
    [
      "/worlds/world-id/characters/professions/new",
      "/_gm/worlds/$worldId/characters/$definitionKind/$definitionId",
    ],
    [
      "/worlds/world-id/characters/models",
      "/_gm/worlds/$worldId/characters/models",
    ],
    [
      "/worlds/world-id/characters/model/structure/effective",
      "/_gm/worlds/$worldId/characters/model/$definitionKind/$definitionId",
    ],
    [
      "/worlds/world-id/characters/model/profession-ranks/effective",
      "/_gm/worlds/$worldId/characters/model/$definitionKind/$definitionId",
    ],
    [
      "/worlds/world-id/versions/draft/review",
      "/_gm/worlds/$worldId/versions/draft/review",
    ],
  ])("matches canonical authoring route %s", (pathname, routeId) => {
    expect(getRouter().matchRoutes(pathname).at(-1)?.routeId).toBe(routeId);
  });

  it.each([
    "traits",
    "traits/new",
    "traits/trait-id/modifiers/modifier-id/predicate",
    "traits/trait-id/modifiers/modifier-id/predicate/new",
    "traits/trait-id/modifiers/modifier-id/predicate/0/children/0/children/new",
    "traits/trait-id/triggers/0/predicate",
    "traits/trait-id/triggers/0/predicate/new",
    "traits/trait-id/triggers/0/predicate/0/children/0/children/new",
    "traits/trait-id/triggers",
    "traits/trait-id/triggers/new",
    "traits/trait-id/triggers/0",
    "traits/trait-id/triggers/0/effects",
    "traits/trait-id/triggers/0/effects/new",
    "traits/trait-id/triggers/0/effects/1",
    "traits/trait-id/grants",
    "traits/trait-id/grants/new",
    "traits/trait-id/grants/0",
    "traits/trait-id/modifiers",
    "traits/trait-id/modifiers/new",
    "traits/trait-id/modifiers/modifier-id",
    "traits/trait-id/choices",
    "traits/trait-id/choices/new",
    "traits/trait-id/choices/choice/options/new",
    "traits/trait-id/choices/choice/options/option/prerequisites/0/children/new",
    "traits/trait-id/prerequisites",
    "traits/trait-id/prerequisites/new",
    "traits/trait-id/prerequisites/0/children/1/children/0",
    "traits/trait-id/actions",
    "traits/trait-id/actions/action-id",
    "actions/new",
    "vehicle",
    "vehicle/actions/new",
    "actions/action-id/choices",
    "actions/action-id/choices/new",
    "actions/action-id/choices/choice-id/options",
    "actions/action-id/choices/choice-id/options/new",
    "traits/trait-id/actions/action-id/choices/choice-id/options/option-id",
    "vehicle/actions/action-id/choices/choice-id",
    "actions/action-id/prerequisites/0/children",
    "actions/action-id/prerequisites/0/children/new",
    "traits/trait-id/actions/action-id/prerequisites/0/children/1/children/0",
    "vehicle/actions/action-id/prerequisites/0/children/0/children/new",
    "actions/action-id/choices/choice-id/options/option-id/prerequisites",
    "actions/action-id/choices/choice-id/options/option-id/prerequisites/new",
    "traits/trait-id/actions/action-id/choices/choice-id/options/option-id/prerequisites/0/children/1",
    "vehicle/actions/action-id/choices/choice-id/options/option-id/prerequisites/0",
    "actions/action-id/prerequisites",
    "actions/action-id/prerequisites/new",
    "actions/action-id/prerequisites/0",
    "traits/trait-id/actions/action-id/prerequisites/1",
    "vehicle/actions/action-id/prerequisites/2",
    "actions/action-id/costs",
    "actions/action-id/costs/new",
    "actions/action-id/costs/0",
    "traits/trait-id/actions/action-id/costs/1",
    "vehicle/actions/action-id/costs/2",
    "actions/action-id/outcomes",
    "actions/action-id/outcomes/new",
    "actions/action-id/outcomes/outcome-id/effects/0",
    "traits/trait-id/actions/action-id/outcomes/outcome-id/effects/new",
    "vehicle/actions/action-id/outcomes/outcome-id/effects",
  ])(
    "opens Item mechanics %s without mounting the Overview editor",
    (suffix) => {
      expect(
        getRouter()
          .matchRoutes(
            `/worlds/world-id/item-compendium/items/item-id/${suffix}`,
          )
          .at(-1)?.routeId,
      ).toBe("/_gm/worlds/$worldId/item-compendium/items/$itemId_/$section/$");
    },
  );

  it.each([
    ["discoveries/entry-claim-id", "discoveries/$discoveryId"],
    ["creatures/new", "creatures/$placementId"],
    ["items/entry-placement-id", "items/$placementId"],
  ])("opens Location collection child %s", (suffix, route) => {
    expect(
      getRouter()
        .matchRoutes(`/worlds/world-id/atlas/locations/location-id/${suffix}`)
        .at(-1)?.routeId,
    ).toBe(`/_gm/worlds/$worldId/atlas/locations/$locationId/${route}`);
  });

  it.each([
    "new",
    "rule-id/edit",
    "rule-id/effects/new",
    "rule-id/conditions/children/1/edit",
  ])(
    "opens focused World rule context %s without nesting the list",
    (suffix) => {
      const routes = getRouter().matchRoutes(
        `/worlds/world-id/rules/${suffix}`,
      );
      expect(routes.at(-1)?.routeId).toBe("/_gm/worlds/$worldId/rules_/$");
      expect(
        routes.some((route) => route.routeId === "/_gm/worlds/$worldId/rules"),
      ).toBe(false);
    },
  );

  it("does not route canonical libraries through legacy editor paths", () => {
    const routeIds = [
      getRouter().matchRoutes("/worlds/world-id/atlas").at(-1)?.routeId,
      getRouter().matchRoutes("/worlds/world-id/bestiary").at(-1)?.routeId,
      getRouter().matchRoutes("/worlds/world-id/item-compendium").at(-1)
        ?.routeId,
    ];
    expect(routeIds.join(" ")).not.toMatch(
      /\/domain|\/creatures\/$|\/items\/$/,
    );
  });
});
