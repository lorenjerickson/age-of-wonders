import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@aow/ui";
import { InternalLink } from "./navigation";
import {
  worldNavigationForPath,
  type WorldNavigationGroup,
} from "./gmNavigationModel";
import { quickStartStorageKey, quickStartSuffix } from "./quickStartModel";
import {
  campaignReturnContext,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";

export function WorldSecondaryNavigation({
  worldId,
  worldName,
  revisionLabel,
  gmScope,
}: {
  worldId: string;
  worldName: string;
  revisionLabel: string;
  gmScope: string;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const guideSuffix = worldWorkspaceSuffix(location.searchStr);
  const campaignReturn = campaignReturnContext(location.searchStr);
  const groups = worldNavigationForPath(worldId, pathname);
  const activeKey = groups.find(({ active }) => active)?.key;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(activeKey ? [activeKey] : []),
  );
  const [loaded, setLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const storageKey = `${quickStartStorageKey(gmScope)}.world-navigation.${encodeURIComponent(worldId)}`;

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      if (Array.isArray(saved)) {
        const valid = new Set([
          "atlas",
          "bestiary",
          "items",
          "characters",
          "rules",
        ]);
        setExpanded(
          new Set(
            saved.filter(
              (value): value is string =>
                typeof value === "string" && valid.has(value),
            ),
          ),
        );
      }
    } catch {
      // Malformed local preferences fall back to the active section.
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!activeKey) return;
    setExpanded((current) => new Set([...current, activeKey]));
  }, [activeKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded].sort()));
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }, [expanded, loaded, storageKey]);

  return (
    <aside className="border-b border-base-300 bg-base-100/70 p-4 lg:min-h-full lg:border-r lg:border-b-0 lg:p-5">
      <div className="mb-5 min-w-0 px-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          World
        </p>
        <p className="mt-2 truncate text-lg font-semibold" title={worldName}>
          {worldName}
        </p>
        <p className="mt-1 text-xs text-base-content/60">{revisionLabel}</p>
      </div>
      <nav aria-label={`${worldName} workspace`} className="mb-4 px-1">
        <ul className="menu gap-1 p-0">
          <li>
            <InternalLink
              href={`/worlds/${encodeURIComponent(worldId)}${guideSuffix}`}
            >
              Overview
            </InternalLink>
          </li>
          <li>
            <InternalLink
              href={`/worlds/${encodeURIComponent(worldId)}/versions${guideSuffix}`}
            >
              Versions
            </InternalLink>
          </li>
        </ul>
      </nav>
      {campaignReturn && (
        <InternalLink
          className="btn btn-outline mb-4 min-h-11 w-full"
          href={`${campaignReturn.href}${quickStartSuffix(location.searchStr)}`}
        >
          Back to {campaignReturn.label}
        </InternalLink>
      )}
      <Button
        type="button"
        tone="outline"
        className="mb-3 min-h-11 w-full justify-between lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="world-secondary-navigation"
        onClick={() => setMobileOpen((current) => !current)}
      >
        World navigation
        <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </Button>
      <nav
        id="world-secondary-navigation"
        aria-label={`${worldName} navigation`}
        className={mobileOpen ? "block" : "hidden lg:block"}
      >
        <ul className="space-y-1">
          {groups.map((group) => (
            <WorldNavigationDisclosure
              key={group.key}
              group={group}
              guideSuffix={guideSuffix}
              pathname={pathname}
              expanded={expanded.has(group.key)}
              onToggle={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function WorldNavigationDisclosure({
  group,
  expanded,
  onToggle,
  guideSuffix,
  pathname,
}: {
  group: WorldNavigationGroup;
  expanded: boolean;
  onToggle: () => void;
  guideSuffix: string;
  pathname: string;
}) {
  const contentId = `world-navigation-${group.key}`;
  return (
    <li className="min-w-52 rounded-box lg:min-w-0">
      <div
        className={`flex items-center rounded-lg ${group.active ? "bg-primary/10 text-primary" : "hover:bg-base-200"}`}
      >
        <InternalLink
          href={`${group.href}${guideSuffix}`}
          aria-current={pathname === group.href ? "page" : undefined}
          className="min-w-0 flex-1 px-3 py-2 text-sm font-semibold"
        >
          {group.label}
        </InternalLink>
        <Button
          type="button"
          tone="ghost"
          size="xs"
          className="mr-1"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label} navigation`}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </Button>
      </div>
      {expanded && (
        <ul id={contentId} className="mt-1 space-y-1 px-2 pb-2">
          {group.children.map((child) => (
            <li key={child.label}>
              {child.href ? (
                <InternalLink
                  href={`${child.href}${guideSuffix}`}
                  aria-current={
                    pathname === child.href ||
                    pathname.startsWith(`${child.href}/`)
                      ? "page"
                      : undefined
                  }
                  className="block rounded-md px-3 py-1.5 text-sm text-base-content/65 hover:bg-base-200 hover:text-base-content"
                >
                  {child.label}
                </InternalLink>
              ) : (
                <div className="flex items-start justify-between gap-2 px-3 py-1.5 text-sm text-base-content/55">
                  <span>{child.label}</span>
                  {child.note && (
                    <span className="text-[0.65rem] tracking-wide text-base-content/60 uppercase">
                      {child.note}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
