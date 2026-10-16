export const PRIMARY_NAVIGATION = [
  { key: "home", label: "Home", href: "/" },
  { key: "worlds", label: "Worlds", href: "/worlds" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "players", label: "Players", href: "/players" },
  { key: "settings", label: "Settings", href: "/settings" },
] as const;

export type PrimaryNavigationItem = (typeof PRIMARY_NAVIGATION)[number] & {
  readonly active: boolean;
};

export interface WorldNavigationItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}

export function primaryNavigationForPath(
  pathname: string,
  access: { gm: boolean; systemAdministrator: boolean } = {
    gm: true,
    systemAdministrator: true,
  },
): readonly PrimaryNavigationItem[] {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return PRIMARY_NAVIGATION.filter((item) => {
    if (item.key === "settings") return access.systemAdministrator;
    return access.gm;
  }).map((item) => ({
    ...item,
    active:
      item.key === "home"
        ? firstSegment === undefined
        : item.key === firstSegment,
  }));
}

/** World destinations are peers; record facets belong in content tabs. */
export function worldNavigationForPath(
  worldId: string,
  pathname: string,
): readonly WorldNavigationItem[] {
  const base = `/worlds/${encodeURIComponent(worldId)}`;
  const current = pathname.replace(/\/$/, "");
  const suffix = current.slice(base.length);
  const codexChild = suffix.startsWith("/item-compendium")
    ? "items"
    : ["professions", "skills", "backgrounds"].find(
        (kind) =>
          suffix === `/characters/${kind}` ||
          suffix.startsWith(`/characters/${kind}/`),
      );
  const active =
    codexChild ??
    (suffix.startsWith("/atlas")
      ? "atlas"
      : suffix.startsWith("/bestiary")
        ? "bestiary"
        : suffix === "/characters"
          ? "characters"
          : suffix.startsWith("/rules") || suffix.startsWith("/characters")
            ? "rules"
            : "overview");
  return [
    { key: "atlas", label: "Atlas", path: "?view=atlas" },
    { key: "bestiary", label: "Bestiary", path: "?view=bestiary" },
    { key: "characters", label: "Characters", path: "?view=characters" },
    { key: "codex", label: "Codex", path: "?view=codex" },
    {
      key: "backgrounds",
      label: "Backgrounds",
      path: "/characters/backgrounds",
    },
    {
      key: "conditions",
      label: "Conditions",
      path: "?view=codex&kind=conditions",
    },
    { key: "effects", label: "Effects", path: "?view=codex&kind=effects" },
    {
      key: "professions",
      label: "Professions",
      path: "/characters/professions",
    },
    { key: "skills", label: "Skills", path: "/characters/skills" },
    { key: "items", label: "Items", path: "?view=items" },
    { key: "overview", label: "Overview", path: "?view=overview" },
    { key: "rules", label: "Rules", path: "/rules" },
  ].map(({ key, label, path }) => ({
    key,
    label,
    href: `${base}${path}`,
    active: key === active,
  }));
}

/** Counts describe the same record collections exposed by World navigation. */
export function worldNavigationCounts(
  records: readonly { resourceType: string; payload: unknown }[],
) {
  return {
    locations: records.filter((record) => record.resourceType === "locations")
      .length,
    codex: records.filter((record) => {
      if (["world-conditions", "world-effects"].includes(record.resourceType))
        return true;
      const payload =
        record.payload &&
        typeof record.payload === "object" &&
        !Array.isArray(record.payload)
          ? (record.payload as Record<string, unknown>)
          : {};
      return (
        record.resourceType === "definitions" &&
        ["profession", "skill", "background"].includes(String(payload.kind))
      );
    }).length,
  };
}
