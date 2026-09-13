export const appName = 'Age of Wonders';

export function getPlatformMessage(name: string) {
  return `${appName}: hello ${name}`;
}

export * from './types';
export * from './rules/movement-rule-engine';

export * from "./spatial/terrain-validation";
export * from "./spatial/terrain-geometry";
export * from "./spatial/terrain-editing";
export * from "./spatial/terrain-generation";

export * from "./spatial/actor-position";

export * from "./spatial/terrain-openings";
export * from "./spatial/terrain-sight";

export * from "./spatial/terrain-exploration";

export * from "./rules/world-rule-engine";
