import {
  FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Label,
  StatusIndicator,
  StructuralCheckbox,
  Textarea,
} from "@aow/ui";
import {
  checkHealth,
  getCampaignInstanceContinuation,
  getGmResumableSession,
  type CampaignInstanceContinuation,
  type CampaignInstanceList,
  type DomainList,
  type DomainRecord,
  type DomainResource,
  getDomainRecord,
  listDomainRecords,
  replaceDomainRecord,
  type WorldDefinitionList,
} from "./api";
import { InternalLink, RouterButtonLink } from "./navigation";
import {
  primaryNavigationForPath,
  type PrimaryNavigationItem,
} from "./gmNavigationModel";
import { QuickStartGuide } from "./QuickStart";
import { quickStartActivity, quickStartKeyFromSearch } from "./quickStartModel";
import type { ReadSection } from "./server/readModels";
import { statusLabel } from "./campaignLibraryModel";

function NavigationIcon({ item }: { item: PrimaryNavigationItem["key"] }) {
  const glyphs: Record<PrimaryNavigationItem["key"], string> = {
    home: "M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z",
    worlds:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21m0-18C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9M3.5 12h17",
    campaigns: "M6 3.5h9l3 3V20.5H6v-17Zm9 0v3h3M9 11h6M9 15h6",
    players:
      "M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-1a3 3 0 1 0 0-6m-7.5 9c-3 0-5.5 1.8-5.5 4v2h11v-2c0-2.2-2.5-4-5.5-4Zm7.5-.5c2.8 0 5 1.6 5 3.5v2h-5",
    settings:
      "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5 1 2.2 2.4.7 2-1.3 1.8 1.8-1.3 2 .7 2.4 2.2 1-1 2.4.3 2.6-2.4.4-1.7 1.8.1 2.4-2.4 1-1.3-2-2.3-.8-2 1.3-1.8-1.8 1.3-2-.7-2.4-2.2-1 1-2.4-.3-2.6 2.4-.4 1.7-1.8-.1-2.4 2.4-1 1.3 2 2.3.8 2-1.3 1.8 1.8-1.3 2 .7 2.4Z",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-5 w-5"
    >
      <path d={glyphs[item]} />
    </svg>
  );
}

function PrimaryNavigationLink({
  item,
  onNavigate,
}: {
  item: PrimaryNavigationItem;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={item.href}
      aria-current={item.active ? "page" : undefined}
      className={item.active ? "menu-active font-semibold" : undefined}
      onClick={onNavigate}
    >
      <NavigationIcon item={item.key} />
      {item.label}
    </Link>
  );
}

