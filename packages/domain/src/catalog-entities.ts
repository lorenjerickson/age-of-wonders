import { RuleDefinitionEntity } from "./rule-definition-entity";
import type { CodexDefinitionValidationContext } from "./codex-definition";
import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationContext,
  type ValidationIssue,
} from "./entity";

export type CatalogState = Record<string, unknown>;
export interface CatalogValidationContext extends ValidationContext {
  /** Authorized exact capture; absence means references are unresolved, never global lookup. */
  readonly records?: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[];
}
export type CatalogCommands = {
  replace: { params: { data: CatalogState }; context: Record<string, never> };
  setEnabledVariants: {
    params: { ids: readonly string[] };
    context: Record<string, never>;
  };
};
export type CatalogEvents = {
  replaced: { id: string };
  variantsSelected: { ids: readonly string[] };
};
type CatalogKind =
  | "language"
  | "table"
  | "custom"
  | "extension-schema"
  | "rule-variant"
  | "content-pack"
  | "game-system";
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const key = (v: unknown): v is string => text(v) && /^[^:\s]+:[^\s]+$/.test(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(text);
const edition = (v: unknown) =>
  v === "2014" ||
  v === "2024" ||
  (typeof v === "string" && v.startsWith("homebrew:") && v.length > 9);
const source = (v: unknown) =>
  object(v) && text(v.namespace) && edition(v.edition);
const definition = (kind: CatalogKind) =>
  ["language", "table", "custom"].includes(kind);
const identity = (kind: CatalogKind, data: CatalogState) =>
  definition(kind) && object(data.identity) ? data.identity.id : data.id;

/** Reuses the authored dice grammar without running rolls or introducing a catalog entity. */
class CatalogGrammar extends RuleDefinitionEntity<
  Record<string, unknown>,
  CodexDefinitionValidationContext
> {
  private constructor() {
    super("catalog-grammar", {}, ["renamed"], {});
  }
  protected validateState(): readonly ValidationIssue[] {
    return [];
  }
  protected handleCommand(): never {
    throw new TypeError("Grammar validation has no commands.");
  }
  static dice(value: unknown): ValidationIssue[] {
    const grammar = new CatalogGrammar();
    try {
      return grammar.ruleValueIssues(
        value,
        "components.roll",
        "catalog-table-roll",
        "dice-expression",
      );
    } finally {
      grammar.dispose();
    }
  }
}

/** Persisted catalog roots own identity; entries, patches, dependencies and nested schemas are values. */
export abstract class CatalogEntity extends Entity<
  CatalogState,
  CatalogCommands,
  CatalogEvents,
  CatalogValidationContext
> {
  protected constructor(
    readonly catalogKind: CatalogKind,
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super(
      catalogKind,
      data,
      ["replaced", "variantsSelected"],
      context,
      options,
    );
    this.validate(context);
  }
  protected static payload(value: unknown): CatalogState {
    const data = copyEntityData(value);
    if (!object(data))
      throw new TypeError("A catalog record requires a JSON object.");
    return data;
  }
  protected static decode(value: unknown, kind: CatalogKind): CatalogState {
    if (object(value) && value.type === kind) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported catalog schema version.");
      return this.payload(value.data);
    }
    return this.payload(value);
  }
  serializePayload(): CatalogState {
    return this.serialize().data;
  }
  protected handleCommand<K extends keyof CatalogCommands>(
    name: K,
    invocation: CommandInvocation<CatalogCommands[K]>,
  ): EntityTransition<CatalogState, CatalogEvents> {
    const current = this.serializePayload();
    if (name === "replace") {
      const params = invocation.params as CatalogCommands["replace"]["params"];
      const next = CatalogEntity.payload(params.data);
      if (
        identity(this.catalogKind, next) !== identity(this.catalogKind, current)
      )
        throw new TypeError("A catalog identity cannot be replaced.");
      return {
        data: next,
        events: [
          {
            name: "replaced",
            context: { id: String(identity(this.catalogKind, next)) },
          },
        ],
      };
    }
    if (name === "setEnabledVariants" && this.catalogKind === "game-system") {
      const params =
        invocation.params as CatalogCommands["setEnabledVariants"]["params"];
      if (
        !strings(params.ids) ||
        new Set(params.ids).size !== params.ids.length
      )
        throw new TypeError("Select distinct variant identities.");
      return {
        data: { ...current, enabledVariantIds: [...params.ids] },
        events: [{ name: "variantsSelected", context: { ids: params.ids } }],
      };
    }
    throw new TypeError("Unsupported catalog command.");
  }
}

