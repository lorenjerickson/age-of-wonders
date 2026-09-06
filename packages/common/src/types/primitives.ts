/** Framework-free primitives shared by the fifth-edition domain model. */

declare const domainIdBrand: unique symbol;

/** Nominal identifier that prevents IDs from unrelated aggregates being mixed. */
export type DomainId<Kind extends string> = string & {
  readonly [domainIdBrand]: Kind;
};

export type DefinitionId = DomainId<"definition">;
export type EntityId = DomainId<"entity">;
export type CreatureId = DomainId<"creature">;
declare const characterIdBrand: unique symbol;
/** A character is a specialized creature and its identifier is valid wherever a CreatureId is accepted. */
export type CharacterId = CreatureId & {
  readonly [characterIdBrand]: "character";
};
export type ItemInstanceId = DomainId<"item-instance">;
export type EncounterId = DomainId<"encounter">;
export type EffectInstanceId = DomainId<"effect-instance">;
export type DecisionId = DomainId<"decision">;
export type EventId = DomainId<"event">;
export type PlayerId = DomainId<"player">;
export type UserId = DomainId<"user">;
export type PlayerProfileId = DomainId<"player-profile">;
export type AuthenticationProviderAssociationId =
  DomainId<"authentication-provider-association">;
/** @deprecated Compatibility identifier that historically conflates campaign definition and play state. */
export type CampaignId = DomainId<"campaign">;
export type WorldDefinitionId = DomainId<"world-definition">;
export type WorldDefinitionRevisionId = DomainId<"world-definition-revision">;
export type WorldDefinitionSnapshotId = DomainId<"world-definition-snapshot">;
export type CampaignDefinitionId = DomainId<"campaign-definition">;
export type CampaignDefinitionRevisionId =
  DomainId<"campaign-definition-revision">;
export type CampaignDefinitionSnapshotId =
  DomainId<"campaign-definition-snapshot">;
export type PlotDefinitionId = DomainId<"plot-definition">;
export type WorldPlacementDefinitionId = DomainId<"world-placement-definition">;
export type CampaignPlacementDefinitionId =
  DomainId<"campaign-placement-definition">;
export type CampaignInstanceId = DomainId<"campaign-instance">;
export type CampaignInstanceSnapshotId = DomainId<"campaign-instance-snapshot">;
export type CampaignInstanceRuntimeId = DomainId<"campaign-instance-runtime">;
export type CampaignInstanceRuntimeCheckpointId =
  DomainId<"campaign-instance-runtime-checkpoint">;
export type CampaignInstancePlacementRealizationId =
  DomainId<"campaign-instance-placement-realization">;
export type CampaignInstanceMigrationAuditId =
  DomainId<"campaign-instance-migration-audit">;
export type CampaignInstanceMembershipId =
  DomainId<"campaign-instance-membership">;
export type CampaignInstanceInvitationId =
  DomainId<"campaign-instance-invitation">;
export type AgentId = DomainId<"agent">;
export type CampaignInstanceAgentParticipationId =
  DomainId<"campaign-instance-agent-participation">;
export type SessionParticipationId = DomainId<"session-participation">;
export type SessionInvitationId = DomainId<"session-invitation">;
export type SessionPresenceLeaseId = DomainId<"session-presence-lease">;
export type SessionEventId = DomainId<"session-event">;
export type SessionRuntimeBoundaryId = DomainId<"session-runtime-boundary">;
export type SessionSummaryId = DomainId<"session-summary">;
/** @deprecated Use CampaignInstanceMembershipId for definition/instance-safe participation. */
export type CampaignMembershipId = DomainId<"campaign-membership">;
/** @deprecated Use CampaignInstanceInvitationId for definition/instance-safe invitations. */
export type CampaignInvitationId = DomainId<"campaign-invitation">;
export type CharacterCreationDraftId = DomainId<"character-creation-draft">;
export type SessionId = DomainId<"session">;
export type SceneId = DomainId<"scene">;
export type LocationId = DomainId<"location">;
export type LocationConnectionId = DomainId<"location-connection">;
export type MediaAssetId = DomainId<"media-asset">;
export type ModelRegistryId = DomainId<"model-registry">;
export type ModelElementId = DomainId<"model-element">;
export type ModelElementRevisionId = DomainId<"model-element-revision">;
export type ModelSchemaReleaseId = DomainId<"model-schema-release">;
export type ModelMigrationPlanId = DomainId<"model-migration-plan">;

export type RulesEdition = "2014" | "2024" | `homebrew:${string}`;
export type RulesNamespace = string;
export type NamespacedKey = `${string}:${string}`;
export type RulePath = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ExtensionData = Readonly<Record<NamespacedKey, JsonValue>>;

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

/** Preserves suggestions for standard values while accepting namespaced homebrew values. */
export type OpenString<Standard extends string> = Standard | (string & {});

export const STANDARD_ATTRIBUTES = [
  "might",
  "intellect",
  "will",
  "hardiness",
  "charisma",
  "agility",
  "fortune",
  "sanity",
] as const;

export type StandardAttribute = (typeof STANDARD_ATTRIBUTES)[number];
export type Attribute = StandardAttribute | NamespacedKey;

declare const attributeScoreBrand: unique symbol;

/** An integer attribute score in the inclusive range 0..100. */
export type AttributeScore = number & {
  readonly [attributeScoreBrand]: "attribute-score";
};

