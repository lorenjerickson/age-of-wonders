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
    minimum: input.minimum,
    ...(input.maximum === undefined ? {} : { maximum: input.maximum }),
    ...(input.unique ? { unique: true } : {}),
  };
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
  const atomic: Record<string, JsonValue> = { kind: atomicKind };
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
    valueType: input.list ? { kind: "list", item: atomic } : atomic,
    cardinality,
  };
  if (input.defaultValue !== undefined)
    payload.defaultValue = { kind: "literal", value: input.defaultValue };
  else delete payload.defaultValue;
  return payload;
}

export function modelStructureLabel(kind: ModelStructureKind) {
  return kind === "concept"
    ? "Concept"
    : kind === "field"
      ? "Field"
      : "Relationship";
}
