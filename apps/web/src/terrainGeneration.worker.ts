import {
  applyTerrainWrites,
  generateTerrainPreview,
  type IsometricTerrainVolume,
  type TerrainGenerationSettings,
} from "@aow/common";
self.onmessage = (
  event: MessageEvent<{
    volume: IsometricTerrainVolume;
    settings: TerrainGenerationSettings;
  }>,
) => {
  try {
    const preview = generateTerrainPreview(
      event.data.volume,
      event.data.settings,
    );
    const result = applyTerrainWrites(event.data.volume, preview.writes);
    self.postMessage({
      result,
      counts: {
        created: preview.created,
        replaced: preview.replaced,
        removed: preview.removed,
        skipped: preview.skipped,
      },
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Terrain generation failed.",
    });
  }
};
