import { MapExploration } from "@aow/domain";
import { projectAuthorizedTerrain } from "./terrain-visibility-projection";

/** Internal composition used by TerrainExplorationStore. Store exploration transactionally; send only projection to participants.
 * Callers must resolve the observer server-side and load memory from that exact Instance/snapshot/map scope.
 * No evaluator or participant endpoint is connected yet.
 */
export async function projectTerrainWithExploration(
  input: Parameters<typeof projectAuthorizedTerrain>[0] & {
    previousExploration?: unknown;
  },
) {
  const current = projectAuthorizedTerrain(input);
  if (current.status !== "ready") return current;
  const surfaces = current.surfaces.map((surface) => ({
    key: surface.key,
    triangle: surface.triangle,
    treatment: surface.treatment,
    material: current.materials.find(
      (material) => material.key === surface.materialKey,
    )!,
  }));
  try {
    const observation = {
      context: current.context,
      surfaces,
      absentSurfaceKeys: current.observedAbsentSurfaceKeys,
    };
    const owner =
      input.previousExploration === undefined
        ? MapExploration.fromObservation(observation)
        : MapExploration.deserializePayload(input.previousExploration);
    let exploration;
    try {
      if (input.previousExploration !== undefined) {
        const receipt = await owner.command("observe", {
          initiator: current.context.observerId,
          params: observation,
          context: {},
        });
        if (receipt.status === "rejected")
          return { status: "awaiting-visibility" as const };
      }
      exploration = owner.serializePayload();
    } finally {
      owner.dispose();
    }
    const visible = new Set(current.surfaces.map((surface) => surface.key));
    return {
      status: "ready" as const,
      exploration,
      projection: {
        context: current.context,
        actors: current.actors,
        visibleSurfaces: surfaces,
        rememberedSurfaces: exploration.surfaces
          .filter((surface) => !visible.has(surface.key))
          .map((surface) => ({
            key: surface.key,
            triangle: surface.triangle,
            treatment: surface.treatment,
            material: surface.material,
          })),
      },
    };
  } catch {
    // Invalid/foreign/future memory must never be relabeled as current authorization.
    return { status: "awaiting-visibility" as const };
  }
}
