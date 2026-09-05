import type {
  JsonValue,
  ModelAtomicValueType,
  ModelElementId,
  ModelElementLineage,
  ModelElementRevision,
  ModelFieldValueType,
  ModelMigrationPlan,
  ModelRegistry,
  ModelSchemaRelease,
  ModelSchemaReleaseId,
} from "@aow/common";
import { canonicalJsonHash } from "../domain/snapshot-manifest";

export interface ModelSchemaCompilationInput {
  readonly registry: ModelRegistry;
  readonly release: ModelSchemaRelease;
  readonly lineages: readonly ModelElementLineage[];
  readonly revisions: readonly ModelElementRevision[];
  readonly dependencies?: readonly CompiledModelSchema[];
}

export interface CompiledModelElement {
  readonly sourceReleaseId: ModelSchemaReleaseId;
  readonly lineage: ModelElementLineage;
  readonly revision: ModelElementRevision;
}

export interface CompiledModelSchema {
  readonly registryId: ModelRegistry["identity"]["id"];
  readonly releaseId: ModelSchemaReleaseId;
  readonly releaseIdentity: ModelSchemaRelease["identity"];
  readonly contentHash: string;
  readonly elements: readonly CompiledModelElement[];
}

export interface ModelRegistryValidationIssue {
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
}

export interface ModelRegistryValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ModelRegistryValidationIssue[];
}

export type ModelMigrationValidationResult = ModelRegistryValidationResult;

export class ModelRegistryCompilationError extends Error {
  constructor(readonly issues: readonly ModelRegistryValidationIssue[]) {
    super(
      `Model release compilation is blocked by ${issues.length} validation issue${issues.length === 1 ? "" : "s"}.`,
    );
    this.name = "ModelRegistryCompilationError";
  }
}

/** Canonical immutable content hash; callers never supply their own hash input. */
export function modelElementRevisionContentHash(
  revision: ModelElementRevision,
): string {
  return canonicalJsonHash({
    identity: {
      id: revision.identity.id,
      lineageId: revision.identity.lineageId,
      revisionNumber: revision.identity.revisionNumber,
      predecessorRevisionId: revision.identity.predecessorRevisionId ?? null,
      publishedAt: revision.identity.publishedAt,
    },
    payload: revision.payload,
    presentation: revision.presentation,
    dependencies: [...(revision.dependencies ?? [])].sort(compareDependency),
    source: revision.source ?? null,
    authoredByUserId: revision.authoredByUserId ?? null,
  });
}

export function modelSchemaReleaseContentHash(
  release: ModelSchemaRelease,
): string {
  return canonicalJsonHash({
    identity: {
      id: release.identity.id,
      lineageId: release.identity.lineageId,
      revisionNumber: release.identity.revisionNumber,
      predecessorRevisionId: release.identity.predecessorRevisionId ?? null,
      publishedAt: release.identity.publishedAt,
    },
    name: release.name,
    elementSelections: [...release.elementSelections].sort(compareSelection),
    dependencies: [...(release.dependencies ?? [])].sort((left, right) =>
      left.releaseId.localeCompare(right.releaseId),
    ),
    publishedByUserId: release.publishedByUserId ?? null,
  });
}

