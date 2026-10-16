/** Translate only known authoring destinations; obsolete view options are discarded. */
export function astraWorldCompatibilityHref(
  worldId: string,
  pathname: string,
  search = "",
): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const suffix = parts.slice(2);
  if (!suffix.length) {
    const query = new URLSearchParams(search);
    if (query.get("view") === "codex" && !query.get("kind")) {
      query.delete("view");
      return `/worlds/${encodeURIComponent(worldId)}/characters/backgrounds${query.size ? `?${query}` : ""}`;
    }
    if (
      ["rules", "system"].includes(query.get("view") ?? "") ||
      (query.get("view") === "codex" && query.get("kind") === "rules")
    ) {
      const entry = query.get("entry");
      query.delete("view");
      query.delete("kind");
      query.delete("entry");
      const path = entry
        ? entry === "new"
          ? "/new"
          : `/${encodeURIComponent(entry)}/edit`
        : "";
      return `/worlds/${encodeURIComponent(worldId)}/rules${path}${query.size ? `?${query}` : ""}`;
    }

    if (
      query.get("view") === "codex" &&
      ["creatures", "characters", "items"].includes(query.get("kind") ?? "")
    ) {
      query.set(
        "view",
        query.get("kind") === "creatures" ? "bestiary" : query.get("kind")!,
      );
      query.delete("kind");
      return `/worlds/${encodeURIComponent(worldId)}?${query}`;
    }
    return undefined;
  }
  // These are active authoring routes, including their dedicated child editors.
  // Only obsolete aliases may be translated to the query-based workspace.
  if (
    [
      "atlas",
      "bestiary",
      "item-compendium",
      "characters",
      "rules",
      "versions",
    ].includes(suffix[0])
  )
    return undefined;

  const base = `/worlds/${encodeURIComponent(worldId)}`;
  const query = new URLSearchParams();
  function entry(value: string | undefined) {
    if (!value) return;
    try {
      query.set("entry", decodeURIComponent(value));
    } catch {
      query.set("entry", value);
    }
  }
  if (suffix[0] === "atlas") {
    query.set("view", "atlas");
    if (suffix[1] === "locations") {
      entry(suffix[2]);
      if (
        suffix[3] === "edit" ||
        new URLSearchParams(search).get("edit") === "1"
      )
        query.set("edit", "1");
    }
  } else if (suffix[0] === "bestiary" || suffix[0] === "item-compendium") {
    query.set("view", "codex");
    query.set("kind", suffix[0] === "bestiary" ? "creatures" : "items");
    if (suffix[1] === (suffix[0] === "bestiary" ? "creatures" : "items"))
      entry(suffix[2]);
  } else if (suffix[0] === "characters" && suffix.length === 1) {
    query.set("view", "codex");
    query.set("kind", "characters");
  } else if (suffix[0] === "rules") {
    query.set("view", "codex");
    query.set("kind", "rules");
  } else {
    query.set("view", "overview");
  }
  return `${base}?${query}`;
}
