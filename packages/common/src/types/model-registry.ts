import type {
  CampaignDefinitionId,
  DefinitionId,
  EntityId,
  JsonValue,
  MediaAssetId,
  ModelElementId,
  ModelElementRevisionId,
  ModelMigrationPlanId,
  ModelRegistryId,
  ModelSchemaReleaseId,
  NamespacedKey,
  RulesSource,
  StateIdentity,
  UserId,
  WorldDefinitionId,
} from "./primitives";
import type { DefinitionRevisionIdentity } from "./versioning";

export const MODEL_ELEMENT_KINDS = [
  "concept",
  "field",
  "relationship",
  "vocabulary",
  "vocabulary-option",
] as const;

export type ModelElementKind = (typeof MODEL_ELEMENT_KINDS)[number];
export type ModelSemanticRole = NamespacedKey;
export type ModelElementStatus = "active" | "archived";

export type ModelRegistryProvenance =
  | {
      readonly kind: "system";
      readonly namespace: string;
      readonly version: string;
    }
  | {
      readonly kind: "plugin";
      readonly namespace: string;
      readonly pluginId: string;
      readonly pluginVersion: string;
    }
  | {
      readonly kind: "gm";
      readonly namespace: string;
      readonly ownerUserId: UserId;
    };

export type ModelApplicabilityScope =
  | { readonly kind: "global" }
  | { readonly kind: "world"; readonly worldDefinitionId: WorldDefinitionId }
  | {
      readonly kind: "campaign-definition";
      readonly campaignDefinitionId: CampaignDefinitionId;
    };

export interface ModelRegistry {
  readonly identity: StateIdentity<ModelRegistryId>;
  readonly key: NamespacedKey;
  readonly name: string;
  readonly description?: string;
  readonly provenance: ModelRegistryProvenance;
}

export interface ModelPresentation {
  readonly label: string;
  readonly pluralLabel?: string;
  readonly description?: string;
  readonly helpText?: string;
  readonly group?: string;
  readonly order?: number;
  readonly icon?: string;
  readonly mediaAssetId?: MediaAssetId;
  readonly editor?:
    | "text"
    | "textarea"
    | "number"
    | "checkbox"
    | "select"
    | "multiselect"
    | "reference"
    | "custom";
  readonly placeholder?: string;
  readonly unit?: string;
  readonly advanced?: boolean;
  readonly layout?: {
    readonly section?: string;
    readonly span?: 1 | 2 | 3 | 4;
    readonly anchor?: { readonly x: number; readonly y: number };
  };
}

