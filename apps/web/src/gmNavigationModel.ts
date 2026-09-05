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

export interface WorldNavigationChild {
  readonly label: string;
  readonly href?: string;
  readonly note?: string;
}

export interface WorldNavigationGroup {
  readonly key: "atlas" | "bestiary" | "items" | "characters" | "rules";
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly children: readonly WorldNavigationChild[];
}

export function primaryNavigationForPath(
  pathname: string,
): readonly PrimaryNavigationItem[] {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return PRIMARY_NAVIGATION.map((item) => ({
    ...item,
    active:
      item.key === "home"
        ? firstSegment === undefined
        : item.key === firstSegment,
  }));
}

export function worldNavigationForPath(
  worldId: string,
  pathname: string,
): readonly WorldNavigationGroup[] {
  const encodedWorldId = encodeURIComponent(worldId);
  const base = `/worlds/${encodedWorldId}`;
  const nestedSection = pathname.split("/").filter(Boolean)[2];
  const activeKey =
    nestedSection === "atlas"
      ? "atlas"
      : nestedSection === "bestiary" || nestedSection === "creatures"
        ? "bestiary"
        : nestedSection === "item-compendium" || nestedSection === "items"
          ? "items"
          : nestedSection === "characters"
            ? "characters"
            : nestedSection === "rules"
              ? "rules"
              : undefined;

  const groups: ReadonlyArray<
    Omit<WorldNavigationGroup, "active" | "expanded">
  > = [
    {
      key: "atlas",
      label: "Atlas",
      href: `${base}/atlas`,
      children: [{ label: "Locations & maps", href: `${base}/atlas` }],
    },
    {
      key: "bestiary",
      label: "Bestiary",
      href: `${base}/bestiary`,
      children: [{ label: "Creatures", href: `${base}/bestiary` }],
    },
    {
      key: "items",
      label: "Item Compendium",
      href: `${base}/item-compendium`,
      children: [
        {
          label: "Items, objects & hazards",
          href: `${base}/item-compendium`,
        },
      ],
    },
    {
      key: "characters",
      label: "Characters",
      href: `${base}/characters`,
      children: [
        { label: "Skills", note: "Advanced models" },
        { label: "Professions", note: "Advanced models" },
        { label: "Backgrounds & heritages", note: "Advanced models" },
        { label: "Models & taxonomies", href: `${base}/characters` },
      ],
    },
    {
      key: "rules",
      label: "Rules",
      href: `${base}/rules`,
      children: [{ label: "Rules design", note: "Deferred" }],
    },
  ];

  return groups.map((group) => ({
    ...group,
    active: group.key === activeKey,
    expanded: group.key === activeKey,
  }));
}
