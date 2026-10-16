import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorldModelFacets } from "./WorldModelFacets";
import { WorldModelEditor } from "./WorldModelEditor";
import { WorldModelStructureEditor } from "./WorldModelStructureEditor";
vi.mock("./WorldAuthoringShell", () => ({
  useWorldAuthoring: () => ({
    draft: {
      effectiveModels: {
        attributes: [
          {
            key: "strength",
            name: "Strength",
            payload: {
              valueMetadata: {
                "aow:minimum": 0,
                "aow:maximum": 100,
                "aow:default": 50,
              },
            },
          },
        ],
        equipmentSlots: [{ key: "head", name: "Head" }],
        professionRanks: [{ key: "expert", name: "Expert" }],
        elements: [{ key: "actor", name: "Actor", kind: "concept" }],
      },
    },
  }),
}));
describe("World Model reference pages", () => {
  it("retains content without authoring navigation", () => {
    const html = renderToStaticMarkup(
      <WorldModelFacets>
        <p>Retained definitions</p>
      </WorldModelFacets>,
    );
    expect(html).toContain("Retained definitions");
    expect(html).not.toContain('role="tablist"');
  });
  it.each(["effective", "new", "existing"])(
    "renders old %s URLs read only with adopted data",
    (context) => {
      const html = renderToStaticMarkup(
        <WorldModelEditor kind="attributes" context={context} />,
      );
      expect(html).toContain("Strength");
      expect(html).toContain("Minimum");
      expect(html).toContain("50");
      expect(html).toContain("read only");
      expect(html).not.toMatch(/<form|<input|<button|Publish|Archive/);
    },
  );
  it("keeps slots, ranks and schema names readable", () => {
    expect(
      renderToStaticMarkup(<WorldModelEditor kind="equipment-slots" />),
    ).toContain("Head");
    expect(
      renderToStaticMarkup(<WorldModelEditor kind="profession-ranks" />),
    ).toContain("Expert");
    const html = renderToStaticMarkup(
      <WorldModelStructureEditor context="new" />,
    );
    expect(html).toContain("Actor");
    expect(html).not.toMatch(/<form|<input|<button/);
  });
});