export type ModelAtomicValueType =
  | {
      readonly kind: "string";
      readonly minimumLength?: number;
      readonly maximumLength?: number;
      readonly pattern?: string;
    }
  | {
      readonly kind: "integer" | "number";
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | { readonly kind: "boolean" }
  | { readonly kind: "json" }
  | {
      readonly kind: "vocabulary-option-reference";
      readonly vocabularyId: ModelElementId;
    }
  | {
      readonly kind: "definition-reference";
      readonly conceptId: ModelElementId;
    }
  | {
      readonly kind: "entity-reference";
      readonly conceptId: ModelElementId;
    }
  | {
      readonly kind: "concept-value";
      readonly conceptId: ModelElementId;
    };

export type ModelFieldValueType =
  | ModelAtomicValueType
  | { readonly kind: "list"; readonly item: ModelAtomicValueType };

export interface ModelCardinality {
  readonly minimum: number;
  readonly maximum?: number;
  readonly unique?: boolean;
}

export interface ModelExpression {
  readonly language: "cel";
  readonly profile: "aow:model-expression/v1";
  readonly source: string;
  readonly resultType: ModelFieldValueType;
}

export type ModelValueSource =
  | { readonly kind: "literal"; readonly value: JsonValue }
  | { readonly kind: "expression"; readonly expression: ModelExpression };

export interface ModelFieldConstraints {
  readonly allowedValues?: readonly JsonValue[];
  readonly validationExpressions?: readonly ModelExpression[];
}

export type ModelDependencyKind = "requires" | "conflicts-with" | "replaces";

export interface ModelDependency {
  readonly kind: ModelDependencyKind;
  readonly targetElementId: ModelElementId;
  readonly rationale?: string;
}

export interface ModelConceptPayload {
  readonly kind: "concept";
  readonly parentConceptId?: ModelElementId;
  readonly capabilities?: readonly ModelSemanticRole[];
}

export interface ModelFieldPayload {
  readonly kind: "field";
  readonly ownerConceptId: ModelElementId;
  readonly storageKey: NamespacedKey;
  readonly valueType: ModelFieldValueType;
  readonly cardinality: ModelCardinality;
  readonly defaultValue?: ModelValueSource;
  readonly computedValue?: ModelExpression;
  readonly applicability?: ModelExpression;
  readonly constraints?: ModelFieldConstraints;
}

export interface ModelRelationshipPayload {
  readonly kind: "relationship";
  readonly sourceConceptId: ModelElementId;
  readonly targetConceptId: ModelElementId;
  readonly cardinality: ModelCardinality;
  readonly inverseLabel?: string;
  readonly referencePolicy:
    "same-release" | "captured-upstream" | "runtime-local";
}

export interface ModelVocabularyPayload {
  readonly kind: "vocabulary";
  readonly ordered: boolean;
}

export interface ModelVocabularyOptionPayload {
  readonly kind: "vocabulary-option";
  readonly vocabularyId: ModelElementId;
  readonly parentOptionId?: ModelElementId;
  readonly capabilities?: readonly ModelSemanticRole[];
  readonly valueMetadata?: Readonly<Record<NamespacedKey, JsonValue>>;
}

export type ModelElementPayload =
  | ModelConceptPayload
  | ModelFieldPayload
  | ModelRelationshipPayload
  | ModelVocabularyPayload
  | ModelVocabularyOptionPayload;

export interface ModelElementLineage {
  readonly id: ModelElementId;
  readonly registryId: ModelRegistryId;
  readonly key: NamespacedKey;
  readonly kind: ModelElementKind;
  readonly semanticRole: ModelSemanticRole;
  readonly applicability: ModelApplicabilityScope;
  readonly status: ModelElementStatus;
  readonly currentRevisionId?: ModelElementRevisionId;
}

export interface ModelElementRevision {
  readonly identity: DefinitionRevisionIdentity<
    ModelElementId,
    ModelElementRevisionId
  >;
  readonly payload: ModelElementPayload;
  readonly presentation: ModelPresentation;
  readonly dependencies?: readonly ModelDependency[];
  readonly source?: RulesSource;
  readonly authoredByUserId?: UserId;
}

export interface ModelSchemaReleaseSelection {
  readonly elementId: ModelElementId;
  readonly elementRevisionId: ModelElementRevisionId;
}

export interface ModelSchemaReleaseDependency {
  readonly releaseId: ModelSchemaReleaseId;
}

export interface ModelSchemaRelease {
  readonly identity: DefinitionRevisionIdentity<
    ModelRegistryId,
    ModelSchemaReleaseId
  >;
  readonly name: string;
  readonly elementSelections: readonly ModelSchemaReleaseSelection[];
  readonly dependencies?: readonly ModelSchemaReleaseDependency[];
  readonly publishedByUserId?: UserId;
}

export interface ModelConformance {
  readonly modelSchemaReleaseIds: readonly ModelSchemaReleaseId[];
  readonly conceptId: ModelElementId;
}

export interface ModelFieldValue {
  readonly fieldId: ModelElementId;
  readonly value: JsonValue;
}

export interface ModelMigrationMapping {
  /** Omitted when a target element is newly introduced. */
  readonly sourceElementId?: ModelElementId;
  /** Omitted only when the source element is explicitly retired. */
  readonly targetElementId?: ModelElementId;
  /** Required for a newly required field unless its target revision supplies a default. */
  readonly backfill?: ModelValueSource;
}

export interface ModelMigrationPlan {
  readonly id: ModelMigrationPlanId;
  readonly sourceReleaseId: ModelSchemaReleaseId;
  readonly targetReleaseId: ModelSchemaReleaseId;
  readonly mappings: readonly ModelMigrationMapping[];
  readonly createdByUserId: UserId;
  readonly createdAt: string;
}

/** A rich content Definition remains separate from the meta-model that validates it. */
export interface ModelGovernedDefinitionReference {
  readonly definitionId: DefinitionId;
  readonly conformance: ModelConformance;
}

/** Runtime entity values always resolve through a captured model release. */
export interface ModelGovernedEntityReference {
  readonly entityId: EntityId;
  readonly conformance: ModelConformance;
}
