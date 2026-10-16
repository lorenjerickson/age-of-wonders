type ResourceIdentityMapping = Record<string, Record<string, string>>;
export function rewriteWorldDefinitionReferences(
  value: unknown,
  mapping: ResourceIdentityMapping,
  currentResource?: string,
  fieldName?: string,
): unknown {
  if (typeof value === "string") {
    if (fieldName === "propertyPath") {
      const skill = /^skills\.(.+)\.(value|modifier)$/.exec(value);
      if (skill && mapping.definitions?.[skill[1]!])
        return `skills.${mapping.definitions[skill[1]!]}.${skill[2]}`;
    }
    return mappedReference(value, mapping, currentResource, fieldName) ?? value;
  }
  if (Array.isArray(value))
    return value.map((entry) =>
      rewriteWorldDefinitionReferences(
        entry,
        mapping,
        currentResource,
        fieldName,
      ),
    );
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        fieldName === "skills" ? (mapping.definitions?.[key] ?? key) : key,
        rewriteWorldDefinitionReferences(entry, mapping, currentResource, key),
      ]),
    );
  return value;
}
function mappedReference(
  value: string,
  mapping: ResourceIdentityMapping,
  currentResource?: string,
  fieldName?: string,
): string | undefined {
  if (fieldName === "id" && currentResource)
    return mapping[currentResource]?.[value];
  const normalized = fieldName?.toLowerCase() ?? "";
  const preferred =
    normalized === "charactertemplateid"
      ? ["world-character-templates"]
      : normalized === "equipmentpool"
        ? ["definitions"]
        : normalized === "conditionid"
          ? ["world-conditions"]
          : normalized === "effectid"
            ? ["world-effects"]
            : normalized.includes("location")
              ? ["locations"]
              : normalized.includes("schema")
                ? ["extension-schemas", "definitions"]
                : normalized.includes("definition")
                  ? ["definitions"]
                  : normalized.includes("creature")
                    ? ["creatures"]
                    : normalized.includes("item")
                      ? ["items"]
                      : normalized.endsWith("id") || normalized.endsWith("ids")
                        ? Object.keys(mapping)
                        : [];
  const matches = preferred.flatMap((resource) =>
    mapping[resource]?.[value] ? [mapping[resource][value]] : [],
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
