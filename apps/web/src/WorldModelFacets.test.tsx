import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorldModelFacets } from "./WorldModelFacets";

const location = vi.hoisted(() => ({
  pathname: "/worlds/example/characters/models",
  searchStr: "",
}));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => location }));
vi.mock("./WorldAuthoringShell", () => ({
  useWorldAuthoring: () => ({ definition: { id: "example" } }),
}));
vi.mock("./navigation", () => ({
  InternalLink: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

describe("World Model facets", () => {
  it("makes every model facet reachable from the overview", () => {
    location.pathname = "/worlds/example/characters/models";
    const html = renderToStaticMarkup(
      <WorldModelFacets>
        <p>Model overview</p>
      </WorldModelFacets>,
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    for (const kind of [
      "structure",
      "attributes",
      "equipment-slots",
      "profession-ranks",
    ]) {
      expect(html).toContain(
        `href="/worlds/example/characters/model/${kind}/effective"`,
      );
    }
    expect(html).toContain('aria-labelledby="world-models-tab-overview"');
    expect(html).toContain("Model overview");
  });

  it("selects the facet for a direct editor route", () => {
    location.pathname =
      "/worlds/example/characters/model/equipment-slots/effective";
    const html = renderToStaticMarkup(
      <WorldModelFacets>
        <p>Equipment editor</p>
      </WorldModelFacets>,
    );
    expect(html).toContain(
      'aria-labelledby="world-models-tab-equipment-slots"',
    );
    expect(html).toMatch(
      /id="world-models-tab-equipment-slots"[^>]*aria-selected="true"/,
    );
    expect(html).toContain('href="/worlds/example/characters/models"');
  });
  it("reserves focused editor space for the task", () => {
    location.pathname = "/worlds/example/characters/model/structure/new";
    const html = renderToStaticMarkup(
      <WorldModelFacets>
        <p>Add Concept</p>
      </WorldModelFacets>,
    );
    expect(html).toContain("Add Concept");
    expect(html).not.toContain('role="tablist"');
  });
});
