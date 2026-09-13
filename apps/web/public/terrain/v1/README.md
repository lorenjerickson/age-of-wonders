# Built-in terrain materials, revision 1

These application assets are served locally. No Poly Haven requests are made during play or authoring.
Keep revision 1 immutable; replacement art requires a new material revision and retained old files.

| Terrain | Source | Physical tile width |
| --- | --- | --- |
| Grass | [Leafy Grass](https://polyhaven.com/a/leafy_grass) | 2 m |
| Dirt | [Dirt](https://polyhaven.com/a/dirt) | 2 m |
| Sand | [Coast Sand 01](https://polyhaven.com/a/coast_sand_01) | 15 m |
| Rock | [Dark Rock](https://polyhaven.com/a/dark_rock) | 2.421198 m |
| Wood | [Medieval Wood](https://polyhaven.com/a/medieval_wood) | 2 m |
| Stone wall | [Stone Wall](https://polyhaven.com/a/stone_wall) | 2 m |

Source assets are [CC0-1.0](https://polyhaven.com/license). `sources.json` records contributing authors,
source URLs, dimensions, source SHA-256 checksums, and delivered WebP checksums. Source JPGs were
resized to exact 1024/2048-square delivery maps with Sharp; color and roughness use WebP quality 88,
OpenGL normals quality 95. The normal and roughness maps are linear data, not sRGB color.
Water uses project-authored periodic ripple normals generated in `terrainMaterials.ts` and has no
third-party image asset. It is visual shading, not simulated fluid.

To regenerate from verified sources, run `pnpm --filter @aow/web textures:prepare --download`.
This explicitly downloads the pinned source files and requires curl and the locked Sharp dependency.
Review any output checksum changes; do not silently replace published revision-one assets.
Run `pnpm --filter @aow/web test src/terrainMaterials.test.ts` to verify local dimensions/checksums.
Run `pnpm --filter @aow/web smoke:materials` for the visual gallery and quality/failure checks.

Delivery uses WebP plus runtime mipmaps. It does not yet use compressed GPU formats such as KTX2.
