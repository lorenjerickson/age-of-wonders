import { terrainOpeningParts, type TerrainOpening } from "@aow/common";

/** Presentation adapter over canonical geometry; glass appearance grants no visibility. */
export function terrainOpeningGeometry(opening: TerrainOpening) {
  const { frame, panel, glass } = terrainOpeningParts(opening);
  return { opaque: [...frame, ...panel], glass };
}
