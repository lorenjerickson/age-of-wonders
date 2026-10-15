import {
  LanguageDefinition,
  TableDefinition,
  CustomDefinition,
  ExtensionSchema,
  RuleVariant,
  ContentPack,
  GameSystem,
  type CatalogEntity,
  type CatalogValidationContext,
} from "./catalog-entities";
import { EntityGraph, type EntityReference } from "./entity-graph";
import {
  copyEntityData,
  type EntityOptions,
  type ValidationIssue,
} from "./entity";

type CatalogCodec = {
  deserializePayload(
    payload: unknown,
    context: CatalogValidationContext,
    options?: EntityOptions,
  ): CatalogEntity;
};
export interface CatalogRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly payload: unknown;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Dispatch only selects a codec. Each concrete concept owns its validation and commands. */
export function catalogOwner(
  resourceType: string,
  payload: unknown,
  context: CatalogValidationContext = {},
  options?: EntityOptions,
): CatalogEntity | undefined {
  const definition = new Map<string, CatalogCodec>([
    ["language", LanguageDefinition],
    ["table", TableDefinition],
    ["custom", CustomDefinition],
  ]).get(String(object(payload).kind));
  const root = new Map<string, CatalogCodec>([
    ["extension-schemas", ExtensionSchema],
    ["rule-variants", RuleVariant],
    ["content-packs", ContentPack],
    ["systems", GameSystem],
  ]).get(resourceType);
  const Owner = resourceType === "definitions" ? definition : root;
  return Owner?.deserializePayload(payload, context, options);
}
/** An exact captured catalog, never a process-wide registry or a database lookup. */
export class CatalogCapture {
  readonly graph = new EntityGraph();
  readonly #records: readonly CatalogRecord[];
  constructor(
    records: readonly CatalogRecord[],
    mode: "draft" | "publication" | "runtime" = "publication",
  ) {
    this.#records = copyEntityData(records);
    try {
      const seen = new Set<string>();
      for (const record of this.#records) {
        const key = JSON.stringify([record.resourceType, record.sourceId]);
        if (seen.has(key))
          throw new TypeError("A captured catalog identity is duplicated.");
        seen.add(key);
        const entity = catalogOwner(
          record.resourceType,
          record.payload,
          { mode, records: this.#records },
          { scope: this.graph.scope },
        );
        if (!entity) continue;
        try {
          this.graph.add(
            { type: record.resourceType, id: record.sourceId },
            entity,
            {
              context: () => ({ records: this.records() }),
              references: (data) => this.references(record.resourceType, data),
            },
          );
        } catch (error) {
          entity.dispose();
          throw error;
        }
      }
      this.graph.validate({ mode });
    } catch (error) {
      this.graph.dispose();
      throw error;
    }
  }
  records(): readonly CatalogRecord[] {
    return this.#records.map((record) => ({
      ...record,
      payload:
        this.graph
          .resolve({ type: record.resourceType, id: record.sourceId })
          ?.serialize().data ?? copyEntityData(record.payload),
    }));
  }
  private references(
    resource: string,
    value: object,
  ): readonly EntityReference[] {
    const data = object(value),
      refs: EntityReference[] = [];
    if (resource === "definitions" && data.kind === "custom") {
      const components = object(data.components);
      const schemaId =
        typeof components.schemaId === "string"
          ? components.schemaId
          : this.records().find(
              (record) =>
                record.resourceType === "extension-schemas" &&
                object(record.payload).key === components.definitionKind,
            )?.sourceId;
      if (schemaId) refs.push({ type: "extension-schemas", id: schemaId });
    }
    if (resource === "rule-variants")
      for (const field of ["requires", "conflictsWith"])
        if (Array.isArray(data[field]))
          for (const id of data[field])
            if (typeof id === "string")
              refs.push({ type: "rule-variants", id });
    if (resource === "content-packs") {
      for (const [field, type] of [
        ["definitionIds", "definitions"],
        ["variantIds", "rule-variants"],
      ])
        if (Array.isArray(data[field]))
          for (const id of data[field]) {
            if (typeof id !== "string") continue;
            const target = this.#records.find(
              (record) =>
                record.resourceType === type && record.sourceId === id,
            );
            if (
              type === "rule-variants" ||
              !target ||
              ["language", "table", "custom"].includes(
                String(object(target.payload).kind),
              )
            )
              refs.push({ type, id });
          }
      if (Array.isArray(data.dependencies))
        for (const dependency of data.dependencies) {
          const d = object(dependency),
            target = this.records().find(
              (record) =>
                record.resourceType === "content-packs" &&
                object(record.payload).namespace === d.namespace,
            );
          if (target) refs.push({ type: "content-packs", id: target.sourceId });
        }
    }
    return refs;
  }
  issues(): readonly (ValidationIssue & {
    resourceType: string;
    sourceId: string;
  })[] {
    return this.#records.flatMap((record) => {
      const entity = this.graph.resolve({
        type: record.resourceType,
        id: record.sourceId,
      });
      if (!entity) return [];
      const payload = object(entity.state.data);
      const id =
        record.resourceType === "definitions"
          ? object(payload.identity).id
          : payload.id;
      const issues = [...entity.state.metadata.validity.issues];
      if (id !== record.sourceId)
        issues.push({
          code: "catalog-capture-identity",
          message: "The catalog identity does not match its capture.",
        });
      return issues.map((issue) => ({
        ...issue,
        resourceType: record.resourceType,
        sourceId: record.sourceId,
      }));
    });
  }
  dispose(): void {
    this.graph.dispose();
  }
}
