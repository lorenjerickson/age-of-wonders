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
  return [
    { key: "overview", label: "Overview", path: "" },
    { key: "locations", label: "Locations", path: "/atlas" },
    { key: "bestiary", label: "Bestiary", path: "/bestiary" },
    { key: "items", label: "Items", path: "/item-compendium" },
    { key: "skills", label: "Skills", path: "/characters/skills" },
    {
      key: "professions",
      label: "Professions",
      path: "/characters/professions",
    },
    {
      key: "backgrounds",
      label: "Backgrounds",
      path: "/characters/backgrounds",
    },
    { key: "models", label: "Models & taxonomies", path: "/characters/models" },
    { key: "rules", label: "Codex", path: "/rules" },
    { key: "versions", label: "Versions", path: "/versions" },
  ].map(({ key, label, path }) => ({
    key,
    label,
    href: `${base}${path}`,
    active:
      current === `${base}${path}` ||
      (path !== "" && current.startsWith(`${base}${path}/`)) ||
      (key === "models" && current.startsWith(`${base}/characters/model/`)),
  }));
}
