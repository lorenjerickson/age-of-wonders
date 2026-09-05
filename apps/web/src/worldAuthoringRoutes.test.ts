import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

describe("World authoring route architecture", () => {
  it.each([
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
      "/worlds/world-id/versions/draft/review",
      "/_gm/worlds/$worldId/versions/draft/review",
    ],
  ])("matches canonical authoring route %s", (pathname, routeId) => {
    expect(getRouter().matchRoutes(pathname).at(-1)?.routeId).toBe(routeId);
  });

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