export function validateModelSchemaCompilation(
  input: ModelSchemaCompilationInput,
): ModelRegistryValidationResult {
  const issues: ModelRegistryValidationIssue[] = [];
  const add = (code: string, subject: string, detail: string) =>
    issues.push({ code, subject, detail });
  const lineageById = uniqueIndex(
    input.lineages,
    (lineage) => lineage.id,
    (lineage) => lineage.key,
    "duplicate-element-identity",
    add,
  );
  const revisionById = uniqueIndex(
    input.revisions,
    (revision) => revision.identity.id,
    (revision) =>
      lineageById.get(revision.identity.lineageId)?.key ?? "Model element",
    "duplicate-revision-identity",
    add,
  );
  const lineageByKey = new Map<string, ModelElementLineage>();
  for (const lineage of input.lineages) {
    if (lineageByKey.has(lineage.key)) {
      add(
        "duplicate-element-key",
        lineage.key,
        "More than one element uses this stable key in the registry.",
      );
    }
    lineageByKey.set(lineage.key, lineage);
    validateLineage(input.registry, lineage, add);
  }

  if (input.release.identity.lineageId !== input.registry.identity.id) {
    add(
      "release-registry-mismatch",
      input.release.name,
      "The release belongs to a different Model Registry.",
    );
  }
  if (input.release.elementSelections.length === 0) {
    add(
      "release-empty",
      input.release.name,
      "A model release must select at least one model element.",
    );
  }
  if (
    input.registry.provenance.kind === "gm" &&
    input.release.publishedByUserId !== input.registry.provenance.ownerUserId
  ) {
    add(
      "release-publisher-mismatch",
      input.release.name,
      "The release publisher does not own this GM registry.",
    );
  }
  const expectedHash = modelSchemaReleaseContentHash(input.release);
  if (input.release.identity.contentHash !== expectedHash) {
    add(
      "release-content-hash-mismatch",
      input.release.name,
      "The release content hash does not match its canonical selections.",
    );
  }

  const dependencyById = new Map(
    (input.dependencies ?? []).map((dependency) => [
      dependency.releaseId,
      dependency,
    ]),
  );
  for (const dependency of input.release.dependencies ?? []) {
    if (!dependencyById.has(dependency.releaseId)) {
      add(
        "release-dependency-missing",
        input.release.name,
        "An exact dependency release was not supplied for compilation.",
      );
    }
  }
  for (const supplied of input.dependencies ?? []) {
    if (
      !(input.release.dependencies ?? []).some(
        (dependency) => dependency.releaseId === supplied.releaseId,
      )
    ) {
      add(
        "undeclared-release-dependency",
        input.release.name,
        "A supplied dependency is not locked by this release.",
      );
    }
  }

  const selectedIds = new Set<string>();
  const localElements: CompiledModelElement[] = [];
  for (const selection of [...input.release.elementSelections].sort(
    compareSelection,
  )) {
    const lineage = lineageById.get(selection.elementId);
    const revision = revisionById.get(selection.elementRevisionId);
    if (selectedIds.has(selection.elementId)) {
      add(
        "duplicate-release-selection",
        lineage?.key ?? "Model element",
        "The release selects the same element more than once.",
      );
      continue;
    }
    selectedIds.add(selection.elementId);
    if (!lineage || !revision) {
      add(
        "release-selection-missing",
        lineage?.key ?? "Model element",
        "The release selection does not resolve to a lineage and revision.",
      );
      continue;
    }
    if (
      lineage.registryId !== input.registry.identity.id ||
      revision.identity.lineageId !== lineage.id
    ) {
      add(
        "release-selection-lineage-mismatch",
        lineage.key,
        "The selected revision does not belong to this registry element.",
      );
      continue;
    }
    validateRevision(input.registry, lineage, revision, add);
    localElements.push({
      sourceReleaseId: input.release.identity.id,
      lineage,
      revision,
    });
  }

  const effectiveElements = [
    ...(input.dependencies ?? []).flatMap((dependency) => dependency.elements),
    ...localElements,
  ].sort(compareCompiledElement);
  validateEffectiveGraph(effectiveElements, add);
  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject) ||
      left.detail.localeCompare(right.detail),
  );
  return { valid: issues.length === 0, issues };
}

