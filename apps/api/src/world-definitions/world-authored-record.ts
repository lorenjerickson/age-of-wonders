import { professionModifierGrantIssue, skillModifierGrantIssue } from "@aow/common";
import {
  isCreatureInstanceEmbodimentPolicy,
  type ModelConformance,
  type WorldCreatureDefinition,
  type WorldItemDefinition,
  type WorldLocationDefinition,
} from "@aow/common";

type JsonObject = Record<string, unknown>;

export function worldLocationPayload(
  id: string,
  input: {
    name: string;
    description?: string;
    kind: string;
    parentLocationId?: string;
    profileSummary?: string;
    profileTags?: string[];
    gmDescription?: string;
    discoveries?: WorldLocationDefinition["discoveries"];
    image?: Record<string, unknown>;
    mapSceneNotes?: string;
    mapOrientation?: "scenic" | "overhead" | "side-on";
  },
  previous?: unknown,
): WorldLocationDefinition {
  const prior = object(previous);
  const preserved = withoutKeys(prior, "description", "profile", "mapScene");
  const preservedProfile = withoutKeys(
    object(prior.profile),
    "summary",
    "tags",
  );
  const preservedMapScene = withoutKeys(
    object(prior.mapScene),
    "notes",
    "orientation",
  );
  const mapScene = {
    ...preservedMapScene,
    ...(input.mapSceneNotes?.trim()
      ? { notes: input.mapSceneNotes.trim() }
      : {}),
    ...(input.mapOrientation ? { orientation: input.mapOrientation } : {}),
  };
  return {
    ...preserved,
    ...(input.gmDescription !== undefined
      ? { gmDescription: input.gmDescription }
      : {}),
    ...(input.discoveries !== undefined
      ? { discoveries: input.discoveries }
      : {}),
    ...(input.image !== undefined
      ? {
          image: input.image as unknown as NonNullable<
            WorldLocationDefinition["image"]
          >,
        }
      : {}),
    identity: {
      id: id as WorldLocationDefinition["identity"]["id"],
      version: {
        revision: identityRevision(prior) + 1,
        updatedAt: new Date().toISOString(),
      },
    },
    name: input.name.trim(),
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    kind: input.kind.trim(),
    placement: input.parentLocationId
      ? {
          kind: "within-parent",
          parentLocationId: input.parentLocationId as never,
          ...(object(prior.placement).parentLocationId ===
          input.parentLocationId
            ? placementDetails(prior.placement)
            : {}),
        }
      : { kind: "root" },
    profile: {
      ...preservedProfile,
      ...(input.profileSummary?.trim()
        ? { summary: input.profileSummary.trim() }
        : {}),
      tags: (input.profileTags ?? []).map((tag) => tag.trim()).filter(Boolean),
    },
    ...(Object.keys(mapScene).length ? { mapScene } : {}),
    ...(isObject(prior.extensions)
      ? { extensions: prior.extensions as never }
      : {}),
  };
}

export function worldCreaturePayload(
  id: string,
  input: {
    name: string;
    description?: string;
    attributes: Record<string, number>;
    equipmentSlots: string[];
    instanceEmbodimentPolicy: Record<string, unknown>;
    artDirection?: string;
    movement?: WorldCreatureDefinition["components"]["movement"];
    skillDefinitionIds?: string[];
    professionDefinitionIds?: string[];
    progressiveMechanicsNotes?: string;
  },
  conformance: ModelConformance,
  previous?: unknown,
): WorldCreatureDefinition {
  const prior = object(previous);
  const priorComponents = object(prior.components);
  const preservedArt = withoutKeys(object(priorComponents.art), "direction");
  const preservedMechanics = withoutKeys(
    object(priorComponents.progressiveMechanics),
    "notes",
  );
  return {
    identity: definitionIdentity(id, input.name, input.description, prior),
    kind: "creature",
    components: {
      ...priorComponents,
      attributes: input.attributes,
      equipmentSlots: input.equipmentSlots as never,
      art: {
        ...preservedArt,
        ...(input.artDirection?.trim()
          ? { direction: input.artDirection.trim() }
          : {}),
      },
      movement: input.movement ?? [],
      skillDefinitionIds: (input.skillDefinitionIds ?? []) as never,
      professionDefinitionIds: (input.professionDefinitionIds ?? []) as never,
      progressiveMechanics: {
        ...preservedMechanics,
        ...(input.progressiveMechanicsNotes?.trim()
          ? { notes: input.progressiveMechanicsNotes.trim() }
          : {}),
      },
    },
    conformance,
    instanceEmbodimentPolicy: input.instanceEmbodimentPolicy as never,
    ...(isObject(prior.modelValues)
      ? { modelValues: prior.modelValues as never }
      : {}),
    ...(isObject(prior.extensions)
      ? { extensions: prior.extensions as never }
      : {}),
  };
}

