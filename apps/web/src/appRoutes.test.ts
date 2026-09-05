import { describe, expect, it } from "vitest";
import { ROUTE_POLICIES, invitationTokenFromHash } from "./appRoutes";

describe("ROUTE_POLICIES", () => {
  it("keeps every route family explicit about audience and rendering", () => {
    expect(ROUTE_POLICIES).toHaveLength(8);
    expect(ROUTE_POLICIES.every((policy) => policy.audience)).toBe(true);
    expect(ROUTE_POLICIES.every((policy) => policy.rendering)).toBe(true);
    expect(
      ROUTE_POLICIES.find((policy) => policy.family === "session canvas"),
    ).toMatchObject({ audience: "gm", rendering: "client-island" });
    expect(
      ROUTE_POLICIES.find((policy) => policy.family === "campaign invitation"),
    ).toMatchObject({
      audience: "public",
      rendering: "prerender-client-exchange",
    });
  });
});

describe("invitationTokenFromHash", () => {
  it("extracts a fragment token without accepting it from the query string", () => {
    expect(invitationTokenFromHash("#invite=secret-token")).toBe(
      "secret-token",
    );
    expect(invitationTokenFromHash("#other=value")).toBeUndefined();
    expect(invitationTokenFromHash("#token=backend-token")).toBe(
      "backend-token",
    );
    expect(invitationTokenFromHash("")).toBeUndefined();
  });
});
