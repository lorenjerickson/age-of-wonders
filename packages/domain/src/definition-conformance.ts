import type { WorldDefinitionRecord } from "./world-definition";
import type { CompiledModelElement } from "./model-schema";
import { CreatureDefinition } from "./creature-definition";
import { ItemDefinition } from "./item-definition";
import { SkillDefinition } from "./skill-definition";
import { ProfessionDefinition } from "./profession-definition";
import { BackgroundDefinition } from "./background-definition";
import type { CampaignDraftRecord } from "./campaign-definition-policy";
export function assertWorldGovernedConformance(
  records: readonly WorldDefinitionRecord[],
  rootReleaseIds: readonly string[],
  elements: readonly CompiledModelElement[],
  declaredDefinitionIds?: ReadonlySet<string>,
  mode: "draft" | "publication" = "publication",
): void {
  const conceptIds = new Set(
    elements
      .filter((element) => element.lineage.kind === "concept")
      .map((element) => element.lineage.id as string),
  );
  for (const record of records) {
    if (
      declaredDefinitionIds &&
      record.resourceType === "definitions" &&
      !declaredDefinitionIds.has(record.sourceId)
    ) {
      continue;
    }
    if (!isObject(record.payload)) continue;
    const conformance = record.payload.conformance;
    const hasGovernedValues = "modelValues" in record.payload;
    const definitionType = governedDefinitionKind(
      record.resourceType,
      record.payload,
    );
    if (
      definitionType === "creature" ||
      definitionType === "item" ||
      definitionType === "skill" ||
      definitionType === "profession" ||
      definitionType === "background"
    ) {
      const entityClass =
        definitionType === "creature"
          ? CreatureDefinition
          : definitionType === "item"
            ? ItemDefinition
            : definitionType === "skill"
              ? SkillDefinition
              : definitionType === "profession"
                ? ProfessionDefinition
                : BackgroundDefinition;
      const entity = entityClass.deserializePayload(
        // Explicit adapter for pre-kind authored records; no stored payload is changed.
        { ...record.payload, kind: definitionType },
        {
          sourceId: record.sourceId,
          mode,
          model: {
            releaseIds: rootReleaseIds,
            elements: elements.map((element) => ({
              key: element.lineage.key,
              id: element.lineage.id,
              kind: element.lineage.kind,
              semanticRole: element.lineage.semanticRole,
              valueMetadata: isObject(element.revision.payload)
                ? element.revision.payload.valueMetadata
                : undefined,
            })),
          },
        },
      );
      try {
        const issue = entity.state.metadata.validity.issues.find(
          (issue) => issue.code === `${definitionType}-model-invalid`,
        );
        if (issue) throw new TypeError(issue.message);
      } finally {
        entity.dispose();
      }
      continue;
    }
    const expectedRole = definitionType
      ? `aow:${definitionType}`
      : record.resourceType === "world-placements"
        ? "aow:world-placement"
        : undefined;
    const matchingConcepts = expectedRole
      ? elements.filter(
          (element) =>
            element.lineage.kind === "concept" &&
            element.lineage.semanticRole === expectedRole,
        )
      : [];
    if (!isObject(conformance)) {
      if (hasGovernedValues || definitionType || matchingConcepts.length > 0)
        throw new TypeError(
          "A governed authored resource is missing Model Schema conformance.",
        );
      continue;
    }
    const selected = conformance.modelSchemaReleaseIds;
    if (
      !Array.isArray(selected) ||
      selected.length !== rootReleaseIds.length ||
      selected.some((id, index) => id !== rootReleaseIds[index])
    ) {
      throw new TypeError(
        "A governed authored resource does not conform to the draft's exact Model Schema releases.",
      );
    }
    if (
      typeof conformance.conceptId !== "string" ||
      !conceptIds.has(conformance.conceptId)
    ) {
      throw new TypeError(
        "A governed authored resource references an unavailable Model concept.",
      );
    }
    if (expectedRole) {
      if (
        matchingConcepts.length === 0 ||
        !matchingConcepts.some(
          ({ lineage }) => conformance.conceptId === lineage.id,
        )
      ) {
        throw new TypeError(
          "A governed authored resource uses the wrong Model concept.",
        );
      }
    }
  }
}

