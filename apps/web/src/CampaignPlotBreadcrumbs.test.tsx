import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ContextualBreadcrumbs } from "./ContextualNavigation";
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({
    pathname:
      "/campaigns/definitions/internal-campaign/plots/internal-plot/objectives/internal-objective",
    searchStr: "",
  }),
  useMatches: () => [],
}));
vi.mock("./navigation", () => ({
  InternalLink: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
describe("Campaign Plot breadcrumbs", () => {
  it("uses the current draft names without requiring a global live-data provider or loader", () => {
    const render = (name: string) =>
      renderToStaticMarkup(
        <ContextualBreadcrumbs
          data={{
            campaignName: "Bells Beneath the Flood",
            records: [
              {
                resourceType: "plots",
                sourceId: "internal-plot",
                payload: {
                  name,
                  objectives: [
                    { id: "internal-objective", name: "Reach the tower" },
                  ],
                },
              },
            ],
          }}
        />,
      );
    const html = render("Find the bell");
    const visibleText = html.replace(/<[^>]+>/g, "");
    expect(visibleText).toContain("Bells Beneath the Flood");
    expect(visibleText).toContain("Find the bell");
    expect(visibleText).toContain("Objectives");
    expect(visibleText).toContain("Reach the tower");
    expect(visibleText).not.toContain("internal-");
    expect(render("Recover the bell")).toContain("Recover the bell");
  });
});
