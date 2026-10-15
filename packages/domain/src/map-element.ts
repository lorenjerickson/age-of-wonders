import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type DeepReadonly,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
export type MapElementData = Record<string, unknown>;
export type MapElementCommands = {
  change: {
    params: { state?: string; vertices?: unknown; blocks?: unknown };
    context: object;
  };
};
export type MapElementEvents = { changed: { id: string } };
const channels = [
  "sight",
  "sound",
  "movement",
  "environmentalEffects",
] as const;
export const isObject = (v: unknown): v is MapElementData =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** Element formats remain distinct; an omitted legacy 2D kind is interpreted, never rewritten. */
export function mapElementIssue(
  value: unknown,
  expected?: "wall" | "door" | "window",
): string | undefined {
  if (!isObject(value) || typeof value.id !== "string" || !value.id.trim())
    return "A map element requires an identity.";
  const planar = "vertices" in value;
  const kind = value.kind ?? (planar ? "wall" : undefined);
  if (
    expected &&
    (expected === "wall"
      ? !["wall", "invisible-wall"].includes(String(kind))
      : kind !== expected)
  )
    return "Choose the matching map element kind.";
  if (planar) {
    if (
      !["wall", "invisible-wall", "door"].includes(String(kind)) ||
      !Array.isArray(value.vertices) ||
      value.vertices.length < 2 ||
      value.vertices.some(
        (p) =>
          !isObject(p) ||
          p.kind !== "normalized-map" ||
          ![p.x, p.y].every(
            (n) =>
              typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
          ),
      )
    )
      return "Image-map elements require normalized vertices.";
    const blocks = value.blocks;
    if (
      !isObject(blocks) ||
      channels.some((c) => typeof blocks[c] !== "boolean")
    )
      return "Choose the blocking channels for the map element.";
    if (
      kind === "door" &&
      value.doorState !== undefined &&
      !["open", "closed"].includes(String(value.doorState))
    )
      return "Choose an open or closed image-map door.";
  } else {
    if (
      !["door", "window"].includes(String(kind)) ||
      ![0, 1, 2, 3].includes(Number(value.facing)) ||
      typeof value.facing !== "number" ||
      typeof value.frameThickness !== "number" ||
      !Number.isFinite(value.frameThickness) ||
      value.frameThickness < 1 / 16 ||
      value.frameThickness > 7 / 16
    )
      return "Choose a valid terrain opening frame.";
    if (
      !(
        kind === "door" ? ["open", "closed", "locked"] : ["open", "closed"]
      ).includes(String(value.state))
    )
      return "Choose a valid opening state.";
  }
}
/** Owned element command policy. Map remains the persistence/atomic commit boundary. */
export abstract class MapElement extends Entity<
  MapElementData,
  MapElementCommands,
  MapElementEvents
> {
  protected constructor(
    type: "wall" | "door" | "window",
    data: MapElementData,
    options?: EntityOptions,
  ) {
    super(type, data, ["changed"], {}, options);
    this.validate({});
  }
  serializePayload() {
    return this.serialize().data;
  }
  protected validateState(data: DeepReadonly<MapElementData>) {
    const issue = mapElementIssue(data);
    return issue ? [{ code: "map-element-invalid", message: issue }] : [];
  }
  static change(
    data: MapElementData,
    params: MapElementCommands["change"]["params"],
  ): MapElementData {
    const next = copyEntityData(data);
    if (params.state !== undefined) {
      if (next.kind !== "door" && next.kind !== "window")
        throw new TypeError("Only doors and windows have opening states.");
      next["vertices" in next ? "doorState" : "state"] = params.state;
    }
    if (params.vertices !== undefined || params.blocks !== undefined) {
      if (!("vertices" in next))
        throw new TypeError("Terrain openings use cell geometry.");
      if (params.vertices !== undefined) next.vertices = params.vertices;
      if (params.blocks !== undefined) next.blocks = params.blocks;
    }
    const issue = mapElementIssue(next);
    if (issue) throw new TypeError(issue);
    return next;
  }
  protected handleCommand<K extends keyof MapElementCommands>(
    name: K,
    invocation: CommandInvocation<MapElementCommands[K]>,
  ): EntityTransition<MapElementData, MapElementEvents> {
    if (name !== "change") throw new TypeError("Unknown map element command.");
    const data = MapElement.change(this.serializePayload(), invocation.params);
    return {
      data,
      events: [{ name: "changed", context: { id: String(data.id) } }],
    };
  }
  /** Legacy image-map door state is interpreted as closed unless explicitly open. */
  blocking(): Record<string, boolean> {
    const data = this.state.data;
    if (!("vertices" in data))
      throw new TypeError("Terrain blocking is derived from opening geometry.");
    return Object.fromEntries(
      channels.map((c) => [
        c,
        data.kind === "door" && data.doorState === "open"
          ? false
          : !!(data.blocks as Record<string, boolean>)[c],
      ]),
    );
  }
}
