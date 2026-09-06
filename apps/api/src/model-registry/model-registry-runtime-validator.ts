import { BadRequestException } from "@nestjs/common";
import { isPublicationJson } from "../domain/snapshot-manifest";

const namespacedKey = /^[^:\s]+:[^:\s]+$/;
const editors = new Set([
  "text",
  "textarea",
  "number",
  "checkbox",
  "select",
  "multiselect",
  "reference",
  "custom",
]);
const dependencyKinds = new Set(["requires", "conflicts-with", "replaces"]);

export function assertModelElementRuntimeShape(value: unknown): void {
  const issues: string[] = [];
  if (!record(value)) fail(issues, "Model Element input must be an object.");
  else {
    requiredNamespaced(value.key, issues, "Element key");
    requiredNamespaced(value.semanticRole, issues, "Semantic role");
    validateApplicability(value.applicability, issues);
    validatePayload(value.payload, issues);
    if (
      typeof value.kind !== "string" ||
      !record(value.payload) ||
      value.kind !== value.payload.kind
    )
      fail(issues, "Element kind must match its payload kind.");
    validatePresentation(value.presentation, issues);
    validateDependencies(value.dependencies, issues);
    validateSource(value.source, issues);
  }
  if (!isPublicationJson(value))
    fail(issues, "Model Element content must be bounded JSON.");
  if (issues.length)
    throw new BadRequestException({
      message: "The Model Element shape is invalid.",
      issues: issues.map((detail) => ({
        code: "model-shape-invalid",
        subject: "Model Element",
        detail,
      })),
    });
}

export function assertModelMigrationMappingsRuntimeShape(value: unknown): void {
  const issues: string[] = [];
  if (!Array.isArray(value))
    fail(issues, "Model migration mappings must be an array.");
  else {
    for (const mapping of value) {
      if (!record(mapping)) {
        fail(issues, "Model migration mapping must be an object.");
        continue;
      }
      optionalId(mapping.sourceElementId, issues, "Migration source");
      optionalId(mapping.targetElementId, issues, "Migration target");
      if (
        mapping.sourceElementId === undefined &&
        mapping.targetElementId === undefined
      )
        fail(issues, "Model migration mapping must name a source or target.");
      if (mapping.backfill !== undefined)
        validateValueSource(mapping.backfill, issues);
    }
  }
  if (!isPublicationJson(value))
    fail(issues, "Model migration mappings must be bounded JSON.");
  if (issues.length)
    throw new BadRequestException({
      message: "The Model migration mapping shape is invalid.",
      issues: issues.map((detail) => ({
        code: "model-migration-shape-invalid",
        subject: "Model migration",
        detail,
      })),
    });
}

function validatePayload(value: unknown, issues: string[]): void {
  if (!record(value) || typeof value.kind !== "string") {
    fail(issues, "Payload must have a supported kind.");
    return;
  }
  switch (value.kind) {
    case "concept":
      optionalId(value.parentConceptId, issues, "Parent concept");
      optionalNamespacedArray(
        value.capabilities,
        issues,
        "Concept capabilities",
      );
      return;
    case "field":
      requiredId(value.ownerConceptId, issues, "Field owner concept");
      requiredNamespaced(value.storageKey, issues, "Field storage key");
      validateValueType(value.valueType, issues, true);
      validateCardinality(value.cardinality, issues);
      if (value.defaultValue !== undefined)
        validateValueSource(value.defaultValue, issues);
      if (value.computedValue !== undefined)
        validateExpression(value.computedValue, issues);
      if (value.applicability !== undefined)
        validateExpression(value.applicability, issues);
      validateConstraints(value.constraints, issues);
      return;
    case "relationship":
      requiredId(value.sourceConceptId, issues, "Relationship source concept");
      requiredId(value.targetConceptId, issues, "Relationship target concept");
      validateCardinality(value.cardinality, issues);
      optionalString(value.inverseLabel, issues, "Inverse label");
      if (
        !["same-release", "captured-upstream", "runtime-local"].includes(
          String(value.referencePolicy),
        )
      )
        fail(issues, "Relationship reference policy is invalid.");
      return;
    case "vocabulary":
      if (typeof value.ordered !== "boolean")
        fail(issues, "Vocabulary ordered must be boolean.");
      return;
    case "vocabulary-option":
      requiredId(value.vocabularyId, issues, "Vocabulary");
      optionalId(value.parentOptionId, issues, "Parent option");
      optionalNamespacedArray(
        value.capabilities,
        issues,
        "Option capabilities",
      );
      if (
        value.valueMetadata !== undefined &&
        (!record(value.valueMetadata) ||
          !Object.keys(value.valueMetadata).every((key) =>
            namespacedKey.test(key),
          ) ||
          !isPublicationJson(value.valueMetadata))
      )
        fail(
          issues,
          "Option value metadata must use namespaced bounded JSON fields.",
        );
      return;
    default:
      fail(issues, "Payload kind is unsupported.");
  }
}