export function worldItemPayload(
  id: string,
  input: {
    name: string;
    description?: string;
    itemFamilyKey: string;
    category: string;
    quality: "ramshackle" | "standard" | "fine" | "exquisite";
    compatibleEquipmentSlotSets: string[][];
    image: Record<string, unknown>;
  },
  conformance: ModelConformance,
  previous?: unknown,
): WorldItemDefinition {
  const prior = object(previous);
  const preservedComponents = withoutKeys(
    object(prior.components),
    "equippable",
  );
  const priorExtensions = object(prior.extensions);
  const legacyItem =
    Object.keys(prior).length > 0 && !isCanonicalItemPayload(prior)
      ? { "aow:legacy-item": prior }
      : {};
  return {
    identity: definitionIdentity(id, input.name, input.description, prior),
    kind: "item",
    components: {
      ...preservedComponents,
      category: input.category,
      quality: input.quality,
      ...(input.compatibleEquipmentSlotSets.length
        ? {
            equippable: {
              compatibleSlotSets: input.compatibleEquipmentSlotSets as never,
            },
          }
        : {}),
    },
    image: input.image as unknown as WorldItemDefinition["image"],
    conformance,
    modelValues: {
      ...(isObject(prior.modelValues) ? prior.modelValues : {}),
      "aow:item-family": input.itemFamilyKey,
    },
    ...(Object.keys(priorExtensions).length || Object.keys(legacyItem).length
      ? { extensions: { ...priorExtensions, ...legacyItem } as never }
      : {}),
  };
}

export function canonicalWorldRecordIssue(
  resourceType: string,
  sourceId: string,
  payload: unknown,
): string | undefined {
  if (resourceType === "locations") {
    if (!isObject(payload) || !isObject(payload.identity))
      return "A Location requires server-owned identity and version data.";
    if (
      payload.identity.id !== sourceId ||
      !validVersion(payload.identity.version)
    )
      return "The Location identity does not match its captured record.";
    if (
      !nonEmpty(payload.name) ||
      !nonEmpty(payload.kind) ||
      !validPlacement(payload.placement)
    )
      return "The Location name, kind, or containment placement is invalid.";
    if (
      payload.gmDescription !== undefined &&
      typeof payload.gmDescription !== "string"
    )
      return "The GM description must be text.";
    if (payload.discoveries !== undefined) {
      if (
        !Array.isArray(payload.discoveries) ||
        payload.discoveries.some(
          (claim) =>
            !isObject(claim) ||
            !nonEmpty(claim.id) ||
            !["truth", "rumor", "belief"].includes(String(claim.kind)) ||
            !nonEmpty(claim.statement),
        )
      )
        return "Discoveries require a kind and a statement.";
      const ids = payload.discoveries.map(
        (claim) => (claim as Record<string, unknown>).id,
      );
      if (new Set(ids).size !== ids.length)
        return "Each discovery must have its own identity.";
    }
    if (payload.image !== undefined) {
      const image = object(payload.image);
      if (
        !nonEmpty(image.assetId) ||
        !nonEmpty(image.altText) ||
        typeof image.width !== "number" ||
        image.width <= 0 ||
        typeof image.height !== "number" ||
        image.height <= 0 ||
        typeof image.mimeType !== "string" ||
        !image.mimeType.startsWith("image/") ||
        !["scenic", "overhead", "side-on"].includes(String(image.orientation))
      )
        return "A Location image requires an image asset, alternative text, dimensions, and orientation.";
    }
    return undefined;
  }
  if (resourceType !== "definitions" || !isObject(payload)) return undefined;
  if (payload.kind === "skill") return skillModifierGrantIssue(payload.components);
  if (payload.kind === "profession") return professionModifierGrantIssue(payload.components);
  if (payload.kind !== "creature" && payload.kind !== "item") return undefined;
  if (
    !validDefinitionIdentity(payload.identity, sourceId) ||
    !validConformance(payload.conformance)
  )
    return `The ${payload.kind === "creature" ? "Creature" : "Item"} Definition identity or Model conformance is invalid.`;
  const components = object(payload.components);
  if (payload.kind === "creature") {
    if (
      !numericRecord(components.attributes) ||
      !stringArray(components.equipmentSlots) ||
      !isObject(components.art) ||
      !validCreatureArt(components.art) ||
      !validMovement(components.movement) ||
      !nonEmptyStringArray(components.skillDefinitionIds) ||
      !nonEmptyStringArray(components.professionDefinitionIds) ||
      !isObject(components.progressiveMechanics) ||
      !isCreatureInstanceEmbodimentPolicy(payload.instanceEmbodimentPolicy)
    )
      return "The Creature Definition components or embodiment policy are invalid.";
  } else {
    const modelValues = object(payload.modelValues);
    if (
      !namespaced(modelValues["aow:item-family"]) ||
      !nonEmpty(components.category) ||
      !["ramshackle", "standard", "fine", "exquisite"].includes(
        String(components.quality),
      ) ||
      !validCompatibleSlotSets(components.equippable) ||
      !validImage(payload.image)
    )
      return "The Item Definition components, family, or image are invalid.";
  }
  return undefined;
}

