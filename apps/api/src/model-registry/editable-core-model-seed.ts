import type {
  ModelElementId,
  ModelElementLineage,
  ModelElementPayload,
  ModelElementRevision,
  ModelElementRevisionId,
  ModelPresentation,
  ModelRegistry,
  ModelRegistryId,
  ModelSchemaRelease,
  ModelSchemaReleaseId,
  NamespacedKey,
} from "@aow/common";
import {
  modelElementRevisionContentHash,
  modelSchemaReleaseContentHash,
} from "./model-registry-compiler";

const registryId = "aow:model-registry:core" as ModelRegistryId;
const publishedAt = "2026-09-05T00:00:00.000Z";
export const CORE_MODEL_SCHEMA_RELEASE_ID =
  "aow:model-schema-release:core:1" as ModelSchemaReleaseId;

const elementId = (key: string) => `aow:model-element:${key}` as ModelElementId;
const revisionId = (key: string) =>
  `aow:model-element-revision:${key}:1` as ModelElementRevisionId;

export const CORE_MODEL_ELEMENT_IDS = Object.freeze({
  creatureConcept: elementId("concept-creature"),
  itemConcept: elementId("concept-item"),
  skillConcept: elementId("concept-skill"),
  professionConcept: elementId("concept-profession"),
  backgroundConcept: elementId("concept-background"),
  attributes: elementId("vocabulary-attributes"),
  equipmentSlots: elementId("vocabulary-equipment-slots"),
  movementModes: elementId("vocabulary-movement-modes"),
  itemFamilies: elementId("vocabulary-item-families"),
  professionRanks: elementId("vocabulary-profession-ranks"),
  artRoles: elementId("vocabulary-art-roles"),
});

export interface EditableCoreModelSeed {
  readonly registry: ModelRegistry;
  readonly lineages: readonly ModelElementLineage[];
  readonly revisions: readonly ModelElementRevision[];
  readonly release: ModelSchemaRelease;
}

export interface LegacyCoreModelMapping {
  readonly legacyPath: string;
  readonly legacyValue: string;
  readonly targetElementId: ModelElementId;
  readonly rationale: string;
}

export const CORE_MODEL_LEGACY_MAPPINGS: readonly LegacyCoreModelMapping[] = [
  {
    legacyPath: "attributes.standard.will",
    legacyValue: "will",
    targetElementId: elementId("attribute-wisdom"),
    rationale:
      "The authoritative model names this Attribute Wisdom; migration explicitly preserves legacy Will values under that stable target.",
  },
  {
    legacyPath: "images.paperDollToken",
    legacyValue: "paperDollToken",
    targetElementId: elementId("art-role-side-on-token"),
    rationale:
      "The authoritative art role is Side-on Token; the current paper-doll field is mapped explicitly rather than silently renamed.",
  },
];