function validateValueType(
  value: unknown,
  issues: string[],
  allowList: boolean,
): void {
  if (!record(value) || typeof value.kind !== "string") {
    fail(issues, "Field value type is invalid.");
    return;
  }
  if (value.kind === "list") {
    if (!allowList) fail(issues, "Nested list value types are not supported.");
    validateValueType(value.item, issues, false);
    return;
  }
  if (value.kind === "string") {
    optionalNonnegativeInteger(value.minimumLength, issues, "Minimum length");
    optionalNonnegativeInteger(value.maximumLength, issues, "Maximum length");
    if (
      integer(value.minimumLength) &&
      integer(value.maximumLength) &&
      value.minimumLength > value.maximumLength
    )
      fail(issues, "String length bounds are reversed.");
    optionalString(value.pattern, issues, "String pattern");
    return;
  }
  if (value.kind === "integer" || value.kind === "number") {
    optionalFinite(value.minimum, issues, "Numeric minimum");
    optionalFinite(value.maximum, issues, "Numeric maximum");
    if (
      finite(value.minimum) &&
      finite(value.maximum) &&
      value.minimum > value.maximum
    )
      fail(issues, "Numeric bounds are reversed.");
    return;
  }
  if (value.kind === "boolean" || value.kind === "json") return;
  if (value.kind === "vocabulary-option-reference") {
    requiredId(value.vocabularyId, issues, "Referenced vocabulary");
    return;
  }
  if (
    ["definition-reference", "entity-reference", "concept-value"].includes(
      value.kind,
    )
  ) {
    requiredId(value.conceptId, issues, "Referenced concept");
    return;
  }
  fail(issues, "Field value type kind is unsupported.");
}

function validateCardinality(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Cardinality must be an object.");
    return;
  }
  if (!integer(value.minimum) || value.minimum < 0)
    fail(issues, "Cardinality minimum must be a nonnegative integer.");
  optionalNonnegativeInteger(value.maximum, issues, "Cardinality maximum");
  if (
    integer(value.minimum) &&
    integer(value.maximum) &&
    value.maximum < value.minimum
  )
    fail(issues, "Cardinality bounds are reversed.");
  if (value.unique !== undefined && typeof value.unique !== "boolean")
    fail(issues, "Cardinality unique must be boolean.");
}

function validateValueSource(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Value source must be an object.");
    return;
  }
  if (value.kind === "literal") {
    if (!("value" in value) || !isPublicationJson(value.value))
      fail(issues, "Literal default must be bounded JSON.");
    return;
  }
  if (value.kind === "expression") {
    validateExpression(value.expression, issues);
    return;
  }
  fail(issues, "Value source kind is unsupported.");
}

function validateExpression(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Expression must be an object.");
    return;
  }
  if (value.language !== "cel" || value.profile !== "aow:model-expression/v1")
    fail(issues, "Expression language or profile is unsupported.");
  requiredString(value.source, issues, "Expression source");
  validateValueType(value.resultType, issues, true);
}

function validateConstraints(value: unknown, issues: string[]): void {
  if (value === undefined) return;
  if (!record(value)) {
    fail(issues, "Field constraints must be an object.");
    return;
  }
  if (
    value.allowedValues !== undefined &&
    (!Array.isArray(value.allowedValues) ||
      !isPublicationJson(value.allowedValues))
  )
    fail(issues, "Allowed values must be bounded JSON values.");
  if (value.validationExpressions !== undefined) {
    if (!Array.isArray(value.validationExpressions))
      fail(issues, "Validation expressions must be an array.");
    else
      value.validationExpressions.forEach((expression) =>
        validateExpression(expression, issues),
      );
  }
}

