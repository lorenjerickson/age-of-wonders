import { NavigationLiveData } from "./navigationLiveData";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { Disclosure } from "@aow/ui";
import { useLocation, useMatches } from "@tanstack/react-router";
import { InternalLink } from "./navigation";
import {
  contextualBreadcrumbs,
  contextualNavigationStack,
  contextualSidebarFrame,
  type NavigationData,
} from "./contextualNavigationModel";
import {
  campaignReturnContext,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function useNavigation(override?: NavigationData) {
  const location = useLocation();
  const matches = useMatches();
  const live = useContext(NavigationLiveData);
  const data: NavigationData = {};
  let gmScope = "gm";
  for (const match of matches) {
    const user = object(object(object(match.context).session).user);
    if (typeof user.displayName === "string") gmScope = user.displayName;
    const result = object(match.loaderData);
    const definition = object(result.definition);
    const instance = object(result.instance);
    if (typeof definition.name === "string") {
      if (match.routeId.includes("worlds")) data.worldName = definition.name;
      else data.campaignName = definition.name;
    }
    if (typeof instance.name === "string") data.instanceName = instance.name;
    const records = object(result.draft).records;
    if (Array.isArray(records)) data.records = records;
    const locations = object(
      object(result.draft).capturedWorldContent,
    ).locations;
    if (Array.isArray(locations)) data.locations = locations;
  }
  if (
    live?.world &&
    location.pathname.startsWith(
      `/worlds/${encodeURIComponent(live.world.worldId)}/`,
    )
  )
    data.records = live.world.records;
  if (
    live?.campaign &&
    location.pathname.startsWith(
      `/campaigns/definitions/${encodeURIComponent(live.campaign.campaignId)}/`,
    )
  ) {
    data.records = live.campaign.records;
    data.locations = live.campaign.locations;
  }
  return {
    stack: contextualNavigationStack(location.pathname, {
      ...data,
      ...override,
    }),
    location,
    gmScope,
    suffix: worldWorkspaceSuffix(location.searchStr),
  };
}

export function CurrentDestination() {
  const { stack, location } = useNavigation();
  const crumbs = contextualBreadcrumbs(location.pathname, stack);
  const world = stack.find(
    (frame) => frame.kind === "World" && frame.links.length > 1,
  );
  const worldDestination =
    stack.at(-1) === world
      ? world?.links.find((link) => link.active)?.label
      : undefined;
  return (
    <span className="min-w-0 truncate font-semibold">
      {location.pathname === "/"
        ? "Home"
        : location.pathname === "/players"
          ? "Participants"
          : (worldDestination ?? crumbs.at(-1)?.label ?? "Workspace")}
    </span>
  );
}

export function PrimaryNavigation({
  gmAccess,
  systemAdministrator,
  onNavigate,
}: {
  gmAccess: boolean;
  systemAdministrator: boolean;
  onNavigate?: () => void;
}) {
  const { location } = useNavigation();
  const setup =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/players");
  const items = [
    {
      label: "Home",
      href: "/",
      visible: gmAccess,
      active: location.pathname === "/",
    },
    {
      label: "Setup",
      href: systemAdministrator ? "/settings" : "/players",
      visible: gmAccess || systemAdministrator,
      active: setup,
    },
    {
      label: "Worlds",
      href: "/worlds",
      visible: gmAccess,
      active: location.pathname.startsWith("/worlds"),
    },
    {
      label: "Campaigns",
      href: "/campaigns",
      visible: gmAccess,
      active: location.pathname.startsWith("/campaigns"),
    },
  ];
  return (
    <nav aria-label="Primary navigation" className="shell-primary-navigation">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <InternalLink
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={item.active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg px-4 text-sm ${item.active ? "bg-primary/15 font-semibold text-primary" : "text-base-content/70 hover:bg-base-300"}`}
          >
            {item.label}
          </InternalLink>
        ))}
    </nav>
  );
}

export function ContextualSidebar({
  systemAdministrator,
  gmAccess,
  onNavigate,
}: {
  systemAdministrator: boolean;
  gmAccess: boolean;
  onNavigate(): void;
}) {
  const { stack, location, suffix, gmScope } = useNavigation();
  const setup =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/players");
  const current = setup
    ? {
        label: "Setup",
        kind: "",
        href: "/settings",
        links: [
          { label: "Participants", href: "/players" },
          { label: "Settings", href: "/settings" },
        ],
        groups: undefined,
      }
    : contextualSidebarFrame(stack);
  const currentIndex = stack.indexOf(current);
  const previous = setup
    ? undefined
    : currentIndex > 1
      ? stack[currentIndex - 1]
      : undefined;
  const campaignReturn = location.pathname.startsWith("/worlds/")
    ? campaignReturnContext(location.searchStr)
    : undefined;
  return (
    <div
      className="min-h-0 flex-1"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate();
      }}
    >
      {previous && (
        <InternalLink
          href={`${previous.href}${suffix}`}
          className="mb-5 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-base-content/70 hover:bg-base-300/50"
        >
          <span aria-hidden="true">←</span> Back to {previous.label}
        </InternalLink>
      )}
      <div className="px-3 pt-3 pb-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          {current.kind}
        </p>
        <p className="mt-2 break-words text-lg font-semibold">
          {current.label}
        </p>
      </div>
      <nav aria-label={`${current.label} navigation`}>
        <ul className="menu w-full gap-1 p-0 [&_a]:min-h-11">
          {current.links
            .filter((link) =>
              link.href === "/settings" ? systemAdministrator : gmAccess,
            )
            .map((link) => (
              <li key={link.href}>
                <InternalLink
                  href={`${link.href}${suffix}`}
                  className={
                    (link.active ??
                    (location.pathname.replace(/\/$/, "") || "/") === link.href)
                      ? "menu-active font-semibold"
                      : undefined
                  }
                  aria-current={
                    (link.active ??
                    (location.pathname.replace(/\/$/, "") || "/") === link.href)
                      ? "page"
                      : undefined
                  }
                >
                  {link.label}
                </InternalLink>
              </li>
            ))}
        </ul>
        {current.groups?.map((group) => (
          <SidebarDisclosure
            key={`${current.href}-${group.label}`}
            storageKey={`aow.sidebar.${encodeURIComponent(gmScope)}.${current.href}.${group.label}`}
            active={group.active}
            summary={
              group.href ? (
                <InternalLink href={`${group.href}${suffix}`}>
                  {group.label}
                </InternalLink>
              ) : (
                group.label
              )
            }
          >
            <ul className="menu w-full p-1">
              {group.children.map((child) => (
                <li key={child.label}>
                  {child.href ? (
                    <InternalLink
                      href={`${child.href}${suffix}`}
                      aria-current={
                        location.pathname === child.href ? "page" : undefined
                      }
                    >
                      {child.label}
                    </InternalLink>
                  ) : (
                    <span>
                      {child.label} · {child.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </SidebarDisclosure>
        ))}
      </nav>
      {campaignReturn && (
        <InternalLink
          className="link mt-6 block px-3 text-sm"
          href={`${campaignReturn.href}${suffix}`}
        >
          Return to {campaignReturn.label}
        </InternalLink>
      )}
    </div>
  );
}

function SidebarDisclosure({
  storageKey,
  active,
  summary,
  children,
}: {
  storageKey: string;
  active: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    try {
      setExpanded(active || localStorage.getItem(storageKey) === "true");
    } catch {
      setExpanded(active);
    }
  }, [storageKey, active]);
  return (
    <Disclosure
      className="mt-3 border-0 bg-transparent"
      summary={summary}
      open={expanded}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === expanded) return;
        setExpanded(next);
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {
          /* Optional navigation preferences. */
        }
      }}
    >
      {children}
    </Disclosure>
  );
}

export function ContextualBreadcrumbs({
  data,
}: { data?: NavigationData } = {}) {
  const { stack, location, suffix } = useNavigation(data);
  const crumbs = contextualBreadcrumbs(location.pathname, stack);
  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-5 pb-2 lg:px-10">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-base-content/65">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-base-content/35">
                /
              </span>
            )}
            {index === crumbs.length - 1 ? (
              <span
                aria-current="page"
                className="break-words font-medium text-base-content"
              >
                {crumb.label === "Players" ? "Participants" : crumb.label}
              </span>
            ) : (
              <InternalLink
                className="break-words hover:underline"
                href={`${crumb.href}${suffix}`}
              >
                {crumb.label === "Players" ? "Participants" : crumb.label}
              </InternalLink>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
