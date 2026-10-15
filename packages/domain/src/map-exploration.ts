import {
  parseTerrainExplorationSnapshot,
  updateTerrainExploration,
  type TerrainExplorationObservation,
  type TerrainExplorationSnapshot,
} from "@aow/common";
import {
  Entity,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationIssue,
} from "./entity";

export interface MapExplorationCommands {
  observe: { params: TerrainExplorationObservation; context: object };
}

/** Observer-scoped memory, separate from authored Map content and authorization. */
export class MapExploration extends Entity<
  TerrainExplorationSnapshot,
  MapExplorationCommands,
  Record<string, never>
> {
  private constructor(
    data: TerrainExplorationSnapshot,
    options?: EntityOptions,
  ) {
    super("map-exploration", data, [], { mode: "runtime" }, options);
    this.validate({ mode: "runtime" });
  }

  static deserializePayload(
    value: unknown,
    options?: EntityOptions,
  ): MapExploration {
    return new MapExploration(parseTerrainExplorationSnapshot(value), options);
  }

  static deserialize(value: unknown, options?: EntityOptions): MapExploration {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Invalid Map exploration envelope.");
    const envelope = value as Record<string, unknown>;
    if (envelope.type !== "map-exploration" || envelope.schemaVersion !== 1)
      throw new TypeError("Unsupported Map exploration envelope.");
    return this.deserializePayload(envelope.data, options);
  }

  /** Synchronous persistence adapter; inputs must already be server-authorized. */
  static observeSnapshot(
    previous: unknown | undefined,
    observation: TerrainExplorationObservation,
  ): TerrainExplorationSnapshot {
    return updateTerrainExploration(previous, observation);
  }

  static fromObservation(
    observation: TerrainExplorationObservation,
    options?: EntityOptions,
  ): MapExploration {
    return new MapExploration(
      this.observeSnapshot(undefined, observation),
      options,
    );
  }

  serializePayload(): TerrainExplorationSnapshot {
    return this.serialize().data;
  }

  protected validateState(
    data: DeepReadonly<TerrainExplorationSnapshot>,
  ): readonly ValidationIssue[] {
    try {
      parseTerrainExplorationSnapshot(data);
      return [];
    } catch {
      return [
        { code: "map-exploration", message: "Invalid Map exploration memory." },
      ];
    }
  }

  protected handleCommand<K extends keyof MapExplorationCommands>(
    name: K,
    invocation: CommandInvocation<MapExplorationCommands[K]>,
  ): EntityTransition<TerrainExplorationSnapshot, Record<string, never>> {
    if (name !== "observe")
      throw new TypeError("Unknown Map exploration command.");
    return {
      data: MapExploration.observeSnapshot(this.state.data, invocation.params),
    };
  }
}