export function compileModelSchemaRelease(
  input: ModelSchemaCompilationInput,
): CompiledModelSchema {
  const validation = validateModelSchemaCompilation(input);
  if (!validation.valid)
    throw new ModelRegistryCompilationError(validation.issues);
  const local = input.release.elementSelections.map((selection) => ({
    sourceReleaseId: input.release.identity.id,
    lineage: input.lineages.find(
      (lineage) => lineage.id === selection.elementId,
    )!,
    revision: input.revisions.find(
      (revision) => revision.identity.id === selection.elementRevisionId,
    )!,
  }));
  const elements = [
    ...(input.dependencies ?? []).flatMap((dependency) => dependency.elements),
    ...local,
  ].sort(compareCompiledElement);
  return {
    registryId: input.registry.identity.id,
    releaseId: input.release.identity.id,
    releaseIdentity: input.release.identity,
    contentHash: canonicalJsonHash({
      releaseContentHash: input.release.identity.contentHash,
      dependencyContentHashes: [...(input.dependencies ?? [])]
        .sort((left, right) => left.releaseId.localeCompare(right.releaseId))
        .map((dependency) => dependency.contentHash),
      elements: elements.map((element) => ({
        key: element.lineage.key,
        revisionId: element.revision.identity.id,
        contentHash: element.revision.identity.contentHash,
      })),
    }),
    elements,
  };
}

/** Validates an all-or-nothing, direct-lineage migration without applying it. */
export function validateModelMigrationPlan(
  plan: ModelMigrationPlan,
  source: CompiledModelSchema,
  target: CompiledModelSchema,
): ModelMigrationValidationResult {
  const issues: ModelRegistryValidationIssue[] = [];
  const add: AddIssue = (code, subject, detail) =>
    issues.push({ code, subject, detail });
  if (
    plan.sourceReleaseId !== source.releaseId ||
    plan.targetReleaseId !== target.releaseId
  ) {
    add(
      "migration-release-mismatch",
      "Model migration",
      "The plan must name the exact supplied source and target releases.",
    );
  }
  if (source.registryId !== target.registryId) {
    add(
      "migration-registry-mismatch",
      "Model migration",
      "Model release migration must remain within one registry lineage.",
    );
  }
  if (target.releaseIdentity.predecessorRevisionId !== source.releaseId) {
    add(
      "migration-lineage-not-direct",
      "Model migration",
      "Model release migration is allowed only to the direct successor release.",
    );
  }
  const sourceById = new Map(
    source.elements.map((element) => [element.lineage.id, element]),
  );
  const targetById = new Map(
    target.elements.map((element) => [element.lineage.id, element]),
  );
  const mappedSources = new Set<ModelElementId>();
  const mappedTargets = new Set<ModelElementId>();
  for (const mapping of plan.mappings) {
    const sourceElement = mapping.sourceElementId
      ? sourceById.get(mapping.sourceElementId)
      : undefined;
    const targetElement = mapping.targetElementId
      ? targetById.get(mapping.targetElementId)
      : undefined;
    const subject =
      sourceElement?.lineage.key ??
      targetElement?.lineage.key ??
      "Model element";
    if (!mapping.sourceElementId && !mapping.targetElementId) {
      add(
        "migration-mapping-empty",
        subject,
        "A mapping must identify a source, a target, or both.",
      );
    }
    if (mapping.sourceElementId) {
      if (mappedSources.has(mapping.sourceElementId)) {
        add(
          "migration-source-duplicate",
          subject,
          "A source element may be mapped only once.",
        );
      }
      mappedSources.add(mapping.sourceElementId);
      if (!sourceElement) {
        add(
          "migration-source-missing",
          subject,
          "A mapped source is absent from the exact source release.",
        );
      }
    }
    if (mapping.targetElementId) {
      if (mappedTargets.has(mapping.targetElementId)) {
        add(
          "migration-target-duplicate",
          subject,
          "A target element may be mapped only once.",
        );
      }
      mappedTargets.add(mapping.targetElementId);
      if (!targetElement) {
        add(
          "migration-target-missing",
          subject,
          "A mapped target is absent from the exact target release.",
        );
      }
    }
    if (
      sourceElement &&
      targetElement &&
      sourceElement.lineage.kind !== targetElement.lineage.kind
    ) {
      add(
        "migration-kind-mismatch",
        subject,
        "A migration mapping cannot change an element's fixed meta-kind.",
      );
    }
    if (mapping.backfill && !targetElement) {
      add(
        "migration-backfill-target-missing",
        subject,
        "A backfill requires a selected target element.",
      );
    }
    if (
      mapping.backfill?.kind === "literal" &&
      targetElement?.revision.payload.kind === "field" &&
      !literalMatchesType(
        mapping.backfill.value,
        targetElement.revision.payload.valueType,
      )
    ) {
      add(
        "migration-backfill-type-mismatch",
        subject,
        "The literal backfill does not match the target field type.",
      );
    }
  }
  for (const [sourceId, element] of sourceById) {
    if (!targetById.has(sourceId) && !mappedSources.has(sourceId)) {
      add(
        "migration-source-unmapped",
        element.lineage.key,
        "Every removed source element must be explicitly mapped or retired.",
      );
    }
  }
  for (const [targetId, element] of targetById) {
    const payload = element.revision.payload;
    const newlyRequired =
      !sourceById.has(targetId) &&
      payload.kind === "field" &&
      payload.cardinality.minimum > 0 &&
      payload.defaultValue === undefined &&
      payload.computedValue === undefined;
    if (newlyRequired) {
      const mapping = plan.mappings.find(
        (candidate) => candidate.targetElementId === targetId,
      );
      if (!mapping?.backfill) {
        add(
          "migration-required-field-backfill-missing",
          element.lineage.key,
          "A newly required field needs an explicit migration backfill.",
        );
      }
    }
  }
  issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.subject.localeCompare(right.subject) ||
      left.detail.localeCompare(right.detail),
  );
  return { valid: issues.length === 0, issues };
}

