import type { IsometricTerrainVolume, TerrainPoint } from "./isometric-terrain";
import type { LocationImage } from "./locations";

/** GM-only read projection of captured content and continuing Instance state.
 * Opaque IDs are selection/key values only; render their accompanying names.
 * Location focus is local viewing, never a persisted scene or movement command.
 */
export interface CampaignSessionTableProjection {
  readonly sessionName: string;
  readonly campaignInstanceName: string;
  readonly status: "active" | "paused";
  readonly runtimeRevision: number;
  readonly campaignTime?: string;
  readonly captured: {
    readonly snapshotNumber: number;
    readonly campaign: {
      readonly name: string;
      readonly revisionNumber: number;
    };
    readonly world: { readonly name: string; readonly revisionNumber: number };
  };
  readonly locations: readonly { readonly id: string; readonly name: string }[];
  readonly focus:
    "requested" | "starting-location" | "first-available" | "unavailable";
  readonly location?: {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly weather?: import("./world-authoring").LocationWeather;
    readonly weatherOverridden?: boolean;
    readonly audiovisualEffects?: readonly import("./world-authoring").LocationAudiovisualEffect[];
    readonly image?: LocationImage;
    readonly terrain?: IsometricTerrainVolume;
    readonly mapStatus: "isometric" | "image" | "unavailable";
    readonly mapUnavailableReason?: string;
  };
  readonly party: readonly {
    readonly key: string;
    readonly name: string;
    readonly kind: "character" | "actor";
    readonly playerName?: string;
    readonly locationName: string;
    readonly atFocusedLocation: boolean;
    readonly position?: TerrainPoint;
  }[];
  readonly plots: readonly CampaignSessionTablePlot[];
  readonly unavailable: readonly string[];
  readonly encounter: {
    readonly status: "unavailable";
    readonly detail: string;
  };
}

export interface CampaignSessionTablePlot {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly status: string;
  readonly atFocusedLocation: boolean;
  readonly locationNames: readonly string[];
  readonly objectives: readonly {
    readonly name: string;
    readonly description?: string;
    readonly status: string;
    readonly notes?: string;
  }[];
  readonly pressures: readonly {
    readonly name: string;
    readonly description?: string;
  }[];
  readonly resistances: readonly {
    readonly name: string;
    readonly description?: string;
  }[];
  readonly discoveries: readonly {
    readonly name: string;
    readonly claims: readonly {
      readonly kind: "truth" | "belief" | "rumor";
      readonly statement: string;
      readonly revealed: boolean;
    }[];
  }[];
  readonly children: readonly CampaignSessionTablePlot[];
}
