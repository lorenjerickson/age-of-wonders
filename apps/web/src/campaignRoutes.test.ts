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
      "/_gm/campaigns/instances/$campaignInstanceId/",
    ],
  ])("matches the static aggregate branch for %s", (pathname, routeId) => {
    const matches = getRouter().matchRoutes(pathname);
    expect(matches.at(-1)?.routeId).toBe(routeId);
    expect(matches.at(-1)?.routeId).not.toBe("/_gm/campaigns/$campaignId/");
  });

  it.each([
    ["/campaigns/definitions/new", "/_gm/campaigns/definitions/new"],
    [
      "/campaigns/definitions/definition-opaque-id/plots",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/objectives",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/objectives/new",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/discoveries/clue/claims",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/claims/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/discoveries/clue/claims/new",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/claims/$claimId",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/locations/context/placements",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/placements/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/plots/plot-opaque-id/locations/context/placements/new",
      "/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/placements/$placementId",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/placements",
      "/_gm/campaigns/definitions/$campaignDefinitionId/placements",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/preparation",
      "/_gm/campaigns/definitions/$campaignDefinitionId/preparation",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/versions",
      "/_gm/campaigns/definitions/$campaignDefinitionId/versions/",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/versions/draft/review",
      "/_gm/campaigns/definitions/$campaignDefinitionId/versions/draft/review",
    ],
    [
      "/campaigns/definitions/definition-opaque-id/versions/migrate",
      "/_gm/campaigns/definitions/$campaignDefinitionId/versions/migrate",
    ],
  ])(
    "matches the Campaign Definition authoring route for %s",
    (pathname, routeId) => {
      expect(getRouter().matchRoutes(pathname).at(-1)?.routeId).toBe(routeId);
    },
  );

  it.each([
    ["/campaigns/instances/new", "/_gm/campaigns/instances/new"],
    [
      "/campaigns/instances/instance-opaque-id/plots",
      "/_gm/campaigns/instances/$campaignInstanceId/plots",
    ],
    [
      "/campaigns/instances/instance-opaque-id/placements",
      "/_gm/campaigns/instances/$campaignInstanceId/placements",
    ],
    [
      "/campaigns/instances/instance-opaque-id/roster",
      "/_gm/campaigns/instances/$campaignInstanceId/roster/",
    ],
    [
      "/campaigns/instances/instance-opaque-id/roster/agents",
      "/_gm/campaigns/instances/$campaignInstanceId/roster/agents",
    ],
    [
      "/campaigns/instances/instance-opaque-id/sessions",
      "/_gm/campaigns/instances/$campaignInstanceId/sessions/",
    ],
    [
      "/campaigns/instances/instance-opaque-id/sessions/session-opaque-id",
      "/_gm/campaigns/instances/$campaignInstanceId/sessions/$sessionId",
    ],
    [
      "/campaigns/instances/instance-opaque-id/run/session-opaque-id",
      "/_gm/campaigns/instances/$campaignInstanceId/run/$sessionId",
    ],
    [
      "/campaigns/instances/instance-opaque-id/versions",
      "/_gm/campaigns/instances/$campaignInstanceId/versions/",
    ],
    [
      "/campaigns/instances/instance-opaque-id/versions/migrate",
      "/_gm/campaigns/instances/$campaignInstanceId/versions/migrate",
    ],
  ])(
    "matches the Campaign Instance management route for %s",
    (pathname, routeId) => {
      expect(getRouter().matchRoutes(pathname).at(-1)?.routeId).toBe(routeId);
    },
  );

  it("matches the participant Session lobby route", () => {
    expect(
      getRouter()
        .matchRoutes(
          "/play/instances/instance-opaque-id/sessions/session-opaque-id",
        )
        .at(-1)?.routeId,
    ).toBe(
      "/_participant/play/instances/$campaignInstanceId/sessions/$sessionId",
    );
  });
});
