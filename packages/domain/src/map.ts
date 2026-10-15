import { ReplaySubject, type Observable } from "rxjs";
import {
  applyTerrainWrites as applyWrites,
  editTerrainSelection as editSelection,
  locationMapIssue,
  terrainVolumeIssue,
  terrainCellIndex,
  terrainAddressKey,
  isTerrainAddress,
  type IsometricTerrainVolume,
  type TerrainAddress,
  type TerrainCellWrite,
  type TerrainOpening,
  type TerrainEditResult,
  type WorldLocationDefinition,
  type LocationMapOrientation,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type DeepReadonly,
  type CommandInvocation,
  type EntityTransition,
  type CommandReceipt,
} from "./entity";
import {
  MapElement,
  mapElementIssue,
  isObject,
  type MapElementData,
  type MapElementCommands,
} from "./map-element";
import { Door } from "./door";
import { Window } from "./window";
export type OpeningSettings = TerrainOpening extends infer O
  ? O extends TerrainOpening
    ? Omit<O, "id">
    : never
  : never;
export type MapData =
  | { format: "terrain"; volume: IsometricTerrainVolume }
  | { format: "location"; location: Record<string, unknown> };
export type MapCommands = {
  writeTerrain: {
    params: { writes: readonly TerrainCellWrite[] };
    context: object;
  };
  changeElement: {
    params: { id: string; change: MapElementCommands["change"]["params"] };
    context: object;
  };
};
export type MapEvents = { changed: { format: MapData["format"] } };
export interface OwnedMapElement {
  readonly id: string;
  readonly state: DeepReadonly<MapElementData>;
  readonly state$: Observable<DeepReadonly<MapElementData>>;
  readonly disposed: boolean;
  change(
    params: MapElementCommands["change"]["params"],
    initiator: unknown,
  ): Promise<CommandReceipt>;
}
interface ElementViewEntry {
  view: OwnedMapElement;
  subject: ReplaySubject<DeepReadonly<MapElementData>>;
  data: DeepReadonly<MapElementData>;
  disposed: boolean;
}

