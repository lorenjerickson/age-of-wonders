import {
  NavigationLiveData,
  type LiveNavigationWorld,
  type LiveNavigationCampaign,
} from "./navigationLiveData";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  StatusIndicator,
  Input,
  Field,
  Dialog,
} from "@aow/ui";
import {
  checkHealth,
  getCampaignInstanceContinuation,
  getGmActiveSession,
  getMyAuthenticationProviders,
  type CampaignInstanceContinuation,
  type CampaignInstanceList,
  type WorldDefinitionList,
} from "./api";
import { RouterButtonLink } from "./navigation";
import {
  ContextualSidebar,
  ContextualBreadcrumbs,
  CurrentDestination,
  PrimaryNavigation,
} from "./ContextualNavigation";
import { QuickStartGuide } from "./QuickStart";
import { quickStartActivity, quickStartKeyFromSearch } from "./quickStartModel";
import type { ReadSection } from "./server/readModels";
import { statusLabel } from "./campaignLibraryModel";
import "./AppShell.css";
import { ShellToolsTarget } from "./shellToolsContext";
import { useSidebarResize } from "./useSidebarResize";

function LegacyAppShell({
  children,
  gmAccess = true,
  systemAdministrator = false,
}: {
  children: ReactNode;
  gmAccess?: boolean;
  systemAdministrator?: boolean;
}) {
  const [navigationCampaign, setNavigationCampaign] =
    useState<LiveNavigationCampaign>();
  const [navigationWorld, setNavigationWorld] = useState<LiveNavigationWorld>();
  const location = useLocation();
  const pathname = location.pathname;
  const quickStartKey = quickStartKeyFromSearch(location.searchStr);
  const guide = quickStartKey ? quickStartActivity(quickStartKey) : undefined;
  const segments = pathname.split("/").filter(Boolean);
  const locationWorkspaceActive =
    segments[0] === "campaigns" && segments[2] === "locations";
  const [toolsVisible, setToolsVisible] = useState(
    !pathname.startsWith("/worlds") && pathname !== "/settings",
  );
  const sidebar = useSidebarResize(toolsVisible);
  const sidebarHidden = pathname === "/" || pathname === "/worlds";
  const [toolsTarget, setToolsTarget] = useState<HTMLElement | null>(null);
  const [desktopTools, setDesktopTools] = useState<HTMLElement | null>(null);
  const [mobileTools, setMobileTools] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState<"navigation" | "context" | null>(null);
  const [activeSession, setActiveSession] =
    useState<Awaited<ReturnType<typeof getGmActiveSession>>["session"]>();
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  const drawerPanel = useRef<HTMLDialogElement>(null);
  const drawerHeading = useRef<HTMLHeadingElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement | null>(null);
  const runWorkspace = /^\/campaigns\/instances\/[^/]+\/run\/[^/]+/.test(
    pathname,
  );

  useEffect(() => {
    if (!gmAccess) return;
    let cancelled = false;
    void getGmActiveSession().then(
      (result) => {
        if (!cancelled) setActiveSession(result.session);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [gmAccess, pathname]);

  useEffect(() => {
    let cancelled = false;
    void getMyAuthenticationProviders().then(
      (result) => {
        if (!cancelled) setAuth0(result.auth0);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setDrawer(null);
  }, [pathname, location.searchStr]);

  useEffect(() => {
    // The portal container is stable: moving it preserves mounted editor state.
    const target = document.createElement("div");
    setToolsTarget(target);
    return () => target.remove();
  }, []);
  useEffect(() => {
    const destination = drawer === "context" ? mobileTools : desktopTools;
    if (toolsTarget && destination) destination.appendChild(toolsTarget);
  }, [drawer, desktopTools, mobileTools, toolsTarget]);

  useEffect(() => {
    const panel = drawerPanel.current;
    if (drawer && panel && !panel.open) {
      panel.showModal();
      drawerHeading.current?.focus();
    } else if (!drawer && panel?.open) {
      panel.close();
      drawerTrigger.current?.focus();
    }
  }, [drawer]);

  function openDrawer(
    kind: "navigation" | "context",
    trigger: HTMLButtonElement,
  ) {
    drawerTrigger.current = trigger;
    setDrawer(kind);
  }

  const account = auth0?.configured ? (
    auth0.linked ? (
      <p className="text-sm text-success">Auth0 connected</p>
    ) : (
      <a
        className="btn btn-outline min-h-11"
        href={`/api/auth/auth0/link?returnTo=${encodeURIComponent(pathname)}`}
      >
        Connect Auth0
      </a>
    )
  ) : null;
  const sessionContext =
    activeSession && !runWorkspace ? (
      <section className="rounded-lg border border-base-300 bg-base-200 p-4">
        <h3 className="font-semibold">{activeSession.sessionName}</h3>
        <p className="my-3 text-sm text-base-content/70">
          {activeSession.campaignInstanceName} · {activeSession.status}
        </p>
        <RouterButtonLink
          href={`/campaigns/instances/${encodeURIComponent(activeSession.campaignInstanceId)}/run/${encodeURIComponent(activeSession.sessionId)}`}
          tone="primary"
        >
          {activeSession.label} Session
        </RouterButtonLink>
      </section>
    ) : null;

  return (
    <NavigationLiveData.Provider
      value={{
        world: navigationWorld,
        setWorld: setNavigationWorld,
        campaign: navigationCampaign,
        setCampaign: setNavigationCampaign,
      }}
    >
      <ShellToolsTarget.Provider value={toolsTarget}>
        {runWorkspace ? (
          children
        ) : (
          <div className="application-shell bg-base-100 text-base-content">
            <header className="shell-desktop-header border-b border-base-300 bg-base-200">
              <RouterButtonLink
                href="/"
                tone="ghost"
                className="text-lg font-semibold"
              >
                Age of Wonders
              </RouterButtonLink>
              <PrimaryNavigation
                gmAccess={gmAccess}
                systemAdministrator={systemAdministrator}
              />
              <Button
                tone="ghost"
                className="ml-auto min-h-11"
                aria-expanded={toolsVisible}
                onClick={() => setToolsVisible(!toolsVisible)}
              >
                Tools
              </Button>
            </header>
            <header className="shell-mobile-header border-b border-base-300 bg-base-200">
              <Button
                tone="outline"
                className="min-h-11"
                aria-haspopup="dialog"
                aria-controls="shell-drawer"
                onClick={(event) =>
                  openDrawer("navigation", event.currentTarget)
                }
              >
                Menu
              </Button>
              <CurrentDestination />
              <Button
                tone="outline"
                className="min-h-11"
                aria-haspopup="dialog"
                aria-controls="shell-drawer"
                onClick={(event) => openDrawer("context", event.currentTarget)}
              >
                More
              </Button>
            </header>
            <div
              className={`shell-workspace${sidebar.resizing ? " shell-workspace-resizing" : ""}`}
            >
              <aside
                id="shell-secondary-navigation"
                hidden={sidebarHidden}
                style={{ flexBasis: sidebar.width }}
                className="shell-sidebar border-r border-base-300 bg-base-200"
              >
                <ContextualSidebar
                  gmAccess={gmAccess}
                  systemAdministrator={systemAdministrator}
                  onNavigate={() => setDrawer(null)}
                />
                <div className="mt-6 border-t border-base-300 pt-4">
                  {account}
                </div>
              </aside>
              <div
                {...sidebar.separatorProps}
                hidden={sidebarHidden}
                className="shell-sidebar-resizer"
              />
              <div
                className={`shell-content app-browse-frame ${locationWorkspaceActive ? "overflow-hidden" : "overflow-y-auto"}`}
              >
                {pathname !== "/" &&
                  !(
                    segments[0] === "worlds" &&
                    segments[1] &&
                    segments[1] !== "new"
                  ) &&
                  !(
                    segments[0] === "campaigns" &&
                    segments[2] &&
                    segments[2] !== "new"
                  ) && <ContextualBreadcrumbs />}
                {children}
              </div>
              <section
                hidden={!toolsVisible}
                className="shell-guide border-l border-base-300 bg-base-200"
                aria-label="Contextual tools"
              >
                <div className="flex items-center justify-between p-5">
                  <h2 className="text-lg font-semibold">Tools</h2>
                  <Button tone="ghost" onClick={() => setToolsVisible(false)}>
                    Hide ›
                  </Button>
                </div>
                <div ref={setDesktopTools} className="px-5 pb-5" />
                {guide ? (
                  <QuickStartGuide activityKey={guide.key} />
                ) : (
                  <div className="space-y-4 p-5">
                    {sessionContext}
                    <RouterButtonLink href="/quick-start" tone="outline">
                      Quick Start
                    </RouterButtonLink>
                  </div>
                )}
              </section>
            </div>
            <Dialog
              ref={drawerPanel}
              id="shell-drawer"
              className="shell-drawer bg-base-100 text-base-content"
              aria-labelledby="shell-drawer-title"
              onCancel={() => setDrawer(null)}
              onClose={() => setDrawer(null)}
            >
              <div className="shell-drawer-header border-b border-base-300 bg-base-100">
                <h2
                  ref={drawerHeading}
                  tabIndex={-1}
                  id="shell-drawer-title"
                  className="text-xl font-semibold"
                >
                  {drawer === "navigation" ? "Navigation" : "Tools & context"}
                </h2>
                <Button
                  tone="outline"
                  className="min-h-11"
                  onClick={() => setDrawer(null)}
                >
                  Close
                </Button>
              </div>
              <div
                className="shell-drawer-content"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a[href]"))
                    setDrawer(null);
                }}
              >
                {drawer === "navigation" ? (
                  <>
                    <p className="mb-4 text-sm text-base-content/70">
                      Current destination: <CurrentDestination />
                    </p>
                    <PrimaryNavigation
                      gmAccess={gmAccess}
                      systemAdministrator={systemAdministrator}
                      onNavigate={() => setDrawer(null)}
                    />
                    <ContextualSidebar
                      gmAccess={gmAccess}
                      systemAdministrator={systemAdministrator}
                      onNavigate={() => setDrawer(null)}
                    />
                  </>
                ) : (
                  <div className="space-y-6">
                    <div ref={setMobileTools} />
                    {sessionContext}
                    {guide ? (
                      <QuickStartGuide activityKey={guide.key} />
                    ) : (
                      <section>
                        <h3 className="font-semibold">Quick Start</h3>
                        <p className="my-3 text-sm text-base-content/70">
                          Guided activities for preparing your World and
                          Campaign.
                        </p>
                        <RouterButtonLink
                          href="/quick-start"
                          tone="outline"
                          onClick={() => setDrawer(null)}
                        >
                          Open Quick Start
                        </RouterButtonLink>
                      </section>
                    )}
                    {account}
                  </div>
                )}
              </div>
            </Dialog>
          </div>
        )}
      </ShellToolsTarget.Provider>
    </NavigationLiveData.Provider>
  );
}

export function LandingPage({
  initialHealthy,
  initialWorlds,
  initialInstances,
}: {
  initialHealthy?: boolean;
  initialWorlds: ReadSection<WorldDefinitionList>;
  initialInstances: ReadSection<CampaignInstanceList>;
}) {
  const [worldSearch, setWorldSearch] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [healthy, setHealthy] = useState(initialHealthy ?? false);
  const [continuations, setContinuations] = useState<
    Record<string, CampaignInstanceContinuation | undefined>
  >({});

  useEffect(() => {
    if (initialHealthy === undefined) {
      void checkHealth().then(
        () => setHealthy(true),
        () => setHealthy(false),
      );
    }
  }, [initialHealthy]);

  const activeInstances = initialInstances.ok
    ? initialInstances.data.items.filter(
        (instance) => instance.status.toLowerCase() === "active",
      )
    : [];

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      activeInstances.map(
        async (instance) =>
          [
            instance.id,
            await getCampaignInstanceContinuation(
              instance.campaignDefinitionId,
              instance.id,
            ),
          ] as const,
      ),
    ).then(
      (entries) => {
        if (!cancelled) setContinuations(Object.fromEntries(entries));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [initialInstances]);

  return (
    <main className="bg-base-100 text-base-content">
      <div className="mx-auto max-w-6xl p-4 lg:p-10">
        <header className="mb-8 space-y-3">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Your workspace
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold">Home</h1>
            <StatusIndicator
              tone={healthy ? "success" : "error"}
              label={healthy ? "Workspace ready" : "Services unavailable"}
            />
          </div>
          <p className="text-sm text-base-content/60">
            Your Worlds and Campaigns, ready to continue.
          </p>
        </header>
        <section className="space-y-4" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="text-2xl font-semibold">
            Your campaigns
          </h2>
          <div className="flex items-end gap-2">
            <Field className="flex-1" label="Search campaigns">
              <Input
                value={campaignSearch}
                onChange={(event) => setCampaignSearch(event.target.value)}
                placeholder="Search campaigns…"
              />
            </Field>
            <Button
              tone="ghost"
              className="min-h-11"
              onClick={() => setCampaignSearch("")}
            >
              Clear
            </Button>
          </div>
          {!initialInstances.ok ? (
            <Alert tone="error" className="mt-5">
              {initialInstances.message}
            </Alert>
          ) : activeInstances.length ? (
            <div className="mt-4 grid gap-3">
              {activeInstances
                .filter((instance) =>
                  instance.name
                    .toLowerCase()
                    .includes(campaignSearch.toLowerCase()),
                )
                .map((instance, index) => (
                  <article
                    key={instance.id}
                    className="card border border-base-300 bg-base-200"
                  >
                    <div className="card-body">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="card-title">
                          {instance.name.trim() || "Unnamed Campaign Instance"}
                        </h3>
                        <Badge outline>{statusLabel(instance.status)}</Badge>
                      </div>
                      <div className="card-actions mt-4 items-center">
                        <RouterButtonLink
                          href={`/campaigns/instances/${encodeURIComponent(instance.id)}`}
                          tone="outline"
                          size="sm"
                        >
                          Manage Instance
                        </RouterButtonLink>
                        {continuations[instance.id]?.enabled ? (
                          <RouterButtonLink
                            href={
                              continuations[instance.id]?.session
                                ? `/campaigns/instances/${encodeURIComponent(instance.id)}/${continuations[instance.id]?.kind === "continue" || continuations[instance.id]?.kind === "resume" ? "run" : "sessions"}/${encodeURIComponent(continuations[instance.id]!.session!.id)}`
                                : `/campaigns/instances/${encodeURIComponent(instance.id)}/sessions`
                            }
                            tone="primary"
                            size="sm"
                            aria-describedby={`continue-campaign-${index}`}
                          >
                            {continuations[instance.id]?.label}
                          </RouterButtonLink>
                        ) : (
                          <Button
                            disabled
                            size="sm"
                            aria-describedby={`continue-campaign-${index}`}
                          >
                            {continuations[instance.id]?.label ?? "Continue"}
                          </Button>
                        )}
                      </div>
                      <p
                        id={`continue-campaign-${index}`}
                        className="text-xs text-base-content/50"
                      >
                        {continuations[instance.id]?.detail ??
                          "Checking resumable Sessions…"}
                      </p>
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-base-content/55">
              No active Campaign Instances are available.
            </p>
          )}
        </section>
        <section
          className="mt-8 space-y-4"
          aria-labelledby="home-worlds-heading"
        >
          <h2 id="home-worlds-heading" className="text-2xl font-semibold">
            Your worlds
          </h2>
          <div className="flex items-end gap-2">
            <Field className="flex-1" label="Search worlds">
              <Input
                value={worldSearch}
                onChange={(event) => setWorldSearch(event.target.value)}
                placeholder="Search worlds…"
              />
            </Field>
            <Button
              tone="ghost"
              className="min-h-11"
              onClick={() => setWorldSearch("")}
            >
              Clear
            </Button>
          </div>
          {!initialWorlds.ok ? (
            <Alert tone="error">{initialWorlds.message}</Alert>
          ) : (
            <div className="grid gap-3">
              {initialWorlds.data.items
                .filter((world) =>
                  world.name.toLowerCase().includes(worldSearch.toLowerCase()),
                )
                .map((world) => (
                  <article
                    key={world.id}
                    className="flex min-h-24 flex-wrap items-center justify-between gap-4 rounded-lg border border-base-300 bg-base-200 p-5"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {world.name || "Unnamed World"}
                      </h3>
                      <p className="mt-1 text-sm text-base-content/60">
                        World author · {statusLabel(world.status)}
                      </p>
                    </div>
                    <RouterButtonLink
                      href={`/worlds/${encodeURIComponent(world.id)}`}
                      tone="outline"
                    >
                      Open World
                    </RouterButtonLink>
                  </article>
                ))}
              {!initialWorlds.data.items.length && (
                <p className="text-base-content/60">No Worlds yet.</p>
              )}
            </div>
          )}
          <RouterButtonLink href="/worlds" tone="ghost">
            Browse Worlds
          </RouterButtonLink>
        </section>
      </div>
    </main>
  );
}

export function AppShell(props: Parameters<typeof LegacyAppShell>[0]) {
  const pathname = useLocation().pathname;
  if (
    pathname === "/" ||
    pathname === "/worlds" ||
    pathname.startsWith("/worlds/")
  )
    return props.children;
  return <LegacyAppShell {...props} />;
}