function governedDefinitionKind(
  resourceType: string,
  payload: Record<string, unknown>,
): "creature" | "item" | "skill" | "profession" | "background" | undefined {
  if (resourceType !== "definitions") return undefined;
  if (
    payload.kind === "creature" ||
    payload.kind === "item" ||
    payload.kind === "skill" ||
    payload.kind === "profession" ||
    payload.kind === "background"
  )
    return payload.kind;
  // Explicit compatibility for records written before Definition.kind became authoritative.
  if (
    payload.kind === undefined &&
    (payload.definitionType === "creature" || payload.definitionType === "item")
  )
    return payload.definitionType;
  return undefined;
}
export function assertCampaignGovernedConformance(
  records: readonly CampaignDraftRecord[],
  releaseIds: readonly string[],
  elements: readonly CompiledModelElement[],
  canonicalJsonHash: (value: unknown) => string,
  isPublicationJson: (value: unknown) => boolean,
): void {
  const concepts = new Map(
    elements
      .filter((element) => element.lineage.kind === "concept")
      .map((element) => [element.lineage.id as string, element]),
  );
  const fields = elements.filter(
    (element) =>
      element.lineage.kind === "field" &&
      isObject(element.revision.payload) &&
      element.revision.payload.kind === "field",
  );
  for (const record of records) {
    const semanticRole =
      record.resourceType === "plots"
        ? "aow:plot"
        : record.resourceType === "campaign-placements"
          ? "aow:campaign-placement"
          : undefined;
    if (!semanticRole || !isObject(record.payload)) continue;
    const matchingConcepts = [...concepts.values()].filter(
      (element) => element.lineage.semanticRole === semanticRole,
    );
    const conformance = record.payload.conformance;
    if (matchingConcepts.length === 0) {
      if (
        conformance !== undefined ||
        record.payload.modelValues !== undefined
      ) {
        throw new TypeError(
          "Campaign content declares Model values without an applicable Campaign concept.",
        );
      }
      continue;
    }
    if (
      !isObject(conformance) ||
      !Array.isArray(conformance.modelSchemaReleaseIds) ||
      conformance.modelSchemaReleaseIds.length !== releaseIds.length ||
      conformance.modelSchemaReleaseIds.some(
        (id, index) => id !== releaseIds[index],
      ) ||
      typeof conformance.conceptId !== "string" ||
      !matchingConcepts.some(
        ({ lineage }) => lineage.id === conformance.conceptId,
      )
    ) {
      throw new TypeError(
        "Campaign content must declare exact conformance to an applicable Campaign concept.",
      );
    }
    const values = record.payload.modelValues;
    if (!isObject(values)) {
      throw new TypeError(
        "Campaign content governed by a Model concept must declare Model field values.",
      );
    }
    const ownedConceptIds = conceptAncestry(conformance.conceptId, concepts);
    const byStorageKey = new Map(
      fields.flatMap((element) => {
        const payload = element.revision.payload;
        return isObject(payload) &&
          typeof payload.ownerConceptId === "string" &&
          ownedConceptIds.has(payload.ownerConceptId) &&
          typeof payload.storageKey === "string"
          ? [[payload.storageKey, element] as const]
          : [];
      }),
    );
    if (Object.keys(values).some((key) => !byStorageKey.has(key))) {
      throw new TypeError(
        "Campaign content includes a Model field that is not declared by its concept.",
      );
    }
    for (const [storageKey, element] of byStorageKey) {
      const field = element.revision.payload;
      if (
        !isObject(field) ||
        !isObject(field.cardinality) ||
        !isObject(field.valueType)
      ) {
        throw new TypeError("A selected Campaign Model field is malformed.");
      }
      const value = values[storageKey];
      const minimum =
        typeof field.cardinality.minimum === "number"
          ? field.cardinality.minimum
          : 0;
      if (value === undefined) {
        if (
          minimum > 0 &&
          field.defaultValue === undefined &&
          field.computedValue === undefined
        ) {
          throw new TypeError(
            "Campaign content is missing a required Model field.",
          );
        }
        continue;
      }
      assertCampaignModelValue(
        value,
        field,
        canonicalJsonHash,
        isPublicationJson,
      );
    }
  }
}

function conceptAncestry(
  conceptId: string,
  concepts: ReadonlyMap<string, CompiledModelElement>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  let current: string | undefined = conceptId;
  while (current && !ids.has(current)) {
    ids.add(current);
    const payload: unknown = concepts.get(current)?.revision.payload;
    current =
      isObject(payload) && typeof payload.parentConceptId === "string"
        ? payload.parentConceptId
        : undefined;
  }
  return ids;
}

