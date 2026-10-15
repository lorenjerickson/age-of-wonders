import type { RulesCatalog } from "./catalog";
import type { CharacterState } from "./character";
import type { EncounterState } from "./combat";
import type { CreatureState } from "./creatures";
import type { RollResult } from "./dice";
import type { ItemInstance } from "./items";
import type { LocationGraphState } from "./locations";
import type {
  DecisionId,
  DefinitionId,
  EntityId,
  EventId,
  ExtensionData,
  JsonValue,
  RulesEdition,
  VersionedState,
} from "./primitives";
import type { ChoiceDefinition, RuleEffect, RuleExecutionState } from "./rules";
import type { CampaignState, ObjectState, SceneState } from "./world";

export interface GameSystemDefinition<
  Catalog extends RulesCatalog = RulesCatalog,
  Configuration extends Readonly<Record<string, JsonValue>> = Readonly<
    Record<string, JsonValue>
  >,
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly id: string;
  readonly name: string;
  readonly editions: readonly RulesEdition[];
  readonly engineSchemaVersion: string;
  readonly catalog: Catalog;
  readonly enabledVariantIds: readonly DefinitionId[];
  readonly configuration: Configuration;
  readonly extensions?: Extensions;
}

export interface PendingDecision {
  readonly id: DecisionId;
  readonly requestedByExecutionId?: string;
  readonly chooserIds: readonly string[];
  readonly choice: ChoiceDefinition;
  readonly status: "pending" | "answered" | "expired" | "cancelled";
  readonly selectedValues?: readonly JsonValue[];
  readonly expiresAt?: string;
  readonly visibility: "public" | "controller" | "gm";
}

export interface GameEvent {
  readonly id: EventId;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly gameTime?: string;
  readonly type: string;
  readonly actorId?: EntityId;
  readonly targetIds?: readonly EntityId[];
  readonly sourceDefinitionId?: DefinitionId;
  readonly payload: JsonValue;
  readonly rolls?: readonly RollResult[];
  readonly effects?: readonly RuleEffect[];
  readonly causedByEventId?: EventId;
  readonly visibility: "public" | "controllers" | "gm";
}

export interface RandomState {
  readonly algorithm: string;
  readonly seedCommitment?: string;
  readonly cursor: number;
  readonly entropyLogHash: string;
}

export interface GameEntities<
  Character extends CharacterState = CharacterState,
  Creature extends CreatureState = CreatureState,
  Item extends ItemInstance = ItemInstance,
  ObjectEntity extends ObjectState = ObjectState,
  Scene extends SceneState = SceneState,
  Geography extends LocationGraphState = LocationGraphState,
> {
  readonly characters: readonly Character[];
  readonly creatures: readonly Creature[];
  readonly items: readonly Item[];
  readonly objects: readonly ObjectEntity[];
  readonly scenes: readonly Scene[];
  readonly geography: Geography;
}

/** Complete authoritative snapshot. Definitions live in `system`; mutable facts live here. */
export interface GameState<
  Entities extends GameEntities = GameEntities,
  CustomState extends Readonly<Record<string, JsonValue>> = Readonly<
    Record<string, JsonValue>
  >,
  Extensions extends ExtensionData = ExtensionData,
> {
  readonly version: VersionedState;
  readonly systemId: string;
  readonly systemVersion: string;
  readonly campaign: CampaignState;
  readonly entities: Entities;
  readonly activeEncounter?: EncounterState;
  readonly pendingDecisions: readonly PendingDecision[];
  readonly pendingExecutions: readonly RuleExecutionState[];
  readonly events: readonly GameEvent[];
  readonly random: RandomState;
  readonly customEntityState: CustomState;
  readonly extensions?: Extensions;
}

export type GameCommand =
  | {
      readonly kind: "declare-action";
      readonly actorId: EntityId;
      readonly actionId: DefinitionId;
      readonly targetIds: readonly EntityId[];
      readonly parameters?: JsonValue;
    }
  | {
      readonly kind: "answer-decision";
      readonly decisionId: DecisionId;
      readonly values: readonly JsonValue[];
    }
  | {
      readonly kind: "move";
      readonly entityId: EntityId;
      readonly path: readonly import("./combat").Point3D[];
    }
  | {
      readonly kind: "equip-item";
      readonly creatureId: EntityId;
      readonly itemId: import("./primitives").ItemInstanceId;
      readonly slots: import("./items").CompatibleEquipmentSlotSet;
    }
  | {
      readonly kind: "unequip-item";
      readonly creatureId: EntityId;
      readonly itemId: import("./primitives").ItemInstanceId;
    }
  | {
      readonly kind: "stow-container-item";
      readonly creatureId: EntityId;
      readonly itemId: import("./primitives").ItemInstanceId;
      readonly containerItemId: import("./primitives").ItemInstanceId;
      readonly slotIndex: number;
    }
  | {
      readonly kind: "retrieve-container-item";
      readonly creatureId: EntityId;
      readonly containerItemId: import("./primitives").ItemInstanceId;
      readonly slotIndex: number;
    }
  | { readonly kind: "start-encounter"; readonly encounter: EncounterState }
  | {
      readonly kind: "encounter-command";
      readonly encounterId: string;
      readonly command: import("./combat").EncounterCommand;
    }
  | { readonly kind: "begin-rest"; readonly rest: import("./world").RestState }
  | {
      readonly kind: "set-party-location";
      readonly partyId: EntityId;
      readonly locationId: import("./primitives").LocationId;
      readonly reason: string;
    }
  | {
      readonly kind: "take-up-profession";
      readonly characterId: import("./primitives").CharacterId;
      readonly professionId: DefinitionId;
    }
  | {
      readonly kind: "spend-profession-advancement";
      readonly characterId: import("./primitives").CharacterId;
      readonly professionId: DefinitionId;
      readonly targetExpertise: string;
    }
  | {
      readonly kind: "advance-time";
      readonly amount: import("./primitives").Duration;
    }
  | {
      readonly kind: "apply-gm-effect";
      readonly effects: readonly RuleEffect[];
      readonly reason: string;
    }
  | {
      readonly kind: "custom";
      readonly command: `${string}:${string}`;
      readonly payload: JsonValue;
    };

export interface CommandResult {
  readonly commandId: string;
  readonly accepted: boolean;
  readonly stateRevision: number;
  readonly events: readonly GameEvent[];
  readonly decisions: readonly PendingDecision[];
  readonly rejection?: {
    readonly code: string;
    readonly message: string;
    readonly details?: JsonValue;
  };
}
