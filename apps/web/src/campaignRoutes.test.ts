import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

describe("Campaign route precedence", () => {
  it.each([
    [
      "/campaigns/definitions/definition-opaque-id",
      "/_gm/campaigns/definitions/$campaignDefinitionId/",
    ],
    [
      "/campaigns/instances/instance-opaque-id",
      "/_gm/campaigns/instances/$campaignInstanceId",
    ],
  ])("matches the static aggregate branch for %s", (pathname, routeId) => {
    const matches = getRouter().matchRoutes(pathname);
    expect(matches.at(-1)?.routeId).toBe(routeId);
    expect(matches.at(-1)?.routeId).not.toBe("/_gm/campaigns/$campaignId/");
  });

  it.each([
    ["/campaigns/definitions/new", "/_gm/campaigns/definitions/new"],
    ["/campaigns/definitions/definition-opaque-id/plots", "/_gm/campaigns/definitions/$campaignDefinitionId/plots/"],
    ["/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id", "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId"],
    ["/campaigns/definitions/definition-opaque-id/placements", "/_gm/campaigns/definitions/$campaignDefinitionId/placements"],
    ["/campaigns/definitions/definition-opaque-id/preparation", "/_gm/campaigns/definitions/$campaignDefinitionId/preparation"],
    ["/campaigns/definitions/definition-opaque-id/versions", "/_gm/campaigns/definitions/$campaignDefinitionId/versions/"],
    ["/campaigns/definitions/definition-opaque-id/versions/draft/review", "/_gm/campaigns/definitions/$campaignDefinitionId/versions/draft/review"],
    ["/campaigns/definitions/definition-opaque-id/versions/migrate", "/_gm/campaigns/definitions/$campaignDefinitionId/versions/migrate"],
  ])("matches the Campaign Definition authoring route for %s", (pathname, routeId) => {
    expect(getRouter().matchRoutes(pathname).at(-1)?.routeId).toBe(routeId);
  });
});