type AddIssue = (code: string, subject: string, detail: string) => void;

function validateLineage(
  registry: ModelRegistry,
  lineage: ModelElementLineage,
  add: AddIssue,
): void {
  if (lineage.registryId !== registry.identity.id) {
    add(
      "element-registry-mismatch",
      lineage.key,
      "The element belongs to another registry.",
    );
  }
  if (!isNamespaced(lineage.key) || !isNamespaced(lineage.semanticRole)) {
    add(
      "element-key-invalid",
      lineage.key,
      "Stable keys and semantic roles must be namespaced.",
    );
  }
  const namespace = registry.provenance.namespace;
  if (!lineage.key.startsWith(`${namespace}:`)) {
    add(
      "element-namespace-mismatch",
      lineage.key,
      "The stable key does not use its registry namespace.",
    );
  }
  if (
    registry.provenance.kind !== "gm" &&
    lineage.applicability.kind !== "global"
  ) {
    add(
      "external-scope-invalid",
      lineage.key,
      "System and plugin elements must remain globally applicable.",
    );
  }
}

function validateRevision(
  registry: ModelRegistry,
  lineage: ModelElementLineage,
  revision: ModelElementRevision,
  add: AddIssue,
): void {
  if (
    revision.identity.contentHash !== modelElementRevisionContentHash(revision)
  ) {
    add(
      "element-content-hash-mismatch",
      lineage.key,
      "The revision content hash does not match its canonical content.",
    );
  }
  if (revision.payload.kind !== lineage.kind) {
    add(
      "element-kind-mismatch",
      lineage.key,
      "The revision payload kind differs from its lineage kind.",
    );
  }
  if (revision.presentation.label.trim() === "") {
    add(
      "element-label-missing",
      lineage.key,
      "A model element needs a human-readable label.",
    );
  }
  if (
    registry.provenance.kind === "gm" &&
    revision.authoredByUserId !== registry.provenance.ownerUserId
  ) {
    add(
      "element-author-mismatch",
      lineage.key,
      "The revision author does not own this GM registry.",
    );
  }
  validateCardinalityAndExpressions(lineage.key, revision, add);
}

