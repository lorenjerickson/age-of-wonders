import type { D20TestDefinition, DiceExpression } from "./dice";
import type { Predicate } from "./expressions";
import type {
  CampaignId,
  Definition,
  DefinitionId,
  Distance,
  Duration,
  EntityId,
  ExtensionData,
  LocationConnectionId,
  SessionId,
  LocationId,
  SceneId,
  StateIdentity,
} from "./primitives";
import type { RuleEffect, TraitDefinition } from "./rules";
import type { InventoryState } from "./items";

export interface CalendarInstant {
  readonly calendarId: DefinitionId;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly round?: number;
}

export interface RestState {
  readonly type: "short" | "long" | string;
  readonly startedAt: CalendarInstant;
  readonly requiredDuration: Duration;
  readonly participantIds: readonly EntityId[];
  readonly interrupted: boolean;
  readonly interruptionReason?: string;
  readonly hitDiceSpent?: Readonly<Record<string, number>>;
  readonly activities?: Readonly<Record<string, string>>;
}

export interface TravelState {
  readonly participantIds: readonly EntityId[];
  readonly originLocationId: LocationId;
  readonly destinationLocationId: LocationId;
  readonly currentLocationId: LocationId;
  /** Ordered direct edges; every consecutive edge must join and be traversable. */
  readonly routeConnectionIds: readonly LocationConnectionId[];
  readonly activeConnectionId?: LocationConnectionId;
  readonly pace: "slow" | "normal" | "fast" | string;
  readonly distanceRemaining?: Distance;
  readonly hoursTraveled: number;
  readonly forcedMarchHours: number;
  readonly navigatorId?: EntityId;
  readonly roles?: Readonly<Record<string, EntityId>>;
  readonly vehicleId?: EntityId;
  readonly lost?: boolean;
  readonly encounterChecks?: readonly DiceExpression[];
}

export interface PartyLocationState {
  readonly partyId: EntityId;
  readonly locationId: LocationId;
  readonly status: "stationary" | "traveling" | "lost";
}

export interface SocialAttitude {
  readonly npcId: EntityId;
  readonly towardId: EntityId;
  readonly attitude: "friendly" | "indifferent" | "hostile" | string;
  readonly influenceScore?: number;
  readonly knownTraits?: readonly string[];
}

export interface ObjectState<Extensions extends ExtensionData = ExtensionData> {
  readonly identity: StateIdentity<EntityId>;
  readonly definitionId?: DefinitionId;
  readonly name: string;
  readonly armorClass?: number;
  readonly hitPoints?: { readonly current: number; readonly maximum: number };
  readonly damageThreshold?: number;
  readonly immunities?: readonly string[];
  readonly locked?: boolean;
  readonly open?: boolean;
  readonly hidden?: boolean;
  readonly position?: import("./combat").TokenPosition;
  readonly inventory?: InventoryState;
  readonly extensions?: Extensions;
}

export interface HazardComponents {
  readonly detection?: D20TestDefinition;
  readonly disarm?: D20TestDefinition;
  readonly triggers: readonly {
    readonly predicate: Predicate;
    readonly effects: readonly RuleEffect[];
  }[];
  readonly reset?: Duration;
  readonly severity?: string;
}

export type HazardDefinition<
  Kind extends
    "hazard" | "trap" | "disease" | "poison" | "environmental-effect" =
    "hazard" | "trap" | "disease" | "poison" | "environmental-effect",
  Extensions extends ExtensionData = ExtensionData,
> = Definition<Kind, HazardComponents, Extensions>;

export interface SceneState<Extensions extends ExtensionData = ExtensionData> {
  readonly identity: StateIdentity<SceneId>;
  readonly name: string;
  /** Strategic context only; encounter position remains scene-local. */
  readonly locationId?: LocationId;
  readonly dimensions?: readonly [width: Distance, height: Distance];
  readonly grid?: import("./combat").GridType;
  readonly defaultLight: string;
  readonly entityIds: readonly EntityId[];
  readonly objectIds: readonly EntityId[];
  readonly hazardIds: readonly EntityId[];
  readonly traits?: readonly TraitDefinition[];
  readonly extensions?: Extensions;
}

export interface DowntimeActivityState {
  readonly id: string;
  readonly activityDefinitionId: DefinitionId;
  readonly actorIds: readonly EntityId[];
  readonly startedAt: CalendarInstant;
  readonly progress: number;
  readonly completed: boolean;
  readonly checks: readonly import("./dice").RollResult[];
}

export interface CampaignState<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<CampaignId>;
  readonly name: string;
  readonly currentTime: CalendarInstant;
  readonly activeSceneId?: SceneId;
  readonly sceneIds: readonly SceneId[];
  readonly partyIds: readonly EntityId[];
  readonly partyLocations: readonly PartyLocationState[];
  readonly rests: readonly RestState[];
  readonly travel?: TravelState;
  readonly socialAttitudes: readonly SocialAttitude[];
  readonly downtimeActivities: readonly DowntimeActivityState[];
  readonly quests?: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: "unknown" | "active" | "completed" | "failed";
    readonly objectives: readonly {
      readonly description: string;
      readonly completed: boolean;
    }[];
  }[];
  readonly globalFlags: Readonly<Record<string, boolean | number | string>>;
  readonly extensions?: Extensions;
}

/** A persisted record of one campaign play session and the state it references. */
export interface SessionState<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<SessionId>;
  readonly name: string;
  readonly worldId: LocationId;
  readonly campaignId: CampaignId;
  readonly status: "planned" | "in-progress" | "completed" | "cancelled";
  readonly scheduledFor?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly sceneIds: readonly SceneId[];
  readonly encounterIds: readonly import("./primitives").EncounterId[];
  readonly eventIds: readonly import("./primitives").EventId[];
  readonly notes?: string;
  readonly extensions?: Extensions;
}
