import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createTerrainVolume } from "@aow/common";
import { IsometricTerrainViewport } from "./IsometricTerrainViewport";
import { TERRAIN_PALETTE } from "./isometricEditorModel";
it("renders an accessible SSR shell without constructing a WebGL context", () => {
  const html = renderToStaticMarkup(
    <IsometricTerrainViewport
      volume={createTerrainVolume({ x: 10, y: 10, z: 10 }, TERRAIN_PALETTE)}
      level={0}
      slice={false}
      actor={{ x: 5, y: 5, z: 0 }}
      selection={[]}
      disabled={false}
      onStroke={() => {}}
    />,
  );
  expect(html).toContain("Isometric terrain editor");
  expect(html).toContain("Focused on Preview actor");
  expect(html).not.toContain("terrain:grass");
});
