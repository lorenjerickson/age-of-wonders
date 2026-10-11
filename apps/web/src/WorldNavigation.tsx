import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@aow/ui";
import { InternalLink } from "./navigation";
import { worldNavigationForPath } from "./gmNavigationModel";
import { quickStartSuffix } from "./quickStartModel";
import {
  campaignReturnContext,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";

export function WorldSecondaryNavigation({
  worldId,
  worldName,
  revisionLabel,
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
  const [mobileOpen, setMobileOpen] = useState(false);

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
          {groups.map((item) => (
            <li key={item.key}>
              <InternalLink
                href={`${item.href}${guideSuffix}`}
                aria-current={item.active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${item.active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-base-200"}`}
              >
                {item.label}
              </InternalLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
