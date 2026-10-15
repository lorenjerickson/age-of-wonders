import type {
  CreateWorldLocationDraftRequest,
  GameCommand,
  LocationSceneGrid,
  WorldLocationDefinition,
} from "@aow/common";

const square: LocationSceneGrid = { kind: "square", cellSizePixels: 64 };
const hex: LocationSceneGrid = { kind: "hex", cellSizePixels: 32 };
const grid: WorldLocationDefinition["mapScene"] = {
  orientation: "scenic",
  grid: square, // Saved configuration survives scenic orientation, where it is inactive.
};
const clearGrid: Pick<CreateWorldLocationDraftRequest, "mapSceneGrid"> = {
  mapSceneGrid: null,
};
const terrainOrImage: WorldLocationDefinition["map"] = { kind: "image" };
// @ts-expect-error Valid authored Location contracts require a map.
const missingMap: WorldLocationDefinition["map"] = undefined;
type ConnectedLocations =
  // @ts-expect-error Related-Location adjacency is no longer an authoring contract.
  CreateWorldLocationDraftRequest["connectedLocationIds"];
const unsupportedGrid: LocationSceneGrid = {
  // @ts-expect-error Pixel grids support square and hex shapes only.
  kind: "triangle",
  cellSizePixels: 16,
};
// @ts-expect-error Automated travel commands have retired; map movement remains separate.
const retiredTravel: GameCommand = { kind: "begin-travel", travel: {} };
