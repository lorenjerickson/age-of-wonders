import { Creature, Character } from "@aow/domain";
import { BadRequestException } from "@nestjs/common";
import {
  createTerrainSightIndex,
  isTerrainActorPosition,
  terrainActorPositionIssue,
  terrainCellAddress,
  terrainSupportHeight,
  type IsometricTerrainManifest,
  type IsometricTerrainVolume,
  type JsonValue,
  type RuleStateView,
  type RuleStateEntity,
  type RuleValueType,
  type TerrainPoint,
} from "@aow/common";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";
import {
  isRecord,
  resolveTerrainManifest,
} from "../world-definitions/terrain-snapshot";

export const object = (v: unknown): Record<string, unknown> =>
  isRecord(v) ? v : {};
export const array = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(object) : [];
export const records = (manifest: unknown) =>
  isCanonicalSnapshotManifest(manifest) ? manifest.records : [];
export const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export function capturedTerrain(
  manifest: unknown,
  locationId: string,
): IsometricTerrainVolume {
  const world = records(manifest);
  const location = world.find(
    (r) => r.resourceType === "locations" && r.sourceId === locationId,
  );
  if (!location || object(object(location.payload).map).kind !== "isometric")
    throw new BadRequestException(
      "The actor needs a captured isometric Location map.",
    );
  const volume = resolveTerrainManifest(
    object(location.payload).map as IsometricTerrainManifest,
    world,
  );
  if (
    volume.chunks.reduce((sum, chunk) => sum + chunk.cells.length, 0) > 100_000
  )
    throw new BadRequestException(
      "This map exceeds the current movement geometry query budget.",
    );
  return volume;
}
/** Direct point-route geometry only. Authored rules interpret every consequence. */
export function movementGeometry(
  volume: IsometricTerrainVolume,
  origin: TerrainPoint,
  destination: TerrainPoint,
) {
  if (
    !isTerrainActorPosition(destination) ||
    destination.x >= volume.dimensions.x ||
    destination.y >= volume.dimensions.y ||
    destination.z > volume.dimensions.z
  )
    throw new BadRequestException(
      "Choose finite destination coordinates inside the captured map.",
    );
  const distance = Math.hypot(
    destination.x - origin.x,
    destination.y - origin.y,
    destination.z - origin.z,
  );
  const index = createTerrainSightIndex(volume);
  const trace =
    distance > 1e-8
      ? index.trace(
          { ...origin, z: origin.z + 1e-5 },
          { ...destination, z: destination.z + 1e-5 },
        )
      : { contacts: [], originInteriors: [] };
  const cells = new Map<
    string,
    {
      x: number;
      y: number;
      z: number;
      cell: IsometricTerrainVolume["chunks"][number]["cells"][number];
    }
  >();
  for (const chunk of volume.chunks)
    for (const cell of chunk.cells) {
      const address = terrainCellAddress(chunk.address, cell.offset);
      cells.set(`${address.x}/${address.y}/${address.z}`, { ...address, cell });
    }
  const materials = new Set<string>();
  let slopedSegments = 0;
  // Exact XY slab intersections preserve even very short corner crossings.
  // Split at the authored top diagonal so each support-height interval is linear.
  for (const found of cells.values()) {
    if (found.cell.opening) continue;
    let enter = 0,
      exit = 1;
    for (const axis of ["x", "y"] as const) {
      const delta = destination[axis] - origin[axis];
      if (Math.abs(delta) < 1e-12) {
        if (origin[axis] < found[axis] || origin[axis] >= found[axis] + 1) {
          exit = -1;
          break;
        }
      } else {
        const a = (found[axis] - origin[axis]) / delta;
        const b = (found[axis] + 1 - origin[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (exit - enter < 1e-10) continue;
    const p = (t: number) => ({
      x: origin.x + (destination.x - origin.x) * t,
      y: origin.y + (destination.y - origin.y) * t,
      z: origin.z + (destination.z - origin.z) * t,
    });
    const diagonal = (t: number) => {
      const point = p(t);
      return found.cell.shape.diagonal === "00-11"
        ? point.x - found.x - (point.y - found.y)
        : point.x - found.x + (point.y - found.y) - 1;
    };
    const atStart = diagonal(enter),
      atEnd = diagonal(exit);
    const cut =
      Math.abs(atEnd - atStart) > 1e-12
        ? enter - (atStart * (exit - enter)) / (atEnd - atStart)
        : enter;
    const cuts = cut > enter && cut < exit ? [enter, cut, exit] : [enter, exit];
    let supported = false;
    for (let i = 1; i < cuts.length; i++) {
      const supportAt = (t: number) => {
        const point = p(t);
        return (
          Math.abs(
            found.z +
              terrainSupportHeight(
                found.cell.shape,
                point.x - found.x,
                point.y - found.y,
              ) -
              point.z,
          ) < 1e-7
        );
      };
      if (
        supportAt(cuts[i - 1] + (cuts[i] - cuts[i - 1]) * 0.25) &&
        supportAt(cuts[i - 1] + (cuts[i] - cuts[i - 1]) * 0.75)
      )
        supported = true;
    }
    if (supported) {
      materials.add(found.cell.materialKey);
      if (new Set(found.cell.shape.top).size > 1) slopedSegments++;
    }
  }
  return {
    distanceFeet: distance * volume.cellSize.value,
    slopedSegments,
    contactCount: trace.contacts.length,
    originInteriorCount: trace.originInteriors.length,
    destinationSupported: !terrainActorPositionIssue(volume, destination),
    materials: [...materials],
  };
}

function valueType(value: unknown): RuleValueType {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  )
    return typeof value as RuleValueType;
  return isTerrainActorPosition(value) ? "point" : "json";
}
/** Captured and Instance entities stay inspectable without exposing unrelated host state. */
export function movementStateView(
  state: Record<string, unknown>,
  worldManifest: unknown,
  campaignManifest: unknown,
): RuleStateView {
  const runtime: Record<string, RuleStateEntity> = {};
  const captured: Record<string, RuleStateEntity> = {};
  const schema: Record<
    string,
    Record<string, { type: RuleValueType; writable: boolean }>
  > = {};
  const add = (
    scope: Record<string, RuleStateEntity>,
    id: string,
    type: string,
    fields: Record<string, unknown>,
    writable = false,
  ) => {
    const clean = json(fields) as Record<string, JsonValue>;
    scope[id] = { type, fields: clean };
    schema[type] ??= {};
    for (const [key, value] of Object.entries(clean)) {
      const nextType = valueType(value);
      const previous = schema[type][key];
      schema[type][key] = {
        type: previous && previous.type !== nextType ? "json" : nextType,
        writable,
      };
    }
  };
  // Mutable entities have one state-view representation. Duplicating their
  // baseline JSON inside the Instance would expose stale values after effects.
  const instanceFields = { ...state };
  delete instanceFields.creatureEmbodiments;
  delete instanceFields.itemInstances;
  delete instanceFields.plotProgress;
  add(runtime, "aow:instance", "instance", instanceFields);
  for (const entry of array(state.creatureEmbodiments)) {
    const creature = object(entry.creature);
    const owner =
      object(entry.source).kind === "character" ? Character : Creature;
    const fields = owner.ruleFields(creature);
    add(runtime, String(entry.runtimeCreatureId), "actor", fields);
  }
  schema.actor ??= {};
  schema.actor.position = { type: "point", writable: true };
  schema.actor.locationId = { type: "string", writable: false };
  schema.actor["aow:movementRemaining"] = { type: "number", writable: true };
  schema.actor["aow:moves"] = { type: "number", writable: true };
  schema.actor["aow:bonusActions"] = { type: "number", writable: true };
  for (const [index, entry] of array(state.itemInstances).entries())
    add(runtime, `aow:item:${index}`, "item", entry);
  for (const [index, entry] of array(state.plotProgress).entries())
    add(runtime, `aow:plot:${index}`, "plot-progress", entry);
  for (const row of [
    ...records(worldManifest),
    ...records(campaignManifest),
  ].filter((entry) => entry.resourceType !== "location-terrain-chunks"))
    add(
      captured,
      `${row.resourceType}:${row.sourceId}`,
      row.resourceType,
      object(row.payload),
    );
  return { runtime, captured, schema };
}

/** Only registered mutable actor fields can be mapped back to persisted runtime. */
export async function applyMovementState(
  state: Record<string, unknown>,
  before: RuleStateView,
  after: RuleStateView,
) {
  const next = json(state);
  for (const embodiment of array(next.creatureEmbodiments)) {
    const id = String(embodiment.runtimeCreatureId);
    const previous = before.runtime[id];
    const result = after.runtime[id];
    if (!previous || !result)
      throw new BadRequestException(
        "Rule execution changed the runtime entity structure.",
      );
    try {
      const Actor =
        object(embodiment.source).kind === "character" ? Character : Creature;
      const owner = Actor.deserializePayload(object(embodiment.creature));
      try {
        const receipt = await owner.command("applyRuleFields", {
          initiator: "rule-execution",
          params: {
            before: previous.fields,
            after: result.fields,
            updatedAt: new Date().toISOString(),
          },
          context: {},
        });
        if (receipt.status === "rejected")
          throw new TypeError(receipt.reason ?? "Invalid actor rule write.");
        embodiment.creature = owner.serialize().data;
      } finally {
        owner.dispose();
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid actor rule write.",
      );
    }
  }
  return next;
}
