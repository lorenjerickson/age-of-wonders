import {
  NavigationLiveData,
  type LiveNavigationWorld,
} from "./navigationLiveData";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Label,
  StatusIndicator,
  StructuralCheckbox,
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
} from "./ContextualNavigation";
import { QuickStartGuide } from "./QuickStart";
import { quickStartActivity, quickStartKeyFromSearch } from "./quickStartModel";
import type { ReadSection } from "./server/readModels";
import { statusLabel } from "./campaignLibraryModel";

export function AppShell({
  children,
  gmAccess = true,
  systemAdministrator = false,
}: {
  children: ReactNode;
  gmAccess?: boolean;
  systemAdministrator?: boolean;
}) {
  const [navigationWorld, setNavigationWorld] = useState<LiveNavigationWorld>();
  const location = useLocation();
  const pathname = location.pathname;
  const quickStartKey = quickStartKeyFromSearch(location.searchStr);
  const guide = quickStartKey ? quickStartActivity(quickStartKey) : undefined;
  const segments = pathname.split("/").filter(Boolean);
  const locationWorkspaceActive =
    segments[0] === "campaigns" && segments[2] === "locations";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeSession, setActiveSession] =
    useState<Awaited<ReturnType<typeof getGmActiveSession>>["session"]>();
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  const drawerTrigger = useRef<HTMLLabelElement>(null);
  const drawerPanel = useRef<HTMLElement>(null);
  const guideTrigger = useRef<HTMLButtonElement>(null);
  const guidePanel = useRef<HTMLElement>(null);

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
    if (!drawerOpen) return;
    drawerPanel.current
      ?.querySelector<HTMLElement>("a[href], button:not([disabled])")
      ?.focus();
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => drawerTrigger.current?.focus());
  }

  function handleDrawerKeys(event: KeyboardEvent<HTMLElement>) {
    if (!drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerPanel.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeGuide() {
    setGuideOpen(false);
    requestAnimationFrame(() => guideTrigger.current?.focus());
  }

  function handleGuideKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeGuide();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = guidePanel.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <NavigationLiveData.Provider
      value={{ world: navigationWorld, setWorld: setNavigationWorld }}
    >
      <div className="drawer h-dvh overflow-hidden lg:drawer-open">
        <StructuralCheckbox
          id="app-drawer"
          checked={drawerOpen}
          onChange={(event) => setDrawerOpen(event.target.checked)}
        />
        <div
          className={`drawer-content app-browse-frame h-dvh min-w-0 w-full ${locationWorkspaceActive ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <Label
            ref={drawerTrigger}
            htmlFor="app-drawer"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="app-navigation-panel"
            className="btn btn-square btn-ghost btn-sm fixed top-3 left-3 z-50 bg-base-200/75 shadow-lg backdrop-blur-xl lg:hidden"
          >
            <span aria-hidden="true">☰</span>
          </Label>
          <div
            className={
              guide
                ? "min-h-full xl:grid xl:grid-cols-[minmax(0,1fr)_20rem]"
                : "min-h-full"
            }
          >
            <div className="min-w-0">
              {activeSession && !pathname.includes("/run/") && (
                <div className="border-b border-warning/25 bg-warning/10 px-6 py-3 lg:px-10">
                  <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                    <p className="text-sm">
                      <strong>{activeSession.sessionName}</strong> in{" "}
                      {activeSession.campaignInstanceName} is{" "}
                      {activeSession.status}.
                    </p>
                    <RouterButtonLink
                      href={`/campaigns/instances/${encodeURIComponent(activeSession.campaignInstanceId)}/run/${encodeURIComponent(activeSession.sessionId)}`}
                      tone="primary"
                      size="sm"
                    >
                      {activeSession.label} Session
                    </RouterButtonLink>
                  </div>
                </div>
              )}
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
                ) && (
                  <>
                    <header className="border-b border-base-300 px-6 py-4 pl-16 font-semibold lg:px-10">
                      GM Workspace
                    </header>
                    <ContextualBreadcrumbs />
                  </>
                )}
              {children}
            </div>
            {guide && (
              <div className="hidden xl:block">
                <QuickStartGuide activityKey={guide.key} />
              </div>
            )}
          </div>
          {guide && (
            <Button
              ref={guideTrigger}
              tone="primary"
              className="fixed right-4 bottom-4 z-30 min-h-11 shadow-xl xl:hidden"
              aria-expanded={guideOpen}
              aria-controls="quick-start-mobile-guide"
              onClick={() => setGuideOpen(true)}
            >
              Quick Start guide
            </Button>
          )}
          {guide && guideOpen && (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/50 xl:hidden"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeGuide();
              }}
            >
              <section
                ref={guidePanel}
                id="quick-start-mobile-guide"
                role="dialog"
                aria-modal="true"
                aria-label="Quick Start guide"
                className="h-full w-full max-w-sm overflow-y-auto bg-base-100 shadow-2xl"
                onKeyDown={handleGuideKeys}
              >
                <div className="sticky top-0 z-10 flex justify-end border-b border-base-300 bg-base-100 p-2">
                  <Button autoFocus tone="ghost" onClick={closeGuide}>
                    Close guide
                  </Button>
                </div>
                <QuickStartGuide activityKey={guide.key} />
              </section>
            </div>
          )}
        </div>
        <div
          id="app-navigation-panel"
          className="drawer-side z-40"
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen || undefined}
          aria-label={drawerOpen ? "Application navigation" : undefined}
        >
          <Label
            htmlFor="app-drawer"
            aria-label="Close navigation"
            className="drawer-overlay"
            onClick={closeDrawer}
          />
          <aside
            ref={drawerPanel}
            onKeyDown={handleDrawerKeys}
            className="flex h-dvh w-64 flex-col overflow-y-auto border-r border-base-300/70 bg-base-200/80 p-3 text-base-content shadow-xl backdrop-blur-xl"
          >
            <Button
              tone="ghost"
              size="sm"
              className="mb-2 min-h-11 self-end lg:hidden"
              onClick={closeDrawer}
            >
              Close navigation
            </Button>
            <ContextualSidebar
              gmAccess={gmAccess}
              systemAdministrator={systemAdministrator}
              onNavigate={() => setDrawerOpen(false)}
            />
            <div className="border-t border-base-300/70 px-3 py-3">
              {auth0?.configured &&
                (auth0.linked ? (
                  <p className="mb-2 text-xs text-success">Auth0 connected</p>
                ) : (
                  <a
                    className="btn btn-outline btn-sm mb-2 w-full"
                    href={`/api/auth/auth0/link?returnTo=${encodeURIComponent(pathname)}`}
                  >
                    Connect Auth0
                  </a>
                ))}
              <p className="text-xs leading-5 text-base-content/35">
                Author Worlds, prepare Campaigns, and continue play.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </NavigationLiveData.Provider>
  );
}

function Header({ healthy }: { healthy?: boolean }) {
  return (
    <header className="navbar border-b border-base-300 px-0 pb-6">
      <RouterButtonLink
        href="/"
        tone="ghost"
        className="h-auto flex-col items-start gap-0 px-0"
      >
        <p className="text-xs font-semibold tracking-[0.28em] text-amber-300 uppercase">
          Age of Wonders
        </p>
        <p className="mt-2 text-lg font-medium text-zinc-100 transition group-hover:text-white">
          World studio
        </p>
      </RouterButtonLink>
      <div className="ml-auto">
        {healthy !== undefined && (
          <StatusIndicator
            tone={healthy ? "success" : "error"}
            label={healthy ? "Workspace ready" : "Services unavailable"}
            className="py-3 text-xs"
          />
        )}
      </div>
    </header>
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
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto min-h-screen max-w-6xl px-6 py-10 lg:px-10">
        <Header healthy={healthy} />
        <ContextualBreadcrumbs />
        <section className="grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-sm font-medium text-amber-300">
              Your next realm
            </p>
            <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              Build a world worth returning to.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-400">
              Begin with a spark. The worldbuilder will turn it into a living
              setting you can refine, connect, and bring into play.
            </p>
          </div>
          <article className="card border border-primary/20 bg-primary/[0.07] shadow-xl">
            <div className="card-body">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Learn by doing
              </p>
              <h2 className="card-title text-2xl">Quick Start</h2>
              <p className="leading-7 text-base-content/65">
                Complete guided tasks inside the real World, Campaign, and
                Players workspaces.
              </p>
              <RouterButtonLink
                href="/quick-start"
                tone="primary"
                className="mt-3"
              >
                Open Quick Start
              </RouterButtonLink>
            </div>
          </article>
        </section>

        <section
          className="border-t border-white/10 pt-10"
          aria-labelledby="world-choice-heading"
        >
          <h2 id="world-choice-heading" className="text-2xl font-semibold">
            Choose a World
          </h2>
          <p className="mt-2 text-base-content/60">
            World selection is deliberate; the dashboard does not infer a
            current World.
          </p>
          {!initialWorlds.ok ? (
            <Alert tone="error" className="mt-5">
              {initialWorlds.message}
            </Alert>
          ) : (
            <p className="mt-5 text-sm text-base-content/60">
              {initialWorlds.data.total} World{" "}
              {initialWorlds.data.total === 1 ? "Definition" : "Definitions"}{" "}
              available.
            </p>
          )}
          <RouterButtonLink href="/worlds" tone="outline" className="mt-5">
            Choose a World Definition
          </RouterButtonLink>
        </section>

        <section className="py-10" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="text-2xl font-semibold">
            Continue Campaigns
          </h2>
          <p className="mt-2 max-w-3xl text-base-content/60">
            Every active Campaign Instance appears here. Continue remains
            unavailable until an Instance has an explicit resumable Session
            relationship.
          </p>
          {!initialInstances.ok ? (
            <Alert tone="error" className="mt-5">
              {initialInstances.message}
            </Alert>
          ) : activeInstances.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {activeInstances.map((instance, index) => (
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
      </div>
    </main>
  );
}
