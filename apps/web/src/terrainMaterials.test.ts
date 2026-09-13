import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { terrainTextureUvs, TERRAIN_MATERIALS } from "./terrainMaterials";

describe("terrain material delivery", () => {
  it("pins complete 1K/2K assets, source dimensions, and checksums", async () => {
    const root = new URL("../public/terrain/v1/", import.meta.url);
    const sources = JSON.parse(
      await readFile(new URL("sources.json", root), "utf8"),
    );
    expect(sources).toHaveLength(6);
    for (const source of sources) {
      expect(source.license).toBe("CC0-1.0");
      expect(TERRAIN_MATERIALS[`terrain:${source.key}`].meters).toBeCloseTo(
        source.dimensionsMm[0] / 1000,
        5,
      );
      expect(Object.keys(source.maps)).toHaveLength(6);
      for (const map of Object.values(source.maps) as {
        delivery: {
          file: string;
          sha256: string;
          width: number;
          height: number;
        };
      }[]) {
        const bytes = await readFile(new URL(map.delivery.file, root));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          map.delivery.sha256,
        );
        const meta = await sharp(bytes).metadata();
        expect(meta.width).toBe(map.delivery.width);
        expect(meta.height).toBe(map.delivery.height);
        expect(meta.format).toBe("webp");
      }
    }
  });
  it("uses physical scale with continuous UVs across chunks and nondegenerate slope mapping", () => {
    const left = [15, 0, 0, 16, 0, 0, 16, 1, 0],
      right = [16, 0, 0, 17, 0, 0, 16, 1, 0];
    const a = terrainTextureUvs(left, 1.524),
      b = terrainTextureUvs(right, 1.524);
    expect(a.slice(2, 4)).toEqual(b.slice(0, 2));
    expect(a).toEqual([15, 0, 16, 0, 16, 1]);
    for (const positions of [
      [0, 0, 0, 1, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 0, 0, 1, 1],
      [0, 0, 0, 1, 0, 0, 1, 0, 1],
    ]) {
      const uv = terrainTextureUvs(positions, 2);
      expect(
        Math.abs(
          (uv[2] - uv[0]) * (uv[5] - uv[1]) - (uv[3] - uv[1]) * (uv[4] - uv[0]),
        ),
      ).toBeGreaterThan(0);
    }
  });
});

import * as Three from "three";
import { vi, afterEach } from "vitest";
import { TerrainMaterialLibrary } from "./terrainMaterials";
afterEach(() => vi.restoreAllMocks());
const grass = {
  key: "terrain:grass" as const,
  revision: 1,
  name: "Grass",
  terrainType: "terrain:grass" as const,
};
describe("texture resource ownership", () => {
  it("shares texture sets, separates selected materials, and disposes GPU resources", async () => {
    const textures: Three.Texture[] = [];
    const loader = vi
      .spyOn(Three.TextureLoader.prototype, "loadAsync")
      .mockImplementation(async () => {
        const t = new Three.Texture<HTMLImageElement>();
        textures.push(t);
        return t;
      });
    const status = vi.fn(),
      draw = vi.fn();
    const library = new TerrainMaterialLibrary(Three, 16, "high", status, draw);
    const material = library.get(grass, "terrain", false);
    expect(library.get(grass, "terrain", false)).toBe(material);
    const selected = library.get(grass, "terrain", true);
    await vi.waitFor(() => expect(material.map).not.toBeNull());
    expect(loader).toHaveBeenCalledTimes(3);
    expect(selected.map).toBe(material.map);
    expect(material.map?.colorSpace).toBe(Three.SRGBColorSpace);
    expect(material.normalMap?.colorSpace).toBe(Three.NoColorSpace);
    expect(material.map?.anisotropy).toBe(8);
    const disposed = textures.map((t) => vi.spyOn(t, "dispose"));
    library.dispose();
    disposed.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
  it("cleans up late loads after a quality switch or unmount", async () => {
    const resolves: ((t: Three.Texture<HTMLImageElement>) => void)[] = [];
    vi.spyOn(Three.TextureLoader.prototype, "loadAsync").mockImplementation(
      () => new Promise((resolve) => resolves.push(resolve)),
    );
    const status = vi.fn(),
      draw = vi.fn();
    const library = new TerrainMaterialLibrary(
      Three,
      4,
      "balanced",
      status,
      draw,
    );
    const material = library.get(grass, "terrain", false);
    library.dispose();
    status.mockClear();
    const textures = resolves.map((resolve) => {
      const t = new Three.Texture<HTMLImageElement>();
      const dispose = vi.spyOn(t, "dispose");
      resolve(t);
      return dispose;
    });
    await vi.waitFor(() =>
      textures.forEach((spy) => expect(spy).toHaveBeenCalledOnce()),
    );
    expect(material.map).toBeNull();
    expect(draw).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
  it("keeps an unavailable revision neutral instead of silently substituting current art", () => {
    const loader = vi.spyOn(Three.TextureLoader.prototype, "loadAsync");
    const status = vi.fn();
    const library = new TerrainMaterialLibrary(
      Three,
      4,
      "balanced",
      status,
      () => {},
    );
    expect(
      library.get({ ...grass, revision: 99 }, "terrain", false).map,
    ).toBeNull();
    expect(loader).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(
      "Some terrain materials are unavailable. Showing neutral surfaces.",
    );
    library.dispose();
  });
});
