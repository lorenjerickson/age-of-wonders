import type { DomainResource } from "../domain/domain-resource";

export interface GraphTriple {
  subject: string;
  predicate: string;
  object: string;
}

type JsonObject = Record<string, unknown>;

const ID_SUFFIX = /Ids?$/;

function predicateFor(field: string): string {
  const stem = field.replace(ID_SUFFIX, "");
  return `aow:${stem.charAt(0).toLowerCase()}${stem.slice(1)}`;
}

function addReferenceTriples(
  triples: GraphTriple[],
  subject: string,
  value: unknown,
  parentKey?: string,
  isRoot = false,
): void {
  if (Array.isArray(value)) {
    if (parentKey?.endsWith("Ids")) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0) {
          triples.push({
            subject,
            predicate: predicateFor(parentKey),
            object: item,
          });
        }
      }
      return;
    }
    for (const item of value) addReferenceTriples(triples, subject, item);
    return;
  }

  if (typeof value !== "object" || value === null) return;
  const object = value as JsonObject;

  if (!isRoot && parentKey === "identity") {
    const nestedId = object.id;
    if (typeof nestedId === "string" && nestedId.length > 0) {
      triples.push({ subject, predicate: "aow:contains", object: nestedId });
    }
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      key.endsWith("Id") &&
      typeof child === "string" &&
      child.length > 0 &&
      !(parentKey === "identity" && key === "id")
    ) {
      triples.push({
        subject,
        predicate: predicateFor(key),
        object: child,
      });
      continue;
    }
    addReferenceTriples(triples, subject, child, key, false);
  }
}

export function tuplesForDomainResource(
  resource: DomainResource,
  id: string,
  data: JsonObject,
  kind?: string,
  name?: string,
): GraphTriple[] {
  const triples: GraphTriple[] = [
    { subject: id, predicate: "aow:resource", object: resource },
  ];

  if (kind) triples.push({ subject: id, predicate: "aow:kind", object: kind });
  if (name) triples.push({ subject: id, predicate: "aow:name", object: name });
  addReferenceTriples(triples, id, data, undefined, true);

  const seen = new Set<string>();
  return triples.filter((triple) => {
    const key = `${triple.subject}\0${triple.predicate}\0${triple.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
