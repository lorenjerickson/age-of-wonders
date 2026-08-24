import type { DiceExpression, NumericExpression } from "./dice";
import type { Predicate } from "./expressions";
import type {
  Attribute,
  Definition,
  DefinitionId,
  Distance,
  Duration,
  ExtensionData,
  OpenString,
  ResourcePool,
} from "./primitives";
import type { ActionCost, OutcomeDefinition, TargetDefinition } from "./rules";

export type OperatingBasis = OpenString<
  | "mechanical"
  | "chemical"
  | "electrical"
  | "thermal"
  | "optical"
  | "acoustic"
  | "biological"
  | "neurological"
  | "computational"
  | "field-effect"
  | "materials"
  | "composite"
  | "unknown"
>;

export type UnderstandingState = OpenString<
  "understood" | "empirical" | "hypothesized" | "unknown" | "classified"
>;

export type DisciplineInput =
  | { readonly kind: "vocal-command" | "acoustic-signal" }
  | { readonly kind: "manual-operation" | "gesture-control" | "body-sequence" }
  | {
      readonly kind: "material" | "consumable" | "device";
      readonly description: string;
      readonly costInGp?: number;
      readonly consumed?: boolean;
      readonly itemDefinitionId?: DefinitionId;
    }
  | {
      readonly kind: "custom";
      readonly description: string;
    };

export interface DisciplineScaling {
  readonly mode: "capacity-band" | "character-level" | "class-level" | "custom";
  readonly baseBand?: number;
  readonly intervals?: readonly number[];
  readonly addDamage?: DiceExpression;
  readonly addTargets?: NumericExpression;
  readonly additionalEffects?: readonly OutcomeDefinition[];
}

export interface DisciplineComponents {
  /** Shared rules band representing both complexity and output. */
  readonly band: number;
  readonly functionTags: readonly string[];
  readonly operatingBasis: OperatingBasis;
  readonly understanding: UnderstandingState;
  readonly observedPhenomenon: string;
  readonly mechanismDescription?: string;
  readonly provenance?: string;
  readonly extendedProcedure?: boolean;
  readonly activationTime: readonly ActionCost[];
  readonly reactionTrigger?: string;
  readonly range:
    Distance | "self" | "touch" | "sight" | "unlimited" | "special";
  readonly targets?: readonly TargetDefinition[];
  readonly inputs: readonly DisciplineInput[];
  readonly duration: Duration;
  readonly sustainedOperation?: boolean;
  readonly prerequisites?: readonly Predicate[];
  readonly outcomes: readonly OutcomeDefinition[];
  readonly scaling?: readonly DisciplineScaling[];
  readonly trainingProgramIds?: readonly DefinitionId[];
  readonly compatibleSourceIds?: readonly DefinitionId[];
  readonly relatedSkillIds?: readonly DefinitionId[];
  readonly safetyNotes?: readonly string[];
  readonly failureModes?: readonly string[];
}

export type DisciplineDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"discipline", DisciplineComponents, Extensions>;

export type DisciplineAccessMode = OpenString<
  | "trained"
  | "configured"
  | "standard-configuration"
  | "manual"
  | "linked-device"
  | "sponsored-training"
  | "remote-service"
  | "biological"
  | "integrated"
>;

export interface DisciplineSource {
  readonly id: string;
  readonly sourceDefinitionId: DefinitionId;
  readonly attribute: Attribute;
  readonly accessMode: DisciplineAccessMode;
  readonly targetingBonus: NumericExpression;
  readonly resistanceDifficulty: NumericExpression;
  readonly disciplinesLearned?: readonly DefinitionId[];
  readonly disciplinesConfigured?: readonly DefinitionId[];
  readonly procedureLibrary?: readonly DefinitionId[];
  readonly controlInterfaceItemId?: DefinitionId;
  readonly requiredToolItemId?: DefinitionId;
  readonly extendedProcedureAccess?: boolean;
  readonly bypassesInputs?: readonly DisciplineInput["kind"][];
}

export interface CapacityBandState {
  readonly band: number;
  readonly capacity: ResourcePool;
  readonly sourceIds: readonly string[];
}

export interface DisciplineState {
  readonly sources: readonly DisciplineSource[];
  readonly capacityBands: readonly CapacityBandState[];
  readonly integratedUses?: Readonly<Record<string, ResourcePool>>;
  readonly currentlyActivating?: DefinitionId;
}
