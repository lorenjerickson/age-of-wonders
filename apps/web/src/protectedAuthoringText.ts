export function isOpaqueItemBinding(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /(?:^|[:/])(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i.test(
      value,
    )
  );
}

export function protectedComparisonText(
  value: unknown,
  recordIds: ReadonlySet<string>,
): boolean {
  if (typeof value !== "string") return false;
  const boundary = /[.[\]/:'"\s]/;
  const containsRecordId = [...recordIds].some((id) => {
    if (!id) return false;
    let at = value.indexOf(id);
    while (at !== -1) {
      const after = at + id.length;
      if (
        (at === 0 || boundary.test(value[at - 1])) &&
        (after === value.length || boundary.test(value[after]))
      )
        return true;
      at = value.indexOf(id, at + 1);
    }
    return false;
  });
  return (
    isOpaqueItemBinding(value) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      value,
    ) ||
    containsRecordId
  );
}