function assertCampaignModelValue(
  value: unknown,
  field: Record<string, unknown>,
  canonicalJsonHash: (value: unknown) => string,
  isPublicationJson: (value: unknown) => boolean,
): void {
  const valueType = field.valueType;
  const cardinality = field.cardinality;
  if (
    !isObject(valueType) ||
    !isObject(cardinality) ||
    !matchesModelValueType(value, valueType, isPublicationJson)
  ) {
    throw new TypeError("A Campaign Model field value has the wrong type.");
  }
  const count = Array.isArray(value) ? value.length : 1;
  const minimum =
    typeof cardinality.minimum === "number" ? cardinality.minimum : 0;
  const maximum =
    typeof cardinality.maximum === "number" ? cardinality.maximum : undefined;
  if (count < minimum || (maximum !== undefined && count > maximum)) {
    throw new TypeError(
      "A Campaign Model field value violates its cardinality.",
    );
  }
  if (
    cardinality.unique === true &&
    Array.isArray(value) &&
    new Set(value.map((entry) => canonicalJsonHash(entry))).size !==
      value.length
  ) {
    throw new TypeError("A Campaign Model field requires unique values.");
  }
  const constraints = field.constraints;
  if (isObject(constraints)) {
    if (Array.isArray(constraints.allowedValues)) {
      const allowed = new Set(
        constraints.allowedValues.map((entry) => canonicalJsonHash(entry)),
      );
      const entries = Array.isArray(value) ? value : [value];
      if (entries.some((entry) => !allowed.has(canonicalJsonHash(entry)))) {
        throw new TypeError(
          "A Campaign Model field value is outside its allowed values.",
        );
      }
    }
    if (
      Array.isArray(constraints.validationExpressions) &&
      constraints.validationExpressions.length > 0
    ) {
      throw new TypeError(
        "Campaign Model validation expressions cannot yet be evaluated safely.",
      );
    }
  }
  assertAtomicModelBounds(value, valueType);
}

function matchesModelValueType(
  value: unknown,
  valueType: Record<string, unknown>,
  isPublicationJson: (value: unknown) => boolean,
): boolean {
  if (valueType.kind === "list") {
    return (
      Array.isArray(value) &&
      isObject(valueType.item) &&
      value.every((entry) =>
        matchesAtomicModelValue(
          entry,
          valueType.item as Record<string, unknown>,
          isPublicationJson,
        ),
      )
    );
  }
  return matchesAtomicModelValue(value, valueType, isPublicationJson);
}

function matchesAtomicModelValue(
  value: unknown,
  valueType: Record<string, unknown>,
  isPublicationJson: (value: unknown) => boolean,
): boolean {
  if (valueType.kind === "json") return isPublicationJson(value);
  if (valueType.kind === "string") return typeof value === "string";
  if (valueType.kind === "boolean") return typeof value === "boolean";
  if (valueType.kind === "integer")
    return typeof value === "number" && Number.isInteger(value);
  if (valueType.kind === "number")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

function assertAtomicModelBounds(
  value: unknown,
  valueType: Record<string, unknown>,
): void {
  if (
    valueType.kind === "list" &&
    Array.isArray(value) &&
    isObject(valueType.item)
  ) {
    for (const entry of value) assertAtomicModelBounds(entry, valueType.item);
    return;
  }
  if (typeof value === "string") {
    const minimum =
      typeof valueType.minimumLength === "number" ? valueType.minimumLength : 0;
    const maximum =
      typeof valueType.maximumLength === "number"
        ? valueType.maximumLength
        : undefined;
    if (typeof valueType.pattern === "string") {
      throw new TypeError(
        "Campaign Model pattern constraints cannot yet be evaluated safely.",
      );
    }
    if (
      value.length < minimum ||
      (maximum !== undefined && value.length > maximum)
    ) {
      throw new TypeError(
        "A Campaign Model text field violates its constraints.",
      );
    }
  }
  if (typeof value === "number") {
    const minimum =
      typeof valueType.minimum === "number" ? valueType.minimum : undefined;
    const maximum =
      typeof valueType.maximum === "number" ? valueType.maximum : undefined;
    if (
      (minimum !== undefined && value < minimum) ||
      (maximum !== undefined && value > maximum)
    ) {
      throw new TypeError(
        "A Campaign Model numeric field violates its constraints.",
      );
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
