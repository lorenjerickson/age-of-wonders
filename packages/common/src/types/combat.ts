import type { D20TestDefinition, RollResult } from "./dice";
import type {
  DefinitionId,
  Distance,
  EncounterId,
  EntityId,
  ExtensionData,
  SceneId,
  StateIdentity,
} from "./primitives";
import type { ActionCost, RuleExecutionState } from "./rules";

export type GridType = "gridless" | "square" | "hex-column" | "hex-row";

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface TokenPosition {
  readonly sceneId: SceneId;
  readonly point: Point3D;
  readonly elevation?: Distance;
  readonly facing?: number;
  readonly occupiedCells?: readonly Point3D[];
}

export type Cover = "none" | "half" | "three-quarters" | "total";
export type LightLevel = "bright-light" | "dim-light" | "darkness" | string;

export interface CombatantTurnState {
  readonly actionAvailable: boolean;
  readonly bonusActionAvailable: boolean;
  readonly reactionAvailable: boolean;
  readonly movementRemaining: Readonly<Record<string, Distance>>;
  readonly freeObjectInteractionAvailable: boolean;
  readonly legendaryActionsRemaining?: number;
  readonly customEconomy?: Readonly<Record<string, number>>;
}

export interface InitiativeEntry {
  readonly combatantId: EntityId;
  readonly initiative: number;
  readonly tiebreaker?: number;
  readonly groupId?: string;
  readonly delayedUntil?: number;
  readonly surprised?: boolean;
  readonly hasActed: boolean;
}

export interface CombatantState {
  readonly entityId: EntityId;
  readonly position?: TokenPosition;
  readonly initiative?: number;
  readonly hiddenFrom: readonly EntityId[];
  readonly detectedBy: readonly EntityId[];
  readonly coverFrom: Readonly<Record<string, Cover>>;
  readonly lightLevel?: LightLevel;
  readonly turn: CombatantTurnState;
  readonly mountedOn?: EntityId;
  readonly controllingMount?: boolean;
  readonly grappledBy?: readonly EntityId[];
  readonly sustainingOperations?: readonly DefinitionId[];
  readonly readyAction?: {
    readonly actionId: DefinitionId;
    readonly trigger: string;
    readonly costsPaid: readonly ActionCost[];
  };
}

export interface EncounterEnvironment {
  readonly sceneId?: SceneId;
  readonly grid: GridType;
  readonly scale: Distance;
  readonly difficultTerrain?: readonly string[];
  readonly hazards?: readonly EntityId[];
  readonly lightSources?: readonly EntityId[];
  readonly weather?: string;
  readonly underwater?: boolean;
  readonly planarTraits?: readonly string[];
  readonly lairOwnerId?: EntityId;
}

export interface EncounterState<
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly identity: StateIdentity<EncounterId>;
  readonly name: string;
  readonly phase: "setup" | "initiative" | "active" | "paused" | "completed";
  readonly round: number;
  readonly turnIndex: number;
  readonly activeCombatantId?: EntityId;
  readonly initiative: readonly InitiativeEntry[];
  readonly combatants: readonly CombatantState[];
  readonly environment: EncounterEnvironment;
  readonly pendingExecutions: readonly RuleExecutionState[];
  readonly rollHistory: readonly RollResult[];
  readonly extensions?: Extensions;
}

export interface AttackResolution {
  readonly attackerId: EntityId;
  readonly targetId: EntityId;
  readonly attack: D20TestDefinition;
  readonly attackRoll: RollResult;
  readonly targetArmorClass: number;
  readonly cover: Cover;
  readonly hit: boolean;
  readonly critical: boolean;
  readonly damageRolls: readonly RollResult[];
}