function validationTools(
  kind: CatalogKind,
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
) {
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, path?: string) =>
    issues.push({
      code: `catalog-${code}`,
      message,
      ...(path ? { path } : {}),
    });
  const optionalStrings = (value: unknown, path: string) => {
    if (value !== undefined && !strings(value))
      add("list", "Provide a list of distinct references.", path);
  };
  const reference = (resource: string, id: unknown, path: string) => {
    if (!text(id)) {
      add("reference", "Provide a reference.", path);
      return undefined;
    }
    if (!context.records) {
      issues.push({
        code: "catalog-reference-unresolved",
        message: "Catalog relationships require an exact authorized capture.",
        path,
        unresolved: true,
        blocking: context.mode !== "draft",
      });
      return undefined;
    }
    const record = context.records.find(
      (r) => r.resourceType === resource && r.sourceId === id,
    );
    if (!record || !object(record.payload))
      add(
        "reference-missing",
        "Referenced content is absent from the authorized capture.",
        path,
      );
    return record && object(record.payload) ? record.payload : undefined;
  };
  if (!text(identity(kind, data as CatalogState)))
    add("identity", "Provide a catalog identity.");
  const descriptive =
    definition(kind) && object(data.identity) ? data.identity : data;
  if (
    descriptive.description !== undefined &&
    typeof descriptive.description !== "string"
  )
    add("description", "Provide a textual description.");
  if (
    definition(kind) &&
    descriptive.tags !== undefined &&
    !strings(descriptive.tags)
  )
    add("tags", "Provide textual tags.");

  return { issues, add, optionalStrings, reference };
}
function validateLanguageDefinition(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "language",
    data,
    context,
  );
  if (
    data.kind !== "language" ||
    !object(data.identity) ||
    !text(data.identity.name) ||
    !key(data.identity.key) ||
    !source(data.identity.source)
  )
    add(
      "definition",
      "Provide a matching definition kind, name, key and rules source.",
    );
  if (!object(data.components)) {
    add("components", "Provide definition components.");
    return issues;
  }
  const components = data.components;

  for (const field of ["script", "rarity"])
    if (
      components[field] !== undefined &&
      typeof components[field] !== "string"
    )
      add(
        "language",
        "Language script and rarity must be text.",
        `components.${field}`,
      );

  return issues;
}

function validateTableDefinition(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "table",
    data,
    context,
  );
  if (
    data.kind !== "table" ||
    !object(data.identity) ||
    !text(data.identity.name) ||
    !key(data.identity.key) ||
    !source(data.identity.source)
  )
    add(
      "definition",
      "Provide a matching definition kind, name, key and rules source.",
    );
  if (!object(data.components)) {
    add("components", "Provide definition components.");
    return issues;
  }
  const components = data.components;

  if (!Array.isArray(components.entries))
    add("table", "Provide table entries.", "components.entries");
  else
    components.entries.forEach((entry, i) => {
      if (
        !object(entry) ||
        typeof entry.minimum !== "number" ||
        !Number.isFinite(entry.minimum) ||
        typeof entry.maximum !== "number" ||
        !Number.isFinite(entry.maximum) ||
        entry.minimum > entry.maximum ||
        !Object.hasOwn(entry, "value") ||
        (entry.weight !== undefined &&
          (typeof entry.weight !== "number" || !Number.isFinite(entry.weight)))
      )
        add(
          "table-entry",
          "Provide a finite ordered range, value and finite optional weight.",
          `components.entries.${i}`,
        );
    });
  if (components.roll !== undefined)
    issues.push(...CatalogGrammar.dice(components.roll));
  return issues;
}

