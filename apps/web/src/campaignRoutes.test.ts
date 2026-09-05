import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

describe("Campaign route precedence", () => {
  it.each([
    [
      "/campaigns/definitions/definition-opaque-id",
      "/_gm/campaigns/definitions/$campaignDefinitionId",
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
});