function validateCardinalityAndExpressions(
  subject: string,
  revision: ModelElementRevision,
  add: AddIssue,
): void {
  if (
    revision.payload.kind === "field" ||
    revision.payload.kind === "relationship"
  ) {
    const { minimum, maximum } = revision.payload.cardinality;
    if (
      !Number.isInteger(minimum) ||
      minimum < 0 ||
      (maximum !== undefined &&
        (!Number.isInteger(maximum) || maximum < minimum))
    ) {
      add(
        "cardinality-invalid",
        subject,
        "Cardinality must be a non-negative coherent integer range.",
      );
    }
  }
  if (revision.payload.kind !== "field") return;
  if (!isNamespaced(revision.payload.storageKey)) {
    add(
      "field-storage-key-invalid",
      subject,
      "A field storage key must be namespaced.",
    );
  }
  if (
    revision.payload.valueType.kind !== "list" &&
    revision.payload.cardinality.maximum !== undefined &&
    revision.payload.cardinality.maximum > 1
  ) {
    add(
      "field-cardinality-type-mismatch",
      subject,
      "A non-list field cannot have cardinality above one.",
    );
  }
  for (const expression of [
    revision.payload.computedValue,
    revision.payload.applicability,
    ...(revision.payload.constraints?.validationExpressions ?? []),
    revision.payload.defaultValue?.kind === "expression"
      ? revision.payload.defaultValue.expression
      : undefined,
  ]) {
    if (
      expression &&
      (expression.language !== "cel" ||
        expression.profile !== "aow:model-expression/v1" ||
        expression.source.trim() === "" ||
        expression.source.length > 4_096)
    ) {
      add(
        "expression-invalid",
        subject,
        "A model expression must use the supported profile and bounded source text.",
      );
    }
  }
  if (
    revision.payload.defaultValue?.kind === "literal" &&
    !literalMatchesType(
      revision.payload.defaultValue.value,
      revision.payload.valueType,
    )
  ) {
    add(
      "field-default-type-mismatch",
      subject,
      "The literal default does not match the field value type.",
    );
  }
  if (
    revision.payload.defaultValue?.kind === "expression" &&
    !sameValueType(
      revision.payload.defaultValue.expression.resultType,
      revision.payload.valueType,
    )
  ) {
    add(
      "field-default-expression-type-mismatch",
      subject,
      "The default expression result does not match the field value type.",
    );
  }
  if (
    revision.payload.computedValue &&
    !sameValueType(
      revision.payload.computedValue.resultType,
      revision.payload.valueType,
    )
  ) {
    add(
      "field-computed-type-mismatch",
      subject,
      "The computed expression result does not match the field value type.",
    );
  }
  if (
    revision.payload.applicability &&
    revision.payload.applicability.resultType.kind !== "boolean"
  ) {
    add(
      "field-applicability-type-mismatch",
      subject,
      "An applicability expression must return a boolean.",
    );
  }
  for (const validationExpression of revision.payload.constraints
    ?.validationExpressions ?? []) {
    if (validationExpression.resultType.kind !== "boolean") {
      add(
        "field-validation-type-mismatch",
        subject,
        "A validation expression must return a boolean.",
      );
    }
  }
  for (const allowedValue of revision.payload.constraints?.allowedValues ??
    []) {
    if (!literalMatchesType(allowedValue, revision.payload.valueType)) {
      add(
        "field-allowed-value-type-mismatch",
        subject,
        "An allowed value does not match the field value type.",
      );
    }
  }
}