function validateCustomDefinition(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "custom",
    data,
    context,
  );
  if (
    data.kind !== "custom" ||
    !object(data.identity) ||
    !text(data.identity.name) ||
    !key(data.identity.key) ||
    !source(data.identity.source)
  )
    add(
      "definition",
      "Provide a matching definition kind, name, key and rules source.",
    );
  if (!object(data.components)) {
    add("components", "Provide definition components.");
    return issues;
  }
  const components = data.components;

  if (!key(components.definitionKind) || !Object.hasOwn(components, "data"))
    add("custom", "Provide a registered definition kind and JSON payload.");
  let schema: Record<string, unknown> | undefined;
  if (components.schemaId !== undefined)
    schema = reference(
      "extension-schemas",
      components.schemaId,
      "components.schemaId",
    );
  else if (!context.records)
    issues.push({
      code: "catalog-reference-unresolved",
      message: "Custom registration requires an authorized capture.",
      unresolved: true,
      blocking: context.mode !== "draft",
    });
  else {
    const registrations = context.records.filter(
      (r) =>
        r.resourceType === "extension-schemas" &&
        object(r.payload) &&
        r.payload.key === components.definitionKind,
    );
    if (registrations.length > 1) {
      issues.push({
        code: "catalog-custom-ambiguous",
        message:
          "Select an explicit schema when this definition kind has multiple registrations.",
        path: "components.schemaId",
        unresolved: true,
        blocking: context.mode !== "draft",
      });
      return issues;
    }
    schema = registrations[0]?.payload as Record<string, unknown> | undefined;
  }
  if (context.records && !schema)
    add("custom-unregistered", "The custom definition kind is not registered.");
  if (
    schema &&
    ((components.schemaId !== undefined && schema.id !== components.schemaId) ||
      schema.key !== components.definitionKind ||
      !Array.isArray(schema.appliesTo) ||
      !schema.appliesTo.some(
        (target) => target === "custom" || target === components.definitionKind,
      ))
  )
    add(
      "custom-schema",
      "Select a registration applicable to this custom definition kind.",
    );

  if (schema) issues.push(...validateExtensionSchema(schema, context));
  return issues;
}

function validateExtensionSchema(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "extension-schema",
    data,
    context,
  );

  if (
    !key(data.key) ||
    !strings(data.appliesTo) ||
    !text(data.semanticVersion) ||
    !(object(data.jsonSchema) || typeof data.jsonSchema === "boolean")
  )
    add(
      "extension-schema",
      "Provide an extension key, applicable kinds, schema and semantic version.",
    );

  return issues;
}

function validateRuleVariant(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "rule-variant",
    data,
    context,
  );

  if (
    !key(data.key) ||
    !text(data.name) ||
    typeof data.defaultEnabled !== "boolean"
  )
    add("variant", "Provide a variant key, name and default selection.");
  optionalStrings(data.requires, "requires");
  optionalStrings(data.conflictsWith, "conflictsWith");
  for (const field of ["requires", "conflictsWith"])
    if (Array.isArray(data[field]))
      for (const id of data[field]) {
        if (id === data.id)
          add(
            "variant-self",
            "A variant cannot require or conflict with itself.",
            field,
          );
        reference("rule-variants", id, field);
      }
  if (
    data.rulePatches !== undefined &&
    (!Array.isArray(data.rulePatches) ||
      data.rulePatches.some(
        (p) =>
          !object(p) ||
          !text(p.target) ||
          !["add", "replace", "remove", "merge"].includes(String(p.operation)),
      ))
  )
    add("variant-patches", "Provide supported patches with targets.");

  return issues;
}