export function AppShell({
  children,
  gmScope,
}: {
  children: ReactNode;
  gmScope: string;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const quickStartKey = quickStartKeyFromSearch(location.searchStr);
  const guide = quickStartKey ? quickStartActivity(quickStartKey) : undefined;
  const segments = pathname.split("/").filter(Boolean);
  const locationWorkspaceActive =
    segments[0] === "campaigns" && segments[2] === "locations";
  const primaryNavigation = primaryNavigationForPath(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [resumableSession, setResumableSession] =
    useState<Awaited<ReturnType<typeof getGmResumableSession>>["session"]>();
  const drawerTrigger = useRef<HTMLLabelElement>(null);
  const drawerPanel = useRef<HTMLElement>(null);
  const guideTrigger = useRef<HTMLButtonElement>(null);
  const guidePanel = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getGmResumableSession().then(
      (result) => {
        if (!cancelled) setResumableSession(result.session);
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
            {resumableSession && !pathname.includes("/run/") && (
              <div className="border-b border-warning/25 bg-warning/10 px-6 py-3 lg:px-10">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    <strong>{resumableSession.sessionName}</strong> in{" "}
                    {resumableSession.campaignInstanceName} is{" "}
                    {resumableSession.status}.
                  </p>
                  <RouterButtonLink
                    href={`/campaigns/instances/${encodeURIComponent(resumableSession.campaignInstanceId)}/run/${encodeURIComponent(resumableSession.sessionId)}`}
                    tone="primary"
                    size="sm"
                  >
                    {resumableSession.label} Session
                  </RouterButtonLink>
                </div>
              </div>
            )}
            {children}
          </div>
          {guide && (
            <div className="hidden xl:block">
              <QuickStartGuide activityKey={guide.key} gmScope={gmScope} />
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
              <QuickStartGuide activityKey={guide.key} gmScope={gmScope} />
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
          <div className="px-3 pt-3 pb-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              GM workspace
            </p>
            <p className="mt-2 font-semibold">Age of Wonders</p>
            <p className="mt-1 text-sm text-base-content/50">
              Choose a workspace to begin.
            </p>
          </div>
          <nav aria-label="Primary navigation" className="min-h-0 flex-1">
            <ul className="menu w-full gap-1 p-0">
              {primaryNavigation.map((item) => (
                <li key={item.key}>
                  <PrimaryNavigationLink
                    item={item}
                    onNavigate={() => setDrawerOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <p className="px-3 py-3 text-xs leading-5 text-base-content/35">
            Author Worlds, prepare Campaigns, and continue play.
          </p>
        </aside>
      </div>
    </div>
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
            await getCampaignInstanceContinuation(instance.id),
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

export function ResourceListPage({
  resource,
  label,
  basePath,
  kind,
  initialResult,
}: {
  resource: DomainResource;
  label: string;
  basePath: string;
  kind?: string;
  initialResult?: DomainList;
}) {
  const [result, setResult] = useState<DomainList | undefined>(initialResult);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialResult) return;
    void listDomainRecords(resource, {
      ...(kind ? { kind } : {}),
      limit: 200,
      sort: "updatedAt",
      order: "desc",
    }).then(setResult, (caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : `Could not load ${label}`,
      ),
    );
  }, [initialResult, kind, label, resource]);

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
        <Header />
        <div className="flex flex-wrap items-end justify-between gap-5 py-12">
          <div>
            <p className="text-sm text-amber-300">Library</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">
              {label}
            </h1>
            <p className="mt-3 text-zinc-500">Most recently edited first.</p>
          </div>
          {resource === "campaigns" && (
            <RouterButtonLink href="/campaigns/new" tone="primary">
              Create campaign
            </RouterButtonLink>
          )}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4">
          {result?.items.map((record) => (
            <InternalLink
              key={record.id}
              href={`/${basePath}/${encodeURIComponent(record.id)}`}
              className="card card-side flex-row items-center justify-between border border-base-300 bg-base-200 p-6 shadow-sm transition hover:border-primary/30"
            >
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {record.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Updated{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(record.updatedAt))}{" "}
                  UTC
                </p>
              </div>
              <span className="text-amber-300">Edit →</span>
            </InternalLink>
          ))}
          {result && result.items.length === 0 && (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/50 px-6 py-14 text-center text-base-content/60">
              {resource === "campaigns"
                ? "No campaigns yet. Create one from an existing world."
                : `No ${label.toLowerCase()} yet.`}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export function ResourceEditorPage({
  resource,
  id,
  label,
  basePath,
  initialRecord,
}: {
  resource: DomainResource;
  id: string;
  label: string;
  basePath: string;
  initialRecord?: DomainRecord;
}) {
  const [record, setRecord] = useState<DomainRecord | undefined>(initialRecord);
  const [draft, setDraft] = useState(() =>
    initialRecord ? JSON.stringify(initialRecord.data, null, 2) : "",
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialRecord) return;
    void getDomainRecord(resource, id).then(
      (loaded) => {
        setRecord(loaded);
        setDraft(JSON.stringify(loaded.data, null, 2));
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error ? caught.message : "Could not load record",
        ),
    );
  }, [id, initialRecord, resource]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    setSaving(true);
    setMessage("");
    try {
      const data: unknown = JSON.parse(draft);
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("The aggregate must be a JSON object.");
      }
      const updated = await replaceDomainRecord(record, data);
      setRecord(updated);
      setDraft(JSON.stringify(updated.data, null, 2));
      setMessage("Saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
        <Header />
        <form onSubmit={save} className="py-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <InternalLink
                href={`/${basePath}`}
                className="text-sm text-amber-300"
              >
                ← Back to {label.toLowerCase()}
              </InternalLink>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                {record?.name ?? "Loading…"}
              </h1>
              {record && (
                <p className="mt-2 text-sm text-zinc-500">
                  Revision {record.revision}
                </p>
              )}
            </div>
            <Button
              type="submit"
              tone="primary"
              loading={saving}
              disabled={!record}
            >
              Save changes
            </Button>
          </div>
          <Textarea
            aria-label="Domain aggregate JSON"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="mt-8 min-h-[60vh] p-5 font-mono text-sm leading-6"
          />
          {message && <Alert className="mt-4">{message}</Alert>}
        </form>
      </div>
    </main>
  );
}
