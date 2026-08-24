import { BadRequestException } from "@nestjs/common";

export const DOMAIN_RESOURCES = [
  "definitions",
  "rule-variants",
  "content-packs",
  "extension-schemas",
  "systems",
  "games",
  "campaigns",
  "sessions",
  "characters",
  "creatures",
  "items",
  "objects",
  "scenes",
  "locations",
  "location-connections",
  "encounters",
  "pending-decisions",
  "game-events",
] as const;

export type DomainResource = (typeof DOMAIN_RESOURCES)[number];

interface ResourceMetadata {
  id: string;
  kind?: string;
  name?: string;
}

type JsonObject = Record<string, unknown>;

function objectAt(value: JsonObject, path: string): JsonObject {
  const result = path.split(".").reduce<unknown>((current, part) => {
    return isObject(current) ? current[part] : undefined;
  }, value);

  if (!isObject(result)) {
    throw new BadRequestException(`data.${path} must be an object`);
  }
  return result;
}

function stringAt(value: JsonObject, path: string): string {
  const result = path.split(".").reduce<unknown>((current, part) => {
    return isObject(current) ? current[part] : undefined;
  }, value);

  if (typeof result !== "string" || result.trim().length === 0) {
    throw new BadRequestException(`data.${path} must be a non-empty string`);
  }
  return result;
}

function optionalStringAt(value: JsonObject, path: string): string | undefined {
  try {
    return stringAt(value, path);
  } catch {
    return undefined;
  }
}

function stateMetadata(data: JsonObject): ResourceMetadata {
  objectAt(data, "identity");
  return {
    id: stringAt(data, "identity.id"),
    name: stringAt(data, "name"),
  };
}

const metadataReaders: Record<
  DomainResource,
  (data: JsonObject) => ResourceMetadata
> = {
  definitions: (data) => ({
    id: stringAt(data, "identity.id"),
    kind: stringAt(data, "kind"),
    name: stringAt(data, "identity.name"),
  }),
  "rule-variants": (data) => ({
    id: stringAt(data, "id"),
    kind: "rule-variant",
    name: stringAt(data, "name"),
  }),
  "content-packs": (data) => ({
    id: stringAt(data, "id"),
    kind: "content-pack",
    name: stringAt(data, "name"),
  }),
  "extension-schemas": (data) => ({
    id: stringAt(data, "id"),
    kind: "extension-schema",
    name: stringAt(data, "key"),
  }),
  systems: (data) => ({
    id: stringAt(data, "id"),
    kind: "game-system",
    name: stringAt(data, "name"),
  }),
  // GameState has no independent ID; its campaign ID is the stable snapshot ID.
  games: (data) => ({
    id: stringAt(data, "campaign.identity.id"),
    kind: "game-state",
    name: optionalStringAt(data, "campaign.name"),
  }),
  campaigns: stateMetadata,
  sessions: stateMetadata,
  characters: stateMetadata,
  creatures: stateMetadata,
  items: (data) => ({
    id: stringAt(data, "id"),
    kind: "item-instance",
    name:
      optionalStringAt(data, "nameOverride") ??
      optionalStringAt(data, "definitionId"),
  }),
  objects: stateMetadata,
  scenes: stateMetadata,
  locations: (data) => ({
    ...stateMetadata(data),
    kind: stringAt(data, "kind"),
  }),
  "location-connections": (data) => ({
    id: stringAt(data, "identity.id"),
    kind: stringAt(data, "kind"),
  }),
  encounters: stateMetadata,
  "pending-decisions": (data) => ({
    id: stringAt(data, "id"),
    kind: "pending-decision",
  }),
  "game-events": (data) => ({
    id: stringAt(data, "id"),
    kind: stringAt(data, "type"),
  }),
};

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertDomainResource(value: string): DomainResource {
  if (!(DOMAIN_RESOURCES as readonly string[]).includes(value)) {
    throw new BadRequestException(
      `Unknown domain resource '${value}'. Expected one of: ${DOMAIN_RESOURCES.join(", ")}`,
    );
  }
  return value as DomainResource;
}

export function readResourceMetadata(
  resource: DomainResource,
  data: JsonObject,
): ResourceMetadata {
  return metadataReaders[resource](data);
}
