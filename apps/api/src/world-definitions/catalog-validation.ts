import { catalogOwner, CatalogCapture } from "@aow/domain";
import { isObject } from "../domain/domain-resource";
import type { WorldDraftRecordDto } from "./dto/world-definition-authoring.dto";

/** Draft authoring can retain unchanged malformed imports; changed fields must be structurally valid. */
export function catalogRecordIssue(
  resource: string,
  sourceId: string,
  payload: unknown,
  previous?: unknown,
): string | undefined {
  let entity: ReturnType<typeof catalogOwner>;
  try {
    entity = catalogOwner(resource, payload, { mode: "draft" });
  } catch {
    return "A catalog record requires a bounded JSON object.";
  }
  if (!entity) return undefined;
  try {
    const data = entity.serializePayload();
    const identity =
      resource === "definitions" && isObject(data.identity)
        ? data.identity.id
        : data.id;
    if (identity !== sourceId)
      return "The catalog identity does not match its snapshot record.";
    return entity.state.metadata.validity.issues.find(
      (issue) =>
        issue.blocking !== false &&
        !issue.unresolved &&
        (previous === undefined ||
          !issue.path ||
          JSON.stringify(at(previous, issue.path)) !==
            JSON.stringify(at(payload, issue.path))),
    )?.message;
  } finally {
    entity.dispose();
  }
}
function at(value: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>(
      (current, part) =>
        isObject(current)
          ? current[part]
          : Array.isArray(current)
            ? current[Number(part)]
            : undefined,
      value,
    );
}
/** Publication sees only explicitly declared catalog/schema members of this exact World capture. */
export function catalogPublicationIssues(
  content: unknown,
  records: readonly WorldDraftRecordDto[],
) {
  const c = isObject(content) ? content : {};
  const definitions = Array.isArray(c.definitionIds) ? c.definitionIds : [];
  const schemas = Array.isArray(c.schemaDefinitionIds)
    ? c.schemaDefinitionIds
    : [];
  const selected = records.filter(
    (record) =>
      (record.resourceType === "definitions" &&
        definitions.includes(record.sourceId)) ||
      (record.resourceType === "extension-schemas" &&
        schemas.includes(record.sourceId)),
  );
  let capture: CatalogCapture | undefined;
  try {
    capture = new CatalogCapture(selected, "publication");
    return capture
      .issues()
      .filter((issue) => issue.blocking !== false)
      .map((issue) => ({
        code: issue.code,
        subject: "World catalog",
        detail: issue.message,
      }));
  } catch {
    return [
      {
        code: "catalog-capture-invalid",
        subject: "World catalog",
        detail:
          "The captured catalog requires distinct identities and valid JSON records.",
      },
    ];
  } finally {
    capture?.dispose();
  }
}