function validateContentPack(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "content-pack",
    data,
    context,
  );

  if (
    !text(data.namespace) ||
    !text(data.name) ||
    !text(data.version) ||
    !edition(data.edition) ||
    !source(data.source) ||
    !strings(data.definitionIds)
  )
    add("pack", "Provide pack metadata and distinct definition references.");
  optionalStrings(data.variantIds, "variantIds");
  for (const [field, resource] of [
    ["definitionIds", "definitions"],
    ["variantIds", "rule-variants"],
  ])
    if (Array.isArray(data[field]))
      for (const id of data[field]) reference(resource, id, field);
  if (
    data.dependencies !== undefined &&
    (!Array.isArray(data.dependencies) ||
      data.dependencies.some(
        (d) =>
          !object(d) ||
          !text(d.namespace) ||
          !text(d.versionRange) ||
          (d.optional !== undefined && typeof d.optional !== "boolean"),
      ))
  )
    add(
      "pack-dependencies",
      "Provide dependencies with namespace and version range.",
    );
  if (Array.isArray(data.dependencies))
    data.dependencies.forEach((dependency, index) => {
      if (
        !object(dependency) ||
        !text(dependency.namespace) ||
        dependency.optional === true
      )
        return;
      const path = `dependencies.${index}.namespace`;
      if (!context.records) {
        issues.push({
          code: "catalog-pack-dependency-unresolved",
          message: "Pack dependencies require an exact authorized capture.",
          path,
          unresolved: true,
          blocking: context.mode !== "draft",
        });
      } else if (
        !context.records.some(
          (record) =>
            record.resourceType === "content-packs" &&
            object(record.payload) &&
            record.payload.namespace === dependency.namespace,
        )
      ) {
        issues.push({
          code: "catalog-pack-dependency-missing",
          message:
            "A required content pack is absent from the authorized capture.",
          path,
          ...(context.mode === "draft"
            ? { unresolved: true, blocking: false }
            : {}),
        });
      }
    });
  if (data.extensionSchemas !== undefined) {
    if (!Array.isArray(data.extensionSchemas))
      add("pack-schemas", "Provide extension schemas.");
    else
      for (const schema of data.extensionSchemas)
        if (!object(schema))
          add("pack-schemas", "Provide extension schema objects.");
        else issues.push(...validateExtensionSchema(schema, context));
  }

  return issues;
}

function validateGameSystem(
  data: DeepReadonly<CatalogState>,
  context: CatalogValidationContext,
): ValidationIssue[] {
  const { issues, add, optionalStrings, reference } = validationTools(
    "game-system",
    data,
    context,
  );

  if (
    !text(data.name) ||
    !Array.isArray(data.editions) ||
    !data.editions.every(edition) ||
    !text(data.engineSchemaVersion) ||
    !object(data.configuration) ||
    !strings(data.enabledVariantIds) ||
    (Array.isArray(data.enabledVariantIds) &&
      new Set(data.enabledVariantIds).size !== data.enabledVariantIds.length)
  )
    add(
      "system",
      "Provide system metadata, configuration and distinct variant selections.",
    );
  if (
    !object(data.catalog) ||
    !Array.isArray(data.catalog.definitions) ||
    !Array.isArray(data.catalog.variants) ||
    !Array.isArray(data.catalog.packs)
  ) {
    add("system-catalog", "Provide definitions, variants and packs.");
    return issues;
  }
  const catalog = data.catalog;
  const records: NonNullable<CatalogValidationContext["records"]>[number][] =
    [];
  for (const [field, resource] of [
    ["definitions", "definitions"],
    ["variants", "rule-variants"],
    ["packs", "content-packs"],
  ]) {
    const seen = new Set();
    for (const value of catalog[field] as unknown[]) {
      const id = object(value)
        ? field === "definitions" && object(value.identity)
          ? value.identity.id
          : value.id
        : undefined;
      if (!text(id) || seen.has(id))
        add(
          "system-identity",
          "Catalog members require distinct identities.",
          `catalog.${field}`,
        );
      else {
        seen.add(id);
        records.push({
          resourceType: resource,
          sourceId: id,
          payload: value,
        });
      }
    }
  }
  for (const pack of catalog.packs as unknown[])
    if (object(pack) && Array.isArray(pack.extensionSchemas))
      for (const schema of pack.extensionSchemas)
        if (object(schema) && text(schema.id))
          records.push({
            resourceType: "extension-schemas",
            sourceId: schema.id,
            payload: schema,
          });
  const local = { ...context, records };
  for (const record of records) {
    const payload = record.payload as CatalogState;
    const childKind =
      record.resourceType === "definitions"
        ? payload.kind
        : record.resourceType === "rule-variants"
          ? "rule-variant"
          : record.resourceType === "content-packs"
            ? "content-pack"
            : "extension-schema";
    if (
      [
        "language",
        "table",
        "custom",
        "rule-variant",
        "content-pack",
        "extension-schema",
      ].includes(String(childKind))
    )
      issues.push(
        ...catalogValidators[childKind as CatalogKind](payload, local),
      );
  }
  const selected = new Set(
    Array.isArray(data.enabledVariantIds) ? data.enabledVariantIds : [],
  );
  for (const id of selected) {
    const variant = (catalog.variants as unknown[]).find(
      (v) => object(v) && v.id === id,
    );
    if (!object(variant)) {
      add(
        "variant-missing",
        "An enabled variant is absent from the captured catalog.",
      );
      continue;
    }
    if (
      Array.isArray(variant.requires) &&
      variant.requires.some((required) => !selected.has(required))
    )
      add("variant-required", "Enable the required variants together.");
    if (
      Array.isArray(variant.conflictsWith) &&
      variant.conflictsWith.some((conflict) => selected.has(conflict))
    )
      add("variant-conflict", "Selected variants conflict.");
  }

  return issues;
}