export const ATTRIBUTE_SCORE_RANGE = Object.freeze({
  minimum: 0,
  maximum: 100,
});

export function isAttributeScore(value: number): value is AttributeScore {
  return (
    Number.isInteger(value) &&
    value >= ATTRIBUTE_SCORE_RANGE.minimum &&
    value <= ATTRIBUTE_SCORE_RANGE.maximum
  );
}

export function attributeScore(value: number): AttributeScore {
  if (!isAttributeScore(value)) {
    throw new RangeError(
      `Attribute score must be an integer from 0 through 100; received ${value}.`,
    );
  }

  return value;
}

/** Requires every standard attribute while isolating namespaced homebrew attributes. */
export interface AttributeCollection<Value> {
  readonly standard: Readonly<Record<StandardAttribute, Value>>;
  readonly custom?: Readonly<Record<NamespacedKey, Value>>;
}

export interface PartialAttributeCollection<Value> {
  readonly standard: Readonly<Partial<Record<StandardAttribute, Value>>>;
  readonly custom?: Readonly<Record<NamespacedKey, Value>>;
}

export const DEFAULT_ATTRIBUTE_SCORES: Readonly<
  Record<StandardAttribute, AttributeScore>
> = Object.freeze({
  might: attributeScore(50),
  intellect: attributeScore(50),
  will: attributeScore(50),
  hardiness: attributeScore(50),
  charisma: attributeScore(50),
  agility: attributeScore(50),
  fortune: attributeScore(50),
  sanity: attributeScore(50),
});

export const DEFAULT_ATTRIBUTES: AttributeCollection<AttributeScore> =
  Object.freeze({
    standard: DEFAULT_ATTRIBUTE_SCORES,
  });

export interface RulesSource {
  readonly namespace: RulesNamespace;
  readonly edition: RulesEdition;
  readonly book?: string;
  readonly page?: number;
  readonly url?: string;
  readonly license?:
    "CC-BY-4.0" | "OGL-1.0a" | OpenString<"proprietary" | "private">;
}

export interface DefinitionIdentity<Key extends NamespacedKey = NamespacedKey> {
  readonly id: DefinitionId;
  readonly key: Key;
  readonly name: string;
  readonly description?: string;
  readonly source: RulesSource;
  readonly tags?: readonly string[];
}

/** Composes stable identity, a discriminant, domain components, and homebrew data. */
export interface Definition<
  Kind extends string,
  Components extends object,
  Extensions extends ExtensionData = ExtensionData,
  Key extends NamespacedKey = NamespacedKey,
> {
  readonly identity: DefinitionIdentity<Key>;
  readonly kind: Kind;
  readonly components: Components;
  readonly extensions?: Extensions;
}

export interface EntityReference<Kind extends string = string> {
  readonly id: EntityId;
  readonly kind: Kind;
}

export interface DefinitionReference<Kind extends string = string> {
  readonly id: DefinitionId;
  readonly kind: Kind;
}

export type DistanceUnit =
  "foot" | "mile" | "square" | "hex" | "meter" | "kilometer";

export interface Distance {
  readonly value: number;
  readonly unit: DistanceUnit;
}

export type WeightUnit = "pound" | "ounce" | "kilogram";

export interface Weight {
  readonly value: number;
  readonly unit: WeightUnit;
}

export type TimeUnit =
  "turn" | "round" | "minute" | "hour" | "day" | "week" | "month" | "year";

export type Duration =
  | { readonly kind: "instantaneous" }
  | { readonly kind: "until-event"; readonly event: string }
  | { readonly kind: "permanent"; readonly neutralizable?: boolean }
  | {
      readonly kind: "measured";
      readonly amount: number;
      readonly unit: TimeUnit;
    }
  | { readonly kind: "special"; readonly description: string };

export interface CurrencyAmount {
  readonly denomination: OpenString<"cp" | "sp" | "ep" | "gp" | "pp">;
  readonly amount: number;
}

export type SizeCategory = OpenString<
  "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan"
>;

export type DamageType = OpenString<
  | "ballistic"
  | "bludgeoning"
  | "chemical"
  | "cold"
  | "concussive"
  | "electrical"
  | "explosive"
  | "fire"
  | "ionizing"
  | "neurological"
  | "piercing"
  | "poison"
  | "slashing"
>;

export type CreatureNature = OpenString<
  | "organism"
  | "engineered-organism"
  | "machine"
  | "composite"
  | "collective"
  | "field-phenomenon"
  | "unknown"
>;

export type ConditionType = OpenString<
  | "blinded"
  | "influenced"
  | "deafened"
  | "exhaustion"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "immobilized-transformed"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
>;

export type MovementMode = OpenString<
  "burrow" | "climb" | "fly" | "swim" | "walk"
>;

export type SenseType = OpenString<
  | "normal"
  | "blindsight"
  | "darkvision"
  | "tremorsense"
  | "multispectral"
  | "field-detection"
  | "material-penetration"
  | "projection-discrimination"
  | "unresolved-advanced-sensing"
>;

export interface ResourcePool {
  readonly current: number;
  readonly maximum: number;
  readonly temporary?: number;
}

export interface VersionedState {
  readonly revision: number;
  readonly updatedAt: string;
}

/** Identity and optimistic-concurrency metadata composed into mutable aggregates. */
export interface StateIdentity<Id extends string> {
  readonly id: Id;
  readonly version: VersionedState;
}