function placementDetails(value: unknown): JsonObject {
  const placement = object(value);
  return {
    ...(isObject(placement.mapPosition)
      ? { mapPosition: placement.mapPosition }
      : {}),
    ...(isObject(placement.border) ? { border: placement.border } : {}),
  };
}

function definitionIdentity(
  id: string,
  name: string,
  description: string | undefined,
  prior: JsonObject,
) {
  const identity = object(prior.identity);
  return {
    id: id as never,
    key: (typeof identity.key === "string"
      ? identity.key
      : typeof prior.key === "string"
        ? prior.key
        : `world:${id}`) as never,
    name: name.trim(),
    ...(description?.trim() ? { description: description.trim() } : {}),
    source: isObject(identity.source)
      ? (identity.source as never)
      : isObject(prior.source)
        ? (prior.source as never)
        : ({ namespace: "world", edition: "1" } as never),
  };
}
function identityRevision(value: JsonObject): number {
  const version = object(object(value.identity).version);
  return Number.isInteger(version.revision) && Number(version.revision) > 0
    ? Number(version.revision)
    : 0;
}
function object(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}
function withoutKeys(
  value: JsonObject,
  ...keys: readonly string[]
): JsonObject {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.has(key)),
  );
}
function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function namespaced(value: unknown): value is string {
  return nonEmpty(value) && value.includes(":");
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(namespaced);
}
function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}
function numericRecord(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        namespaced(key) && typeof entry === "number" && Number.isFinite(entry),
    )
  );
}
function validVersion(value: unknown): boolean {
  return (
    isObject(value) &&
    Number.isInteger(value.revision) &&
    Number(value.revision) > 0 &&
    nonEmpty(value.updatedAt)
  );
}
function validPlacement(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.kind === "root" ||
      (value.kind === "within-parent" && nonEmpty(value.parentLocationId)))
  );
}
function validDefinitionIdentity(value: unknown, sourceId: string): boolean {
  return (
    isObject(value) &&
    value.id === sourceId &&
    namespaced(value.key) &&
    nonEmpty(value.name) &&
    isObject(value.source)
  );
}
function validConformance(value: unknown): boolean {
  return (
    isObject(value) &&
    nonEmpty(value.conceptId) &&
    Array.isArray(value.modelSchemaReleaseIds) &&
    value.modelSchemaReleaseIds.length > 0 &&
    value.modelSchemaReleaseIds.every(nonEmpty)
  );
}
function validImage(value: unknown): boolean {
  const image = object(value);
  return (
    nonEmpty(image.assetId) &&
    nonEmpty(image.altText) &&
    typeof image.width === "number" &&
    image.width > 0 &&
    typeof image.height === "number" &&
    image.height > 0 &&
    image.width === image.height &&
    typeof image.mimeType === "string" &&
    image.mimeType.startsWith("image/")
  );
}

function validCreatureArt(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (value.direction !== undefined && typeof value.direction !== "string")
    return false;
  if (value.images === undefined) return true;
  if (!isObject(value.images)) return false;
  const images = value.images;
  return ["portrait", "overheadToken", "paperDollToken"].every((key) => {
    const image = images[key];
    return image === undefined || validCreatureImage(image);
  });
}

function validCreatureImage(value: unknown): boolean {
  const image = object(value);
  return (
    nonEmpty(image.assetId) &&
    nonEmpty(image.altText) &&
    typeof image.width === "number" &&
    image.width > 0 &&
    typeof image.height === "number" &&
    image.height > 0 &&
    typeof image.mimeType === "string" &&
    image.mimeType.startsWith("image/")
  );
}

function validMovement(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (
        !isObject(entry) ||
        !nonEmpty(entry.mode) ||
        !isObject(entry.distance)
      )
        return false;
      return (
        typeof entry.distance.value === "number" &&
        Number.isFinite(entry.distance.value) &&
        entry.distance.value >= 0 &&
        nonEmpty(entry.distance.unit) &&
        (entry.hover === undefined || typeof entry.hover === "boolean") &&
        (entry.restrictions === undefined || Array.isArray(entry.restrictions))
      );
    })
  );
}

function validCompatibleSlotSets(value: unknown): boolean {
  if (value === undefined) return true;
  if (
    !isObject(value) ||
    !Array.isArray(value.compatibleSlotSets) ||
    !value.compatibleSlotSets.length ||
    value.compatibleSlotSets.length > 200
  )
    return false;
  return value.compatibleSlotSets.every(
    (set) =>
      Array.isArray(set) &&
      set.length > 0 &&
      set.length <= 20 &&
      set.every(namespaced),
  );
}

function isCanonicalItemPayload(value: JsonObject): boolean {
  const identity = object(value.identity);
  return (
    value.kind === "item" &&
    nonEmpty(identity.id) &&
    namespaced(identity.key) &&
    isObject(value.components)
  );
}
