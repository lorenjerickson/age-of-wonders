import { useMemo } from "react";
import type { IsometricTerrainVolume } from "@aow/common";
import { IsometricTerrainViewport } from "./IsometricTerrainViewport";

const noSelection = [] as const;
const noStroke = () => {};

/** Captured GM reference only. Live actor focus and movement await authoritative play. */
export function CampaignSessionTerrainOverview({
  volume,
}: {
  volume: IsometricTerrainVolume;
}) {
  const center = useMemo(
    () => ({
      x: (volume.dimensions.x - 1) / 2,
      y: (volume.dimensions.y - 1) / 2,
      z: Math.max(0, volume.dimensions.z / 2 - 1),
    }),
    [volume.dimensions.x, volume.dimensions.y, volume.dimensions.z],
  );
  return (
    <IsometricTerrainViewport
      overview
      volume={volume}
      level={0}
      slice={false}
      actor={center}
      selection={noSelection}
      disabled
      onStroke={noStroke}
    />
  );
}