function validateEffectiveGraph(
  elements: readonly CompiledModelElement[],
  add: AddIssue,
): void {
  const byId = new Map<ModelElementId, CompiledModelElement>();
  const byKey = new Map<string, CompiledModelElement>();
  for (const element of elements) {
    if (byId.has(element.lineage.id) || byKey.has(element.lineage.key)) {
      add(
        "effective-element-collision",
        element.lineage.key,
        "Effective releases contain a stable identity or key collision.",
      );
    }
    byId.set(element.lineage.id, element);
    byKey.set(element.lineage.key, element);
  }
  const requires = new Map<ModelElementId, ModelElementId[]>();
  for (const element of elements) {
    const references = referencedElementIds(element.revision);
    for (const reference of references) {
      if (!byId.has(reference)) {
        add(
          "element-reference-missing",
          element.lineage.key,
          "The element references content outside the exact release closure.",
        );
      }
    }
    validateReferenceKinds(element, byId, add);
    const dependencies = element.revision.dependencies ?? [];
    for (const dependency of dependencies) {
      const target = byId.get(dependency.targetElementId);
      if (!target) {
        add(
          "element-dependency-missing",
          element.lineage.key,
          "A declared dependency is absent from the exact release closure.",
        );
      } else if (dependency.kind === "conflicts-with") {
        add(
          "element-conflict",
          element.lineage.key,
          `The release includes conflicting element ${target.lineage.key}.`,
        );
      } else if (dependency.kind === "requires") {
        requires.set(element.lineage.id, [
          ...(requires.get(element.lineage.id) ?? []),
          dependency.targetElementId,
        ]);
      }
    }
  }
  detectCycles(requires, byId, "element-dependency-cycle", add);
  const hierarchy = new Map<ModelElementId, ModelElementId[]>();
  for (const element of elements) {
    const payload = element.revision.payload;
    const parent =
      payload.kind === "concept"
        ? payload.parentConceptId
        : payload.kind === "vocabulary-option"
          ? payload.parentOptionId
          : undefined;
    if (parent) hierarchy.set(element.lineage.id, [parent]);
  }
  detectCycles(hierarchy, byId, "element-hierarchy-cycle", add);
}

function validateReferenceKinds(
  element: CompiledModelElement,
  byId: ReadonlyMap<ModelElementId, CompiledModelElement>,
  add: AddIssue,
): void {
  const payload = element.revision.payload;
  const expectKind = (
    targetId: ModelElementId | undefined,
    expectedKind: CompiledModelElement["lineage"]["kind"],
    relationship: string,
  ) => {
    if (!targetId) return;
    const target = byId.get(targetId);
    if (target && target.lineage.kind !== expectedKind) {
      add(
        "element-reference-kind-mismatch",
        element.lineage.key,
        `${relationship} must reference a ${expectedKind} element.`,
      );
    }
  };
  if (payload.kind === "concept") {
    expectKind(payload.parentConceptId, "concept", "A parent concept");
  } else if (payload.kind === "field") {
    expectKind(payload.ownerConceptId, "concept", "A field owner");
    const atomic =
      payload.valueType.kind === "list"
        ? payload.valueType.item
        : payload.valueType;
    if (atomic.kind === "vocabulary-option-reference") {
      expectKind(atomic.vocabularyId, "vocabulary", "A vocabulary reference");
    } else if ("conceptId" in atomic) {
      expectKind(atomic.conceptId, "concept", "A concept reference");
    }
  } else if (payload.kind === "relationship") {
    expectKind(payload.sourceConceptId, "concept", "A relationship source");
    expectKind(payload.targetConceptId, "concept", "A relationship target");
  } else if (payload.kind === "vocabulary-option") {
    expectKind(payload.vocabularyId, "vocabulary", "A vocabulary option owner");
    expectKind(payload.parentOptionId, "vocabulary-option", "A parent option");
    const parent = payload.parentOptionId
      ? byId.get(payload.parentOptionId)
      : undefined;
    if (
      parent?.revision.payload.kind === "vocabulary-option" &&
      parent.revision.payload.vocabularyId !== payload.vocabularyId
    ) {
      add(
        "element-option-parent-vocabulary-mismatch",
        element.lineage.key,
        "A parent option must belong to the same vocabulary.",
      );
    }
  }
}