/** One map owns geometry edits and elements. Capture hashes, visibility and persistence are external. */
export class Map extends Entity<MapData, MapCommands, MapEvents> {
  readonly #elements = new globalThis.Map<string, ElementViewEntry>();
  private constructor(data: MapData, options?: EntityOptions) {
    super("map", data, ["changed"], {}, options);
    this.validate({});
    const subscription = this.state$.subscribe(() => this.refreshElements());
    this.ownSubscription(() => {
      subscription.unsubscribe();
      for (const entry of this.#elements.values()) {
        entry.disposed = true;
        entry.subject.complete();
      }
      this.#elements.clear();
    });
  }
  private refreshElements() {
    const data = this.state.data;
    const values: readonly unknown[] =
      data.format === "terrain"
        ? data.volume.chunks.flatMap((c) =>
            c.cells.flatMap((cell) => (cell.opening ? [cell.opening] : [])),
          )
        : Array.isArray(data.location.walls)
          ? data.location.walls
          : [];
    const current = new Set<string>();
    for (const value of values) {
      if (!isObject(value) || typeof value.id !== "string") continue;
      const id = value.id;
      current.add(id);
      const previous = this.#elements.get(id);
      if (previous) {
        if (JSON.stringify(previous.data) !== JSON.stringify(value)) {
          previous.data = value;
          previous.subject.next(value);
        }
        continue;
      }
      const subject = new ReplaySubject<DeepReadonly<MapElementData>>(1);
      const entry: ElementViewEntry = {
        data: value,
        disposed: false,
        subject,
        view: undefined!,
      };
      const owner = this;
      entry.view = Object.freeze({
        id,
        get state() {
          return entry.data;
        },
        state$: subject.asObservable(),
        get disposed() {
          return entry.disposed;
        },
        change(
          params: MapElementCommands["change"]["params"],
          initiator: unknown,
        ) {
          if (entry.disposed || owner.disposed)
            return Promise.reject(new Error("Map element is disposed."));
          return owner.command("changeElement", {
            initiator,
            params: { id, change: params },
            context: {},
          });
        },
      });
      this.#elements.set(id, entry);
      subject.next(value);
    }
    for (const [id, entry] of this.#elements)
      if (!current.has(id)) {
        entry.disposed = true;
        entry.subject.complete();
        this.#elements.delete(id);
      }
  }
  static fromTerrain(volume: IsometricTerrainVolume, options?: EntityOptions) {
    this.assertTerrain(volume);
    return new Map({ format: "terrain", volume }, options);
  }
  /** Explicit legacy LocationState adapter. No translation to terrain or new persisted fields. */
  static fromLocation(
    location: Record<string, unknown>,
    options?: EntityOptions,
  ) {
    return new Map({ format: "location", location }, options);
  }
  static deserialize(value: unknown, options?: EntityOptions) {
    if (
      !isObject(value) ||
      value.type !== "map" ||
      value.schemaVersion !== 1 ||
      !isObject(value.data)
    )
      throw new TypeError("Choose a supported Map envelope.");
    const data = value.data;
    if (data.format === "terrain")
      return this.fromTerrain(data.volume as IsometricTerrainVolume, options);
    if (data.format === "location" && isObject(data.location))
      return this.fromLocation(data.location, options);
    throw new TypeError("Choose a supported Map format.");
  }
  serializePayload() {
    const data = this.serialize().data;
    return data.format === "terrain" ? data.volume : data.location;
  }
  /** Choosing image presentation must not fabricate terrain or image content. */
  static authoringMap(
    previousMap: unknown,
    image: WorldLocationDefinition["image"],
    orientation: LocationMapOrientation,
  ): WorldLocationDefinition["map"] {
    if (orientation === "isometric") {
      if (isObject(previousMap) && previousMap.kind === "isometric") {
        return previousMap as unknown as WorldLocationDefinition["map"];
      }
      throw new Error(
        "Create a terrain map in the map editor before choosing isometric.",
      );
    }
    if (!image?.assetId)
      throw new Error("Choose a map image before saving this location.");
    return { kind: "image" };
  }
  static mapIssue(value: unknown) {
    return locationMapIssue(value);
  }
  static terrainIssue(value: unknown) {
    return terrainVolumeIssue(value);
  }
  static assertTerrain(
    value: unknown,
  ): asserts value is IsometricTerrainVolume {
    const issue = this.terrainIssue(value);
    if (issue) throw new TypeError(issue);
  }
  static applyTerrainWrites(
    volume: IsometricTerrainVolume,
    writes: readonly TerrainCellWrite[],
  ): TerrainEditResult {
    const result = applyWrites(volume, writes);
    const previousCells = terrainCellIndex(volume);
    const previousChunks = new globalThis.Map(
      volume.chunks.map((chunk) => [terrainAddressKey(chunk.address), chunk]),
    );
    return {
      ...result,
      volume: {
        ...result.volume,
        chunks: result.volume.chunks.map((chunk) => ({
          ...previousChunks.get(terrainAddressKey(chunk.address)),
          ...chunk,
        })),
      },
      undo: result.undo.map((write) => {
        const previous = previousCells.get(terrainAddressKey(write.address));
        if (!previous) return write;
        const { offset: _offset, ...cell } = previous;
        return { ...write, cell };
      }),
    };
  }
  static editTerrainSelection(
    ...args: Parameters<typeof editSelection>
  ): TerrainEditResult {
    const [volume] = args;
    const candidate = editSelection(...args);
    const previous = terrainCellIndex(volume);
    const writes = candidate.redo.map((write) => {
      if (write.cell === null) return write;
      const before = previous.get(terrainAddressKey(write.address));
      const extras = Object.fromEntries(
        Object.entries(before ?? {}).filter(
          ([key]) =>
            ![
              "offset",
              "materialKey",
              "shape",
              "opening",
              "smoothing",
            ].includes(key),
        ),
      );
      return { ...write, cell: { ...extras, ...write.cell } };
    });
    return this.applyTerrainWrites(volume, writes);
  }
  private static selected(
    volume: IsometricTerrainVolume,
    selection: readonly TerrainAddress[],
  ) {
    this.assertTerrain(volume);
    if (!Array.isArray(selection)) throw new TypeError("Choose map cells.");
    const cells = terrainCellIndex(volume),
      selected = new globalThis.Map<string, TerrainAddress>();
    for (const address of selection) {
      if (!isTerrainAddress(address, volume.dimensions))
        throw new TypeError("The selection is outside the map.");
      selected.set(terrainAddressKey(address), address);
    }
    return [...selected].flatMap(([key, address]) => {
      const cell = cells.get(key);
      return cell ? [{ address, cell }] : [];
    });
  }
  static openingWrites(
    volume: IsometricTerrainVolume,
    selection: readonly TerrainAddress[],
    settings: OpeningSettings | null,
    newId: () => string,
  ): TerrainCellWrite[] {
    const cells = this.selected(volume, selection);
    if (
      settings &&
      cells.some(
        ({ cell }) =>
          cell.shape.top.some((h) => h !== 1) || (cell.smoothing ?? 0) !== 0,
      )
    )
      throw new TypeError(
        "Doors and windows require cube cells with no smoothing. Select only compatible cells.",
      );
    const writes = cells
      .filter(({ cell }) => settings || cell.opening)
      .map(({ address, cell }) => {
        const { offset: _offset, opening, ...rest } = cell;
        if (!settings) return { address, cell: rest };
        const next = { ...opening, ...settings, id: opening?.id ?? newId() };
        const child =
          settings.kind === "door"
            ? Door.deserializePayload(next)
            : Window.deserializePayload(next);
        try {
          return {
            address,
            cell: {
              ...rest,
              opening: child.serializePayload() as unknown as TerrainOpening,
            },
          };
        } finally {
          child.dispose();
        }
      });
    // Selection conflicts and repeated identities reject before any caller can commit a partial result.
    this.applyTerrainWrites(volume, writes);
    return writes;
  }
  static smoothingWrites(
    volume: IsometricTerrainVolume,
    selection: readonly TerrainAddress[],
    strength: number,
  ): TerrainCellWrite[] {
    if (!Number.isFinite(strength) || strength < 0 || strength > 1)
      throw new TypeError("Choose smoothing between zero and one.");
    const cells = this.selected(volume, selection);
    if (strength > 0 && cells.some(({ cell }) => cell.opening))
      throw new TypeError(
        "Doors and windows cannot be smoothed. Remove openings from the selection first.",
      );
    return cells.map(({ address, cell }) => {
      const { offset: _offset, ...rest } = cell;
      return { address, cell: { ...rest, smoothing: strength } };
    });
  }
  /** Stable owner-routed facades. Only the parent Map commits persisted element state. */
  elements(): readonly OwnedMapElement[] {
    if (this.disposed) throw new Error("Map is disposed.");
    return [...this.#elements.values()].map((entry) => entry.view);
  }
  protected validateState(data: DeepReadonly<MapData>) {
    let issue: string | undefined;
    if (data.format === "terrain") issue = Map.terrainIssue(data.volume);
    else {
      if (data.location.map !== undefined)
        issue = Map.mapIssue(data.location.map);
      if (!issue && data.location.walls !== undefined) {
        if (!Array.isArray(data.location.walls))
          issue = "Choose a valid image-map element list.";
        else {
          const ids = new Set<unknown>();
          for (const wall of data.location.walls) {
            issue = mapElementIssue(wall);
            if (issue) break;
            const id = (wall as MapElementData).id;
            if (ids.has(id)) {
              issue = "Map element identities must be unique.";
              break;
            }
            ids.add(id);
          }
        }
      }
    }
    return issue ? [{ code: "map-invalid", message: issue }] : [];
  }
  protected handleCommand<K extends keyof MapCommands>(
    name: K,
    invocation: CommandInvocation<MapCommands[K]>,
  ): EntityTransition<MapData, MapEvents> {
    let data = copyEntityData(this.state.data) as MapData;
    if (name === "writeTerrain") {
      if (data.format !== "terrain")
        throw new TypeError("Load terrain before editing its cells.");
      data = {
        ...data,
        volume: Map.applyTerrainWrites(
          data.volume,
          (invocation.params as MapCommands["writeTerrain"]["params"]).writes,
        ).volume,
      };
    } else if (name === "changeElement") {
      const { id, change } =
        invocation.params as MapCommands["changeElement"]["params"];
      if (data.format === "terrain") {
        const cells = terrainCellIndex(data.volume);
        const entry = [...cells].find(([, cell]) => cell.opening?.id === id);
        if (!entry) throw new TypeError("Choose an existing map opening.");
        const [key, cell] = entry;
        const [x, y, z] = key.split(",").map(Number);
        const { offset: _offset, ...rest } = cell;
        const opening = MapElement.change(
          cell.opening as unknown as MapElementData,
          change,
        ) as unknown as TerrainOpening;
        data = {
          ...data,
          volume: Map.applyTerrainWrites(data.volume, [
            { address: { x, y, z }, cell: { ...rest, opening } },
          ]).volume,
        };
      } else {
        const walls = data.location.walls;
        if (
          !Array.isArray(walls) ||
          !walls.some((w) => isObject(w) && w.id === id)
        )
          throw new TypeError("Choose an existing map element.");
        data = {
          ...data,
          location: {
            ...data.location,
            walls: walls.map((w) =>
              isObject(w) && w.id === id ? MapElement.change(w, change) : w,
            ),
          },
        };
      }
    } else throw new TypeError("Unknown Map command.");
    return {
      data,
      events: [{ name: "changed", context: { format: data.format } }],
    };
  }
}