const catalogValidators = {
  language: validateLanguageDefinition,
  table: validateTableDefinition,
  custom: validateCustomDefinition,
  "extension-schema": validateExtensionSchema,
  "rule-variant": validateRuleVariant,
  "content-pack": validateContentPack,
  "game-system": validateGameSystem,
};

export class LanguageDefinition extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateLanguageDefinition(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("language", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): LanguageDefinition {
    return new LanguageDefinition(
      this.decode(value, "language"),
      context,
      options,
    );
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): LanguageDefinition {
    return new LanguageDefinition(this.payload(value), context, options);
  }
}

export class TableDefinition extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateTableDefinition(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("table", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): TableDefinition {
    return new TableDefinition(this.decode(value, "table"), context, options);
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): TableDefinition {
    return new TableDefinition(this.payload(value), context, options);
  }
}

export class CustomDefinition extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateCustomDefinition(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("custom", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): CustomDefinition {
    return new CustomDefinition(this.decode(value, "custom"), context, options);
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): CustomDefinition {
    return new CustomDefinition(this.payload(value), context, options);
  }
}

export class ExtensionSchema extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateExtensionSchema(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("extension-schema", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): ExtensionSchema {
    return new ExtensionSchema(
      this.decode(value, "extension-schema"),
      context,
      options,
    );
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): ExtensionSchema {
    return new ExtensionSchema(this.payload(value), context, options);
  }
}

export class RuleVariant extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateRuleVariant(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("rule-variant", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): RuleVariant {
    return new RuleVariant(
      this.decode(value, "rule-variant"),
      context,
      options,
    );
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): RuleVariant {
    return new RuleVariant(this.payload(value), context, options);
  }
}

export class ContentPack extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateContentPack(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("content-pack", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): ContentPack {
    return new ContentPack(
      this.decode(value, "content-pack"),
      context,
      options,
    );
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): ContentPack {
    return new ContentPack(this.payload(value), context, options);
  }
}

export class GameSystem extends CatalogEntity {
  protected validateState(
    data: DeepReadonly<CatalogState>,
    context: CatalogValidationContext,
  ): readonly ValidationIssue[] {
    return validateGameSystem(data, context);
  }

  private constructor(
    data: CatalogState,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ) {
    super("game-system", data, context, options);
  }
  static deserialize(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): GameSystem {
    return new GameSystem(this.decode(value, "game-system"), context, options);
  }
  static deserializePayload(
    value: unknown,
    context: CatalogValidationContext = {},
    options?: EntityOptions,
  ): GameSystem {
    return new GameSystem(this.payload(value), context, options);
  }
}