function referencedElementIds(
  revision: ModelElementRevision,
): ModelElementId[] {
  const payload = revision.payload;
  const references: ModelElementId[] = [];
  if (payload.kind === "concept" && payload.parentConceptId)
    references.push(payload.parentConceptId);
  if (payload.kind === "field") {
    references.push(
      payload.ownerConceptId,
      ...valueTypeReferences(payload.valueType),
    );
  }
  if (payload.kind === "relationship")
    references.push(payload.sourceConceptId, payload.targetConceptId);
  if (payload.kind === "vocabulary-option") {
    references.push(payload.vocabularyId);
    if (payload.parentOptionId) references.push(payload.parentOptionId);
  }
  references.push(
    ...(revision.dependencies ?? []).map(
      (dependency) => dependency.targetElementId,
    ),
  );
  return references;
}

function valueTypeReferences(valueType: ModelFieldValueType): ModelElementId[] {
  const atomic = valueType.kind === "list" ? valueType.item : valueType;
  return "conceptId" in atomic
    ? [atomic.conceptId]
    : "vocabularyId" in atomic
      ? [atomic.vocabularyId]
      : [];
}

function literalMatchesType(
  value: JsonValue,
  valueType: ModelFieldValueType,
): boolean {
  if (valueType.kind === "list") {
    return (
      Array.isArray(value) &&
      value.every((entry) => literalMatchesAtomic(entry, valueType.item))
    );
  }
  return literalMatchesAtomic(value, valueType);
}

function literalMatchesAtomic(
  value: JsonValue,
  valueType: ModelAtomicValueType,
): boolean {
  if (valueType.kind === "json") return true;
  if (valueType.kind === "string") return typeof value === "string";
  if (valueType.kind === "boolean") return typeof value === "boolean";
  if (valueType.kind === "integer")
    return typeof value === "number" && Number.isInteger(value);
  if (valueType.kind === "number")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

function sameValueType(
  left: ModelFieldValueType,
  right: ModelFieldValueType,
): boolean {
  return canonicalJsonHash(left) === canonicalJsonHash(right);
}

function detectCycles(
  edges: ReadonlyMap<ModelElementId, readonly ModelElementId[]>,
  byId: ReadonlyMap<ModelElementId, CompiledModelElement>,
  code: string,
  add: AddIssue,
): void {
  const visiting = new Set<ModelElementId>();
  const visited = new Set<ModelElementId>();
  const visit = (id: ModelElementId): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (edges.get(id) ?? []).some(visit);
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  for (const id of edges.keys()) {
    if (visit(id)) {
      add(
        code,
        byId.get(id)?.lineage.key ?? "Model element",
        "The model graph contains a cycle.",
      );
      break;
    }
  }
}

function uniqueIndex<Value>(
  values: readonly Value[],
  id: (value: Value) => string,
  subject: (value: Value) => string,
  code: string,
  add: AddIssue,
): Map<string, Value> {
  const result = new Map<string, Value>();
  for (const value of values) {
    const key = id(value);
    if (result.has(key))
      add(
        code,
        subject(value),
        "The release input contains a duplicate identity.",
      );
    else result.set(key, value);
  }
  return result;
}

function isNamespaced(value: string): boolean {
  return /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._/-]*$/i.test(value);
}

function compareSelection(
  left: ModelSchemaRelease["elementSelections"][number],
  right: ModelSchemaRelease["elementSelections"][number],
): number {
  return (
    left.elementId.localeCompare(right.elementId) ||
    left.elementRevisionId.localeCompare(right.elementRevisionId)
  );
}

function compareDependency(
  left: NonNullable<ModelElementRevision["dependencies"]>[number],
  right: NonNullable<ModelElementRevision["dependencies"]>[number],
): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.targetElementId.localeCompare(right.targetElementId) ||
    (left.rationale ?? "").localeCompare(right.rationale ?? "")
  );
}

function compareCompiledElement(
  left: CompiledModelElement,
  right: CompiledModelElement,
): number {
  return (
    left.lineage.key.localeCompare(right.lineage.key) ||
    left.revision.identity.id.localeCompare(right.revision.identity.id)
  );
}
