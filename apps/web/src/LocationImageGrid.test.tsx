import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationImageGrid } from "./LocationImageGrid";

const image = { width: 1200, height: 800, orientation: "overhead" };
const grid = { kind: "hex", cellSizePixels: 50 };
describe("Location image grid", () => {
  it("uses saved image pixels and hex configuration", () => {
    const markup = renderToStaticMarkup(
      <LocationImageGrid
        image={image}
        scene={{ grid }}
        map={{ kind: "image" }}
      />,
    );
    expect(markup).toContain('viewBox="0 0 1200 800"');
    expect(markup).toContain('patternUnits="userSpaceOnUse"');
    expect(markup).toContain('width="150"');
  });
  it.each([
    [{ orientation: "scenic", grid }, { kind: "image" }],
    [{ orientation: "isometric", grid }, { kind: "isometric" }],
    [{ grid: { kind: "square", cellSizePixels: 0 } }, { kind: "image" }],
    [{}, { kind: "image" }],
  ])(
    "does not apply an image grid to scenic, terrain, or unconfigured maps",
    (scene, map) => {
      expect(
        renderToStaticMarkup(
          <LocationImageGrid image={image} scene={scene} map={map} />,
        ),
      ).toBe("");
    },
  );
});
