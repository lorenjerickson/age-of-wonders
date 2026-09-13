import type * as Three from "three";
import type { TerrainMaterialReference } from "@aow/common";

export type TerrainTextureQuality = "balanced" | "high" | "off";
// Immutable built-in material revision 1. Provenance and hashes are bundled beside the assets.
export const TERRAIN_MATERIALS: Record<
  string,
  { asset: string; meters: number }
> = {
  "terrain:grass": { asset: "grass", meters: 2 },
  "terrain:dirt": { asset: "dirt", meters: 2 },
  "terrain:sand": { asset: "sand", meters: 15 },
  "terrain:rock": { asset: "rock", meters: 2.421198 },
  "terrain:wood": { asset: "wood", meters: 2 },
  "terrain:stone": { asset: "stone", meters: 2 },
};

/** World-aligned projection: one material on every face, continuous across cell/chunk boundaries. */
export function terrainTextureUvs(
  positions: readonly number[],
  meters: number,
): number[] {
  const uv: number[] = [],
    scale = 1.524 / meters; // one cell is five feet
  for (let i = 0; i < positions.length; i += 9) {
    const p = positions;
    const ax = p[i + 3] - p[i],
      ay = p[i + 4] - p[i + 1],
      az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i],
      by = p[i + 7] - p[i + 1],
      bz = p[i + 8] - p[i + 2];
    const nx = Math.abs(ay * bz - az * by),
      ny = Math.abs(az * bx - ax * bz),
      nz = Math.abs(ax * by - ay * bx);
    const axis = nz >= nx && nz >= ny ? 2 : nx > ny ? 0 : 1;
    for (let v = 0; v < 9; v += 3)
      uv.push(
        p[i + v + (axis === 0 ? 1 : 0)] * scale,
        p[i + v + (axis === 2 ? 1 : 2)] * scale,
      );
  }
  return uv;
}

/** Per-viewport ownership. Materials/textures survive mesh rebuilds and are released together. */
export class TerrainMaterialLibrary {
  private materials = new Map<string, Three.MeshStandardMaterial>();
  private textures = new Set<Three.Texture>();
  private sets = new Map<string, Promise<Three.Texture[]>>();
  private pending = 0;
  private failures = new Set<string>();
  private disposed = false;
  constructor(
    private T: typeof Three,
    private anisotropy: number,
    private quality: TerrainTextureQuality,
    private notify: (message: string) => void,
    private draw: () => void,
  ) {}

  private status() {
    if (!this.disposed)
      this.notify(
        this.pending
          ? "Loading terrain textures…"
          : this.failures.size
            ? "Some terrain materials are unavailable. Showing neutral surfaces."
            : this.quality === "off"
              ? "Terrain textures disabled"
              : "Terrain textures ready",
      );
  }
  private configure(texture: Three.Texture, color: boolean) {
    const T = this.T;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(8, this.anisotropy);
    texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    texture.needsUpdate = true;
    if (this.disposed) texture.dispose();
    else this.textures.add(texture);
    return texture;
  }
  private load(asset: string) {
    let set = this.sets.get(asset);
    if (!set) {
      this.pending++;
      this.status();
      const resolution = this.quality === "high" ? "2k" : "1k";
      set = Promise.allSettled(
        ["color", "normal", "roughness"].map(async (role) => {
          const texture = await new this.T.TextureLoader().loadAsync(
            `/terrain/v1/${asset}-${role}-${resolution}.webp`,
          );
          return this.configure(texture, role === "color");
        }),
      )
        .then((results) => {
          if (results.some((r) => r.status === "rejected")) {
            for (const result of results)
              if (result.status === "fulfilled") {
                result.value.dispose();
                this.textures.delete(result.value);
              }
            this.failures.add(asset);
            return [];
          }
          return results.map(
            (r) => (r as PromiseFulfilledResult<Three.Texture>).value,
          );
        })
        .finally(() => {
          this.pending--;
          this.status();
        });
      this.sets.set(asset, set);
    }
    return set;
  }
  get(
    reference: TerrainMaterialReference | undefined,
    treatment: string,
    selected: boolean,
  ) {
    const T = this.T,
      key = `${reference?.key}@${reference?.revision}|${treatment}|${selected}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const water =
      reference?.key === "terrain:water" && reference.revision === 1;
    const glass = treatment === "glass";
    const material = new T.MeshStandardMaterial({
      color: glass ? "#b7d6dc" : water ? "#28788a" : "#a9a9a9",
      roughness: glass ? 0.12 : water ? 0.22 : 1,
      metalness: water ? 0.12 : 0,
      transparent: glass || water,
      opacity: glass ? 0.3 : water ? 0.8 : 1,
      depthWrite: !glass && !water,
      emissive: selected ? 0x997000 : 0,
      emissiveIntensity: 0.35,
    });
    this.materials.set(key, material);
    if (glass || this.quality === "off") {
      this.status();
      return material;
    }
    if (water) {
      // Analytic periodic ripples, shared on all faces. No simulation or vertex displacement.
      const size = 256,
        pixels = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const u = (x / size) * Math.PI * 2,
            v = (y / size) * Math.PI * 2;
          const dx =
            0.22 * Math.cos(3 * u + 2 * v) + 0.12 * Math.cos(7 * u - 4 * v);
          const dy =
            0.15 * Math.cos(3 * u + 2 * v) - 0.07 * Math.cos(7 * u - 4 * v);
          const length = Math.hypot(dx, dy, 1),
            i = (x + y * size) * 4;
          pixels[i] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
          pixels[i + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
          pixels[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
          pixels[i + 3] = 255;
        }
      material.normalMap = this.configure(
        new T.DataTexture(pixels, size, size),
        false,
      );
      this.status();
      return material;
    }
    const preset =
      reference?.revision === 1 ? TERRAIN_MATERIALS[reference.key] : undefined;
    if (!preset) {
      this.failures.add(key);
      this.status();
      return material;
    }
    void this.load(preset.asset).then((maps) => {
      if (this.disposed || maps.length !== 3) return;
      material.color.set(0xffffff);
      [material.map, material.normalMap, material.roughnessMap] = maps;
      material.normalScale.set(0.65, 0.65);
      material.needsUpdate = true;
      this.draw();
    });
    return material;
  }
  dispose() {
    this.disposed = true;
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.materials.clear();
    this.textures.clear();
  }
}