export function createEditableCoreModelSeed(): EditableCoreModelSeed {
  const registry: ModelRegistry = {
    identity: {
      id: registryId,
      version: { revision: 1, updatedAt: publishedAt },
    },
    key: "aow:model-core",
    name: "Age of Wonders Editable Core Model",
    provenance: { kind: "system", namespace: "aow", version: "1" },
  };
  const specs: ElementSpec[] = [
    concept("concept-creature", "aow:creature", "Creature", "aow:creature"),
    concept("concept-item", "aow:item", "Item", "aow:item"),
    concept("concept-skill", "aow:skill", "Skill", "aow:skill"),
    concept(
      "concept-profession",
      "aow:profession",
      "Profession",
      "aow:profession",
    ),
    concept(
      "concept-background",
      "aow:background",
      "Background",
      "aow:background",
    ),
    vocabulary(
      "vocabulary-attributes",
      "aow:attributes",
      "Attributes",
      "aow:attribute-registry",
    ),
    vocabulary(
      "vocabulary-equipment-slots",
      "aow:equipment-slots",
      "Equipment Slots",
      "aow:equipment-slot-registry",
    ),
    vocabulary(
      "vocabulary-movement-modes",
      "aow:movement-modes",
      "Movement Modes",
      "aow:movement-mode-registry",
    ),
    vocabulary(
      "vocabulary-item-families",
      "aow:item-families",
      "Item Families",
      "aow:item-family-registry",
    ),
    vocabulary(
      "vocabulary-profession-ranks",
      "aow:profession-ranks",
      "Profession Ranks",
      "aow:profession-rank-registry",
    ),
    vocabulary(
      "vocabulary-art-roles",
      "aow:art-roles",
      "Art Roles",
      "aow:art-role-registry",
    ),
    ...options(
      "attribute",
      CORE_MODEL_ELEMENT_IDS.attributes,
      "aow:attribute",
      [
        ["might", "Might"],
        ["intellect", "Intellect"],
        ["wisdom", "Wisdom"],
        ["hardiness", "Hardiness"],
        ["charisma", "Charisma"],
        ["agility", "Agility"],
        ["fortune", "Fortune"],
        ["sanity", "Sanity"],
      ],
      { "aow:minimum": 0, "aow:maximum": 100, "aow:default": 50 },
    ),
    ...options(
      "equipment-slot",
      CORE_MODEL_ELEMENT_IDS.equipmentSlots,
      "aow:equipment-slot",
      [
        ["pack", "Pack"],
        ["belt", "Belt"],
        ["head", "Head"],
        ["neck", "Neck"],
        ["off-hand", "Off Hand"],
        ["main-hand", "Main Hand"],
        ["chest", "Chest"],
        ["shoulders", "Shoulders"],
        ["arms", "Arms"],
        ["hands", "Hands"],
        ["legs", "Legs"],
        ["feet", "Feet"],
        ["waist", "Waist"],
        ["back", "Back"],
        ["right-finger", "Right Finger"],
        ["left-finger", "Left Finger"],
      ],
    ),
    ...options(
      "movement-mode",
      CORE_MODEL_ELEMENT_IDS.movementModes,
      "aow:movement-mode",
      [
        ["walk", "Walk"],
        ["run", "Run"],
        ["swim", "Swim"],
        ["fly", "Fly"],
        ["crawl", "Crawl"],
        ["jump", "Jump"],
      ],
    ),
    ...options(
      "item-family",
      CORE_MODEL_ELEMENT_IDS.itemFamilies,
      "aow:item-family",
      [
        ["weapon", "Weapon"],
        ["armor", "Armor"],
        ["consumable", "Consumable"],
        ["tool", "Tool"],
        ["accessory", "Accessory"],
        ["container", "Container"],
        ["loot", "Loot"],
        ["currency", "Currency"],
        ["utility", "Utility"],
        ["material", "Material"],
        ["object", "Object"],
        ["trap", "Trap"],
        ["hazard", "Hazard"],
      ],
    ),
    ...options(
      "profession-rank",
      CORE_MODEL_ELEMENT_IDS.professionRanks,
      "aow:profession-rank",
      [
        ["novice", "Novice"],
        ["apprentice", "Apprentice"],
        ["journeyman", "Journeyman"],
        ["master", "Master"],
        ["grand-master", "Grand Master"],
      ],
    ),
    ...options("art-role", CORE_MODEL_ELEMENT_IDS.artRoles, "aow:art-role", [
      ["portrait", "Portrait"],
      ["overhead-token", "Overhead Token"],
      ["side-on-token", "Side-on Token"],
    ]),
  ];
  const lineages = specs.map(toLineage);
  const revisions = specs.map(toRevision);
  const provisional: ModelSchemaRelease = {
    identity: {
      id: CORE_MODEL_SCHEMA_RELEASE_ID,
      lineageId: registryId,
      revisionNumber: 1,
      publishedAt,
      contentHash: "",
    },
    name: "Editable Core Model 1",
    elementSelections: lineages.map((lineage) => ({
      elementId: lineage.id,
      elementRevisionId: lineage.currentRevisionId!,
    })),
  };
  const release: ModelSchemaRelease = {
    ...provisional,
    identity: {
      ...provisional.identity,
      contentHash: modelSchemaReleaseContentHash(provisional),
    },
  };
  return { registry, lineages, revisions, release };
}

interface ElementSpec {
  readonly idKey: string;
  readonly key: NamespacedKey;
  readonly semanticRole: NamespacedKey;
  readonly presentation: ModelPresentation;
  readonly payload: ModelElementPayload;
}

function concept(
  idKey: string,
  key: NamespacedKey,
  label: string,
  semanticRole: NamespacedKey,
): ElementSpec {
  return {
    idKey,
    key,
    semanticRole,
    presentation: { label, pluralLabel: `${label}s` },
    payload: { kind: "concept" },
  };
}

function vocabulary(
  idKey: string,
  key: NamespacedKey,
  label: string,
  semanticRole: NamespacedKey,
): ElementSpec {
  return {
    idKey,
    key,
    semanticRole,
    presentation: { label },
    payload: { kind: "vocabulary", ordered: true },
  };
}

function options(
  idPrefix: string,
  vocabularyId: ModelElementId,
  semanticRole: NamespacedKey,
  values: readonly (readonly [key: string, label: string])[],
  valueMetadata?: Readonly<Record<NamespacedKey, number>>,
): ElementSpec[] {
  return values.map(([key, label], order) => ({
    idKey: `${idPrefix}-${key}`,
    key: `aow:${idPrefix}-${key}` as NamespacedKey,
    semanticRole,
    presentation: { label, order },
    payload: {
      kind: "vocabulary-option",
      vocabularyId,
      ...(valueMetadata ? { valueMetadata } : {}),
    },
  }));
}

function toLineage(spec: ElementSpec): ModelElementLineage {
  return {
    id: elementId(spec.idKey),
    registryId,
    key: spec.key,
    kind: spec.payload.kind,
    semanticRole: spec.semanticRole,
    applicability: { kind: "global" },
    status: "active",
    currentRevisionId: revisionId(spec.idKey),
  };
}

function toRevision(spec: ElementSpec): ModelElementRevision {
  const provisional: ModelElementRevision = {
    identity: {
      id: revisionId(spec.idKey),
      lineageId: elementId(spec.idKey),
      revisionNumber: 1,
      publishedAt,
      contentHash: "",
    },
    payload: spec.payload,
    presentation: spec.presentation,
  };
  return {
    ...provisional,
    identity: {
      ...provisional.identity,
      contentHash: modelElementRevisionContentHash(provisional),
    },
  };
}