function validatePresentation(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Presentation must be an object.");
    return;
  }
  requiredString(value.label, issues, "Presentation label");
  for (const [field, label] of [
    ["pluralLabel", "Plural label"],
    ["description", "Description"],
    ["helpText", "Help text"],
    ["group", "Group"],
    ["icon", "Icon"],
    ["mediaAssetId", "Media asset"],
    ["placeholder", "Placeholder"],
    ["unit", "Unit"],
  ] as const)
    optionalString(value[field], issues, label);
  optionalFinite(value.order, issues, "Presentation order");
  if (
    value.editor !== undefined &&
    (typeof value.editor !== "string" || !editors.has(value.editor))
  )
    fail(issues, "Presentation editor is unsupported.");
  if (value.advanced !== undefined && typeof value.advanced !== "boolean")
    fail(issues, "Presentation advanced must be boolean.");
  if (value.layout !== undefined) validateLayout(value.layout, issues);
}

function validateLayout(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Presentation layout must be an object.");
    return;
  }
  optionalString(value.section, issues, "Layout section");
  if (value.span !== undefined && ![1, 2, 3, 4].includes(value.span as number))
    fail(issues, "Layout span must be from one through four.");
  if (
    value.anchor !== undefined &&
    (!record(value.anchor) ||
      !finite(value.anchor.x) ||
      !finite(value.anchor.y))
  )
    fail(issues, "Layout anchor must contain finite coordinates.");
}

function validateApplicability(value: unknown, issues: string[]): void {
  if (!record(value)) {
    fail(issues, "Applicability must be an object.");
    return;
  }
  if (value.kind === "global") return;
  if (value.kind === "world") {
    requiredId(value.worldDefinitionId, issues, "Applicable World");
    return;
  }
  if (value.kind === "campaign-definition") {
    requiredId(
      value.campaignDefinitionId,
      issues,
      "Applicable Campaign Definition",
    );
    return;
  }
  fail(issues, "Applicability kind is unsupported.");
}

function validateDependencies(value: unknown, issues: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(issues, "Element dependencies must be an array.");
    return;
  }
  for (const dependency of value) {
    if (!record(dependency)) {
      fail(issues, "Element dependency must be an object.");
      continue;
    }
    if (
      typeof dependency.kind !== "string" ||
      !dependencyKinds.has(dependency.kind)
    )
      fail(issues, "Element dependency kind is unsupported.");
    requiredId(dependency.targetElementId, issues, "Dependency target");
    optionalString(dependency.rationale, issues, "Dependency rationale");
  }
}

function validateSource(value: unknown, issues: string[]): void {
  if (value === undefined) return;
  if (!record(value)) {
    fail(issues, "Rules source must be an object.");
    return;
  }
  requiredString(value.namespace, issues, "Rules namespace");
  requiredString(value.edition, issues, "Rules edition");
  optionalString(value.book, issues, "Rules book");
  optionalString(value.url, issues, "Rules URL");
  optionalString(value.license, issues, "Rules license");
  if (value.page !== undefined && (!integer(value.page) || value.page < 1))
    fail(issues, "Rules page must be a positive integer.");
}

function requiredNamespaced(
  value: unknown,
  issues: string[],
  label: string,
): void {
  if (typeof value !== "string" || !namespacedKey.test(value))
    fail(issues, `${label} must be namespaced.`);
}
function optionalNamespacedArray(
  value: unknown,
  issues: string[],
  label: string,
): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      value.some(
        (entry) => typeof entry !== "string" || !namespacedKey.test(entry),
      ))
  )
    fail(issues, `${label} must contain namespaced keys.`);
}
function requiredId(value: unknown, issues: string[], label: string): void {
  if (typeof value !== "string" || !value.trim())
    fail(issues, `${label} is required.`);
}
function optionalId(value: unknown, issues: string[], label: string): void {
  if (value !== undefined) requiredId(value, issues, label);
}
function requiredString(value: unknown, issues: string[], label: string): void {
  if (typeof value !== "string" || !value.trim())
    fail(issues, `${label} is required.`);
}
function optionalString(value: unknown, issues: string[], label: string): void {
  if (value !== undefined && typeof value !== "string")
    fail(issues, `${label} must be text.`);
}
function optionalFinite(value: unknown, issues: string[], label: string): void {
  if (value !== undefined && !finite(value))
    fail(issues, `${label} must be finite.`);
}
function optionalNonnegativeInteger(
  value: unknown,
  issues: string[],
  label: string,
): void {
  if (value !== undefined && (!integer(value) || value < 0))
    fail(issues, `${label} must be a nonnegative integer.`);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function fail(issues: string[], detail: string): void {
  issues.push(detail);
}
