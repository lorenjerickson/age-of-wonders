import type { JsonValue } from "./api";

export const MODEL_STRUCTURE_KINDS = [
  "concept",
  "field",
  "relationship",
] as const;

export type ModelStructureKind = (typeof MODEL_STRUCTURE_KINDS)[number];

export type ModelFieldAtomicKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "json"
  | "vocabulary-option-reference"
  | "definition-reference"
  | "entity-reference"
  | "concept-value";

export function modelStructureKey(kind: ModelStructureKind, name: string) {
  const slug =
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "element";
  return `custom:${kind}-${slug}`;
}

export function modelStructurePayload(input: {
  kind: ModelStructureKind;
  existing?: Record<string, JsonValue>;
  parentConceptId?: string;
  ownerConceptId?: string;
  sourceConceptId?: string;
  targetConceptId?: string;
  storageKey?: string;
  atomicKind?: ModelFieldAtomicKind;
  referenceElementId?: string;
  list?: boolean;
  minimum: number;
  maximum?: number;
  unique?: boolean;
  defaultValue?: JsonValue;
  inverseLabel?: string;
  referencePolicy?: "same-release" | "captured-upstream" | "runtime-local";
}): Record<string, JsonValue> {
  const existing = input.existing ?? {};
  if (input.kind === "concept") {
    const payload: Record<string, JsonValue> = { ...existing, kind: "concept" };
    if (input.parentConceptId) payload.parentConceptId = input.parentConceptId;
    else delete payload.parentConceptId;
    return payload;
  }
  const cardinality: Record<string, JsonValue> = {
    ...objectValue(existing.cardinality),
    minimum: input.minimum,
    ...(input.maximum === undefined ? {} : { maximum: input.maximum }),
    ...(input.unique ? { unique: true } : {}),
  };
  if (input.maximum === undefined) delete cardinality.maximum;
  if (!input.unique) delete cardinality.unique;
  if (input.kind === "relationship") {
    const payload: Record<string, JsonValue> = {
      ...existing,
      kind: "relationship",
      sourceConceptId: input.sourceConceptId ?? "",
      targetConceptId: input.targetConceptId ?? "",
      cardinality,
      referencePolicy: input.referencePolicy ?? "same-release",
    };
    if (input.inverseLabel?.trim())
      payload.inverseLabel = input.inverseLabel.trim();
    else delete payload.inverseLabel;
    return payload;
  }
  const atomicKind = input.atomicKind ?? "string";
  const oldType = objectValue(existing.valueType);
  const oldAtomic =
    oldType.kind === "list" ? objectValue(oldType.item) : oldType;
  const atomic: Record<string, JsonValue> = {
    ...(oldAtomic.kind === atomicKind ? oldAtomic : {}),
    kind: atomicKind,
  };
  if (atomicKind === "vocabulary-option-reference")
    atomic.vocabularyId = input.referenceElementId ?? "";
  if (
    atomicKind === "definition-reference" ||
    atomicKind === "entity-reference" ||
    atomicKind === "concept-value"
  )
    atomic.conceptId = input.referenceElementId ?? "";
  const payload: Record<string, JsonValue> = {
    ...existing,
    kind: "field",
    ownerConceptId: input.ownerConceptId ?? "",
    storageKey: input.storageKey ?? "",
    valueType: input.list
      ? {
          ...(oldType.kind === "list" ? oldType : {}),
          kind: "list",
          item: atomic,
        }
      : atomic,
    cardinality,
  };
  if (input.defaultValue !== undefined)
    payload.defaultValue = {
      ...objectValue(existing.defaultValue),
      kind: "literal",
      value: input.defaultValue,
    };
  else if (objectValue(existing.defaultValue).kind === "literal")
    delete payload.defaultValue;
  return payload;
}

export function modelStructureLabel(kind: ModelStructureKind) {
  return kind === "concept"
    ? "Concept"
    : kind === "field"
      ? "Field"
      : "Relationship";
}

function objectValue(value: unknown): Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

/** Imported structural containers must not be silently normalized by form defaults. */
export function modelStructurePayloadEditable(
  kind: ModelStructureKind,
  payload: Record<string, JsonValue>,
): boolean {
  if (kind === "concept")
    return (
      payload.parentConceptId === undefined ||
      typeof payload.parentConceptId === "string"
    );
  const cardinality = payload.cardinality;
  if (
    !cardinality ||
    typeof cardinality !== "object" ||
    Array.isArray(cardinality)
  )
    return false;
  if (
    typeof cardinality.minimum !== "number" ||
    (cardinality.maximum !== undefined &&
      typeof cardinality.maximum !== "number") ||
    (cardinality.unique !== undefined &&
      typeof cardinality.unique !== "boolean")
  )
    return false;
  if (kind === "relationship")
    return (
      typeof payload.sourceConceptId === "string" &&
      typeof payload.targetConceptId === "string" &&
      ["same-release", "captured-upstream", "runtime-local"].includes(
        String(payload.referencePolicy),
      )
    );
  const type = objectValue(payload.valueType);
  const atomic = type.kind === "list" ? objectValue(type.item) : type;
  return (
    typeof payload.ownerConceptId === "string" &&
    typeof payload.storageKey === "string" &&
    [
      "string",
      "integer",
      "number",
      "boolean",
      "json",
      "vocabulary-option-reference",
      "definition-reference",
      "entity-reference",
      "concept-value",
    ].includes(String(atomic.kind))
  );
}
