import type {
  Distance,
  EncounterId,
  EntityId,
  ExtensionData,
  SceneId,
  StateIdentity,
} from "./primitives";
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
/** Every term is bound to captured rules content; signed dice are independent samples. */
export interface CombatContribution {
  readonly source: {
    readonly kind:
      "base" | "weapon" | "armor" | "skill" | "attribute" | "condition";
    readonly id: string;
    readonly name: string;
  };
  readonly label: string;
  readonly terms: readonly (
    | { readonly kind: "constant"; readonly value: number }
    | {
        readonly kind: "dice";
        readonly count: number;
        readonly sides: number;
        readonly sign: 1 | -1;
      }
  )[];
}
export type CombatFormula = readonly CombatContribution[];
export type CombatCost =
  | { readonly kind: "free" }
  | {
      readonly kind: "resource";
      readonly resource: string;
      readonly amount: number;
      readonly payment: "on-completion" | "on-trigger";
    };
export interface CombatReactionRule {
  readonly id: string;
  readonly name: string;
  readonly defense: CombatFormula;
  readonly cost: CombatCost;
  readonly timing: "before" | "replace" | "after";
}
export interface CombatProfile {
  readonly attackCost: CombatCost;
  readonly reactions: readonly CombatReactionRule[];
  readonly attack: CombatFormula;
  readonly defense: CombatFormula;
  readonly damage: CombatFormula;
  readonly resistance: CombatFormula;
  readonly might: CombatFormula;
  readonly reachSquares: number;
  readonly movementCheckpoints: number;
  readonly resources: Readonly<Record<string, number>>;
  readonly roundResourceLimits?: Readonly<Record<string, number>>;
  readonly rules: readonly CombatActivityRule[];
  readonly pairings: readonly CombatPairingRule[];
}
export interface CombatActivityRule {
  readonly id: string;
  readonly name: string;
  readonly kind: "potion" | "interaction" | "spell" | "death-save" | "summon";
  readonly cost?: {
    readonly resource: string;
    readonly amount: number;
    readonly payment: "on-completion";
  };
  readonly impossible: "skip";
  readonly completion:
    | { readonly kind: "apply-hp"; readonly amount: number }
    | { readonly kind: "gm-confirmation" }
    | { readonly kind: "summon"; readonly sameRoundAttackCost?: CombatCost };
}
export interface CombatPairingRule {
  readonly outcome: "winner-first";
  readonly firstLabel:
    | "concurrency advantage"
    | "concurrency disadvantage"
    | "concurrency neutral";
  readonly secondLabel:
    | "concurrency advantage"
    | "concurrency disadvantage"
    | "concurrency neutral";
  readonly id: string;
  readonly name: string;
  readonly kinds: readonly [CombatActivity["kind"], CombatActivity["kind"]];
  readonly first: CombatFormula;
  readonly second: CombatFormula;
}
export type CombatActivity = { readonly id: string; readonly name: string } & (
  | { readonly kind: "move"; readonly path: readonly Point3D[] }
  | { readonly kind: "attack"; readonly targetId: EntityId }
  | {
      readonly kind:
        "potion" | "interaction" | "spell" | "death-save" | "summon";
      readonly ruleId: string;
      readonly targetId: EntityId;
      readonly summonedAttack?: {
        readonly targetId: EntityId;
        readonly name: string;
      };
    }
  | {
      readonly kind: "reaction";
      readonly ruleId: string;
      readonly trigger: "incoming-attack";
      readonly targetId: EntityId;
      readonly response: {
        readonly name: string;
        readonly defense?: CombatFormula;
      };
      readonly timing?: "before" | "replace" | "after";
      readonly sourceIds?: readonly EntityId[];
    }
);
export interface CombatantState {
  readonly entityId: EntityId;
  readonly name: string;
  readonly controllerIds: readonly string[];
  readonly playerControlled: boolean;
  readonly visibleToPlayers: boolean;
  readonly position?: TokenPosition;
  readonly hp: number;
  readonly maxHp: number;
  readonly removed?: boolean;
  readonly incapacitation?: "unconscious" | "dead" | null;
  readonly prone?: boolean;
  readonly profile: CombatProfile;
}
export interface CombatPlan {
  readonly activities: readonly CombatActivity[];
  readonly cursor: number;
  readonly movementUsed: number;
  readonly pathIndex: number;
  readonly submitted: boolean;
  readonly revision: number;
  readonly discarded?: boolean;
  readonly reactionStates?: Readonly<
    Record<
      string,
      {
        readonly status:
          "pending" | "armed" | "triggered" | "invalidated" | "expired";
        readonly armedAfter?: string;
        readonly slot?: number;
      }
    >
  >;
  readonly armed: readonly Extract<CombatActivity, { kind: "reaction" }>[];
}
export interface CombatOutcome {
  readonly combatantId: EntityId;
  readonly hp?: number;
  readonly position?: TokenPosition;
  readonly prone?: boolean;
  readonly removed?: boolean;
  readonly incapacitation?: "unconscious" | "dead" | null;
}
export interface CombatConflict {
  readonly id: string;
  readonly slot: number;
  readonly kind: "timing" | "collision" | "interaction";
  readonly actorIds: readonly EntityId[];
  readonly activityIds: Readonly<Record<string, string>>;
  readonly reactionIds?: Readonly<Record<string, readonly string[]>>;
  readonly outcomeIds: readonly EntityId[];
  readonly defenderId?: EntityId;
  readonly focalActorId?: EntityId;
  readonly focalActivityName?: string;
  readonly description: string;
  readonly facts: readonly string[];
  readonly choices: readonly ("before" | "after" | "simultaneous" | "custom")[];
}
export interface CombatRoll {
  readonly label: string;
  readonly formula: CombatFormula;
  readonly samples: readonly number[];
  readonly total: number;
}
export interface CombatHistoryEntry {
  readonly superseded?: boolean;
  readonly round: number;
  readonly slot: number;
  readonly text: string;
  readonly visibility: "gm" | "public";
  readonly actorIds: readonly EntityId[];
  readonly rolls?: readonly CombatRoll[];
  readonly decision?: {
    readonly conflictId: string;
    readonly choice: string;
    readonly reason?: string;
  };
  readonly outcomes?: readonly CombatOutcome[];
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
  readonly schemaVersion: 2;
  readonly identity: StateIdentity<EncounterId>;
  readonly name: string;
  readonly revision: number;
  readonly randomCursor: number;
  readonly phase:
    | "setup"
    | "planning"
    | "locked"
    | "resolving"
    | "adjudication"
    | "review"
    | "published"
    | "completed";
  readonly paused: boolean;
  readonly round: number;
  readonly slot: number;
  readonly combatants: readonly CombatantState[];
  readonly simulated: readonly CombatantState[];
  readonly plans: Readonly<Record<string, CombatPlan>>;
  readonly conflict?: CombatConflict;
  readonly history: readonly CombatHistoryEntry[];
  readonly processedCommandIds: readonly string[];
  readonly environment: EncounterEnvironment;
  readonly extensions?: Extensions;
}
export type EncounterCommand = {
  readonly commandId: string;
  readonly expectedRevision: number;
} & (
  | {
      readonly kind: "edit-plan";
      readonly combatantId: EntityId;
      readonly activities: readonly CombatActivity[];
      readonly planRevision: number;
    }
  | {
      readonly kind: "submit-plan";
      readonly combatantId: EntityId;
      readonly planRevision: number;
    }
  | {
      readonly kind:
        | "lock"
        | "step"
        | "publish"
        | "next-round"
        | "complete"
        | "reopen"
        | "pause"
        | "resume";
    }
  | {
      readonly kind: "adjudicate";
      readonly conflictId: string;
      readonly focalActorId?: EntityId;
      readonly choice: "before" | "after" | "simultaneous" | "custom";
      readonly reason?: string;
      readonly outcomes?: readonly CombatOutcome[];
    }
  | {
      readonly kind: "change-combatant";
      readonly combatantId: EntityId;
      readonly hp?: number;
      readonly removed?: boolean;
      readonly incapacitation?: "unconscious" | "dead" | null;
      readonly controllerIds?: readonly string[];
    }
);
/** Trusted adapter context, never accepted as part of a player's request body. Samples are uniform [0,1). */
export interface EncounterCommandContext {
  readonly userId: string;
  readonly isGm: boolean;
  readonly rolls: readonly number[];
  readonly rollsByActor?: Readonly<Record<string, readonly number[]>>;
}
export interface PlayerEncounterProjection {
  readonly name: string;
  readonly phase: EncounterState["phase"];
  readonly paused: boolean;
  readonly round: number;
  readonly revision: number;
  readonly combatants: readonly {
    readonly entityId: EntityId;
    readonly name: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly removed?: boolean;
    readonly prone?: boolean;
    readonly incapacitation?: "unconscious" | "dead" | null;
    readonly position?: TokenPosition;
    readonly plan?: CombatPlan;
    readonly availableReactions?: readonly {
      readonly id: string;
      readonly name: string;
    }[];
    readonly availableActivities?: readonly {
      readonly id: string;
      readonly name: string;
      readonly kind: CombatActivityRule["kind"];
      readonly permitsSummonedAttack?: boolean;
    }[];
  }[];
  readonly history: readonly {
    readonly text: string;
    readonly round: number;
    readonly slot: number;
  }[];
}
