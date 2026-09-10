import {
  locationAncestry,
  locationHref,
  locationSectionHref,
  LOCATION_SECTIONS,
  type LocationSection,
} from "./locationWorkspaceModel";
import type { WorldDraftRecord } from "./api";
import {
  PRIMARY_NAVIGATION,
  worldNavigationForPath,
} from "./gmNavigationModel";
import { campaignDefinitionNavigationForPath } from "./campaignAuthoringModel";
import { campaignInstanceNavigationForPath } from "./campaignInstanceModel";

export interface NavigationLink {
  label: string;
  href: string;
}
export interface SidebarFrame extends NavigationLink {
  kind: string;
  links: NavigationLink[];
  groups?: readonly {
    label: string;
    href?: string;
    children: readonly { label: string; href?: string; note?: string }[];
    active: boolean;
  }[];
}
export interface NavigationData {
  worldName?: string;
  campaignName?: string;
  instanceName?: string;
  records?: readonly {
    sourceId: string;
    resourceType: string;
    payload: unknown;
  }[];
}
const labels: Record<string, string> = {
  atlas: "Atlas",
  bestiary: "Bestiary",
  "item-compendium": "Item Compendium",
  characters: "Characters",
  models: "Models & taxonomies",
  model: "Model",
  skills: "Skills",
  professions: "Professions",
  backgrounds: "Backgrounds",
  rules: "Rules",
  versions: "Versions",
  draft: "Working draft",
  review: "Review & publish",
  migrate: "Migration",
  plots: "Plots",
  placements: "Placements",
  preparation: "Preparation defaults",
  roster: "Roster",
  agents: "Agents",
  sessions: "Sessions",
  run: "Run",
  map: "Map",
  "quick-start": "Quick Start",
  "session-canvas-lab": "Session canvas",
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function navigationRecordName(
  data: NavigationData,
  id: string,
  fallback: string,
) {
  const record = data.records?.find((entry) => entry.sourceId === id);
  const payload = object(record?.payload);
  const name = object(payload.identity).name ?? payload.name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

/** The URL is the stack's durable state: parent links pop one or more frames,
 * and deep links/refresh/history reconstruct the same ancestry. IDs are URLs only. */
export function contextualNavigationStack(
  pathname: string,
  data: NavigationData = {},
): SidebarFrame[] {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const path = (count: number) =>
    "/" + parts.slice(0, count).map(encodeURIComponent).join("/");
  const stack: SidebarFrame[] = [
    {
      label: "GM Workspace",
      kind: "Workspace",
      href: "/",
      links: [...PRIMARY_NAVIGATION],
    },
  ];
  if (!parts.length) return stack;
  const root = parts[0];
  const label =
    PRIMARY_NAVIGATION.find((item) => item.key === root)?.label ??
    labels[root] ??
    "Workspace";
  const push = (
    label: string,
    kind: string,
    href: string,
    links: NavigationLink[] = [{ label: "Overview", href }],
  ) => stack.push({ label, kind, href, links });
  push(label, "Library", path(1), [{ label, href: path(1) }]);
  if (root === "worlds") {
    stack[1].links.push({ label: "Create World", href: "/worlds/new" });
    if (!parts[1]) return stack;
    if (parts[1] === "new") {
      push("Create World", "World", path(2));
      return stack;
    }
    push(data.worldName?.trim() || "World", "World", path(2), [
      { label: "Overview", href: path(2) },
      { label: "Versions", href: `${path(2)}/versions` },
    ]);
    stack.at(-1)!.groups = worldNavigationForPath(parts[1], pathname);
    // Atlas is a World navigation section, while a Location owns the next sidebar.
    if (parts[2] === "atlas" && parts[3] === "locations" && parts[4]) {
      const ancestry = locationAncestry(
        (data.records ?? []) as WorldDraftRecord[],
        parts[4],
      );
      if (!ancestry.length || parts[4] === "new") {
        push(
          parts[4] === "new" ? "Create Location" : "Location",
          "Location",
          path(5),
        );
      } else {
        for (const record of ancestry) {
          push(
            navigationRecordName(data, record.sourceId, "Location"),
            "Location",
            locationHref(parts[1], record.sourceId),
            LOCATION_SECTIONS.map((label) => ({
              label,
              href: locationSectionHref(
                parts[1],
                record.sourceId,
                label.toLowerCase() as LocationSection,
              ),
            })),
          );
        }
      }
      return stack;
    }
    // Library tabs stay in their owning World; individual records drill down.
    if (parts[2] === "characters" && parts[3] === "model" && parts[5]) {
      push(labels[parts[4]] ?? "Model", "Model", path(6));
      return stack;
    }
    if (
      parts[4] &&
      ["bestiary", "item-compendium", "characters"].includes(parts[2])
    ) {
      const fallback =
        parts[2] === "bestiary"
          ? "Creature"
          : parts[2] === "item-compendium"
            ? "Item"
            : "Definition";
      push(
        parts[4] === "new"
          ? `Create ${fallback}`
          : navigationRecordName(data, parts[4], fallback),
        fallback,
        path(5),
      );
    }
    return stack;
  }
  if (root === "campaigns") {
    stack[1].links.push(
      {
        label: "Create Campaign Definition",
        href: "/campaigns/definitions/new",
      },
      { label: "Create Campaign Instance", href: "/campaigns/instances/new" },
    );
    if (!parts[2]) return stack;
    const instance = parts[1] === "instances";
    const kind = instance ? "Campaign Instance" : "Campaign Definition";
    if (parts[2] === "new") {
      push(`Create ${kind}`, kind, path(3));
      return stack;
    }
    push(
      (instance ? data.instanceName : data.campaignName)?.trim() || kind,
      kind,
      path(3),
    );
    stack.at(-1)!.groups = instance
      ? campaignInstanceNavigationForPath(parts[2], pathname)
      : campaignDefinitionNavigationForPath(parts[2], pathname);
    if (parts[4] && ["plots", "sessions", "run"].includes(parts[3])) {
      const kind = parts[3] === "plots" ? "Plot" : "Session";
      push(navigationRecordName(data, parts[4], kind), kind, path(5));
    }
    return stack;
  }
  for (let index = 1; index < parts.length; index++)
    push(labels[parts[index]] ?? "Details", "Details", path(index + 1));
  return stack;
}

export function contextualBreadcrumbs(
  _pathname: string,
  stack: SidebarFrame[],
): NavigationLink[] {
  const crumbs: NavigationLink[] = stack.map(({ label, href }) => ({
    label,
    href,
  }));
  return crumbs;
}
