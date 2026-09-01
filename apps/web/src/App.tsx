import { FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  checkHealth,
  createWorldWithAi,
  type DomainList,
  type DomainRecord,
  type DomainResource,
  getDomainRecord,
  listDomainRecords,
  replaceDomainRecord,
} from "./api";
import { WorldEditor } from "./WorldEditor";
import {
  CreatureCreatePage,
  CreatureEditorPage,
  CreatureListPage,
} from "./Creatures";
import { ItemCreatePage, ItemEditorPage, ItemListPage } from "./Items";
import { CampaignCreatePage, CampaignEditorPage } from "./Campaigns";
import { SessionCanvasHarness } from "./SessionCanvasHarness";

type PrimaryNavigationLabel =
  "Location" | "Campaign" | "Sessions" | "Creatures" | "Items";

function NavigationIcon({ item }: { item: PrimaryNavigationLabel }) {
  if (item === "Campaign" || item === "Sessions") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        {item === "Campaign" && (
          <>
            <path d="M6 3.5h9l3 3V20.5H6v-17Z" />
            <path d="M15 3.5v3h3M9 11h6M9 15h6" />
          </>
        )}
        {item === "Sessions" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </>
        )}
      </svg>
    );
  }

  if (item === "Location") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (item === "Creatures")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M8.5 10.5 6 6l4.5 1.5M15.5 10.5 18 6l-4.5 1.5M7 13c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5v2c0 3-2.2 5.5-5 5.5S7 18 7 15v-2Z" />
        <path d="M9.5 14h.01M14.5 14h.01M10 17c1.3.7 2.7.7 4 0" />
      </svg>
    );

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Z" />
      <path d="m5 7.5 7 3.5 7-3.5M12 11v9" />
    </svg>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const activeSection = segments[0];
  const nestedSection = activeSection === "worlds" ? segments[2] : undefined;
  const [world, setWorld] = useState<DomainRecord>();
  const [campaign, setCampaign] = useState<DomainRecord>();
  const locationWorkspaceActive =
    activeSection === "campaigns" && segments[2] === "locations";

  useEffect(() => {
    let active = true;
    void Promise.all([
      listDomainRecords("locations", {
        kind: "world",
        limit: 1,
        sort: "updatedAt",
        order: "desc",
      }),
      listDomainRecords("campaigns", {
        limit: 1,
        sort: "updatedAt",
        order: "desc",
      }),
    ]).then(
      ([worlds, campaigns]) => {
        if (!active) return;
        setWorld(worlds.items[0]);
        setCampaign(campaigns.items[0]);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  const worldHref = world
    ? `/worlds/${encodeURIComponent(world.id)}`
    : "/worlds";
  const campaignHref = campaign
    ? `/campaigns/${encodeURIComponent(campaign.id)}`
    : "/campaigns";
  const locationWorkspaceHref = campaign
    ? `${campaignHref}/locations`
    : worldHref;
  const primaryNavigation: ReadonlyArray<{
    label: PrimaryNavigationLabel;
    href: string;
    active: boolean;
  }> = [
    {
      label: "Location",
      href: locationWorkspaceHref,
      active:
        !activeSection ||
        (activeSection === "campaigns" && segments[2] === "locations") ||
        (activeSection === "worlds" &&
          nestedSection !== "creatures" &&
          nestedSection !== "items") ||
        activeSection === "locations",
    },
    {
      label: "Campaign",
      href: campaignHref,
      active: activeSection === "campaigns" && segments[2] !== "locations",
    },
    {
      label: "Sessions",
      href: "/sessions",
      active: activeSection === "sessions",
    },
    {
      label: "Creatures",
      href: world ? `${worldHref}/creatures` : "/creatures",
      active:
        activeSection === "creatures" ||
        (activeSection === "worlds" && nestedSection === "creatures"),
    },
    {
      label: "Items",
      href: world ? `${worldHref}/items` : "/items",
      active:
        activeSection === "items" ||
        (activeSection === "worlds" && nestedSection === "items"),
    },
  ];

  return (
    <div className="drawer h-dvh overflow-hidden lg:drawer-open">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />
      <div
        className={`drawer-content app-browse-frame h-dvh min-w-0 w-full ${locationWorkspaceActive ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        <label
          htmlFor="app-drawer"
          aria-label="Open navigation"
          className="btn btn-square btn-ghost btn-sm fixed top-3 left-3 z-50 bg-base-200/75 shadow-lg backdrop-blur-xl lg:hidden"
        >
          <span aria-hidden="true">☰</span>
        </label>
        {children}
      </div>
      <div className="drawer-side z-40">
        <label
          htmlFor="app-drawer"
          aria-label="Close navigation"
          className="drawer-overlay"
        />
        <aside className="flex h-dvh w-64 flex-col overflow-y-auto border-r border-base-300/70 bg-base-200/80 p-3 text-base-content shadow-xl backdrop-blur-xl">
          <div className="px-3 pt-3 pb-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              GM workspace
            </p>
            <p className="mt-2 truncate font-semibold">
              {world?.name ?? "Your world"}
            </p>
            <p className="mt-1 truncate text-sm text-base-content/50">
              {campaign?.name ?? "Campaign not configured"}
            </p>
          </div>
          <nav aria-label="Primary navigation" className="min-h-0 flex-1">
            <ul className="menu w-full gap-1 p-0">
              {primaryNavigation.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    className={
                      item.active ? "menu-active font-semibold" : undefined
                    }
                  >
                    <NavigationIcon item={item.label} />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="px-3 py-3 text-xs leading-5 text-base-content/35">
            World changes persist across every session.
          </p>
        </aside>
      </div>
    </div>
  );
}

function textAt(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function twoSentenceSummary(
  source: string | undefined,
  firstFallback: string,
  secondFallback: string,
) {
  const sentences = source
    ?.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences?.length) return `${firstFallback} ${secondFallback}`;
  if (sentences.length === 1) return `${sentences[0]} ${secondFallback}`;
  return sentences.slice(0, 2).join(" ");
}

function Header({ healthy }: { healthy?: boolean }) {
  return (
    <header className="navbar border-b border-base-300 px-0 pb-6">
      <a
        href="/"
        className="btn btn-ghost h-auto flex-col items-start gap-0 px-0"
      >
        <p className="text-xs font-semibold tracking-[0.28em] text-amber-300 uppercase">
          Age of Wonders
        </p>
        <p className="mt-2 text-lg font-medium text-zinc-100 transition group-hover:text-white">
          World studio
        </p>
      </a>
      <div className="ml-auto">
        {healthy !== undefined && (
          <div className="badge badge-ghost gap-2 py-3 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${healthy ? "bg-emerald-400" : "bg-rose-400"}`}
            />
            {healthy ? "Workspace ready" : "Services unavailable"}
          </div>
        )}
      </div>
    </header>
  );
}

function RecentCard({
  eyebrow,
  record,
  href,
  empty,
}: {
  eyebrow: string;
  record?: DomainRecord;
  href?: string;
  empty: string;
}) {
  const isWorld = record?.resource === "locations";
  const summary = record
    ? twoSentenceSummary(
        textAt(record.data, "description") ?? textAt(record.data, "summary"),
        isWorld
          ? `${record.name ?? "This world"} is ready to be shaped.`
          : `${record.name ?? "This campaign"} is your latest active story.`,
        isWorld
          ? "Open it to develop its places, peoples, and conflicts."
          : "Open it to continue its scenes, parties, and quests.",
      )
    : undefined;

  return (
    <article className="card min-h-64 border border-base-300 bg-base-200 shadow-xl">
      <div className="card-body">
        <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          {eyebrow}
        </p>
        {record ? (
          <>
            <h3 className="mt-5 text-3xl font-semibold tracking-tight text-white">
              {record.name}
            </h3>
            <p className="mt-4 flex-1 text-base leading-7 text-zinc-400">
              {summary}
            </p>
            <a
              href={href}
              className="btn btn-link mt-7 w-fit px-0 text-primary"
            >
              Edit {isWorld ? "world" : "campaign"} <span aria-hidden>→</span>
            </a>
          </>
        ) : (
          <p className="mt-5 max-w-sm text-base leading-7 text-zinc-500">
            {empty}
          </p>
        )}
      </div>
    </article>
  );
}

function LandingPage() {
  const [healthy, setHealthy] = useState(false);
  const [worlds, setWorlds] = useState<DomainList>();
  const [campaigns, setCampaigns] = useState<DomainList>();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void checkHealth().then(
      () => setHealthy(true),
      () => setHealthy(false),
    );
    void listDomainRecords("locations", {
      kind: "world",
      limit: 1,
      sort: "updatedAt",
      order: "desc",
    }).then(setWorlds, (caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : "Could not load worlds",
      ),
    );
    void listDomainRecords("campaigns", {
      limit: 1,
      sort: "updatedAt",
      order: "desc",
    }).then(setCampaigns, (caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : "Could not load campaigns",
      ),
    );
  }, []);

  async function createWorld(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await createWorldWithAi(prompt);
      window.location.assign(`/worlds/${encodeURIComponent(result.world.id)}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "World creation failed",
      );
      setLoading(false);
    }
  }

  const recentWorld = worlds?.items[0];
  const recentCampaign = campaigns?.items[0];

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto min-h-screen max-w-6xl px-6 py-10 lg:px-10">
        <Header healthy={healthy} />
        <section className="grid gap-10 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
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
          <form
            onSubmit={createWorld}
            className="card border border-primary/20 bg-primary/[0.07] shadow-xl"
          >
            <div className="card-body">
              <label
                htmlFor="world-prompt"
                className="text-lg font-semibold text-white"
              >
                Create a new world with AI
              </label>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Describe the mood, premise, people, or conflict you want to
                explore.
              </p>
              <textarea
                id="world-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A rain-soaked empire built inside the skeleton of a sleeping god…"
                rows={4}
                className="textarea textarea-bordered mt-5 w-full resize-none text-base leading-7"
              />
              <button
                disabled={loading || prompt.trim().length < 3}
                className="btn btn-primary mt-4"
              >
                {loading ? "Creating your world…" : "Create world"}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <p role="alert" className="alert alert-error mb-6 text-sm">
            {error}
          </p>
        )}

        <section className="grid gap-6 border-t border-white/10 pt-10 md:grid-cols-2">
          <RecentCard
            eyebrow="Recently edited world"
            record={recentWorld}
            href={
              recentWorld
                ? `/worlds/${encodeURIComponent(recentWorld.id)}`
                : undefined
            }
            empty="No worlds yet. Use the prompt above to imagine your first one."
          />
          <RecentCard
            eyebrow="Recently active campaign"
            record={recentCampaign}
            href={
              recentCampaign
                ? `/campaigns/${encodeURIComponent(recentCampaign.id)}`
                : undefined
            }
            empty="No campaigns yet. Your latest active story will appear here."
          />
        </section>
        <nav className="flex flex-wrap gap-6 py-8 text-sm font-medium text-zinc-300">
          {(worlds?.total ?? 0) > 1 && <a href="/worlds">View all worlds →</a>}
          {(campaigns?.total ?? 0) > 1 && (
            <a href="/campaigns">View all campaigns →</a>
          )}
        </nav>
      </div>
    </main>
  );
}

function ResourceListPage({
  resource,
  label,
  basePath,
  kind,
}: {
  resource: DomainResource;
  label: string;
  basePath: string;
  kind?: string;
}) {
  const [result, setResult] = useState<DomainList>();
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [kind, label, resource]);

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
            <a href="/campaigns/new" className="btn btn-primary">
              Create campaign
            </a>
          )}
        </div>
        {error && (
          <p role="alert" className="alert alert-error">
            {error}
          </p>
        )}
        <div className="grid gap-4">
          {result?.items.map((record) => (
            <a
              key={record.id}
              href={`/${basePath}/${encodeURIComponent(record.id)}`}
              className="card card-side flex-row items-center justify-between border border-base-300 bg-base-200 p-6 shadow-sm transition hover:border-primary/30"
            >
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {record.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Updated {new Date(record.updatedAt).toLocaleString()}
                </p>
              </div>
              <span className="text-amber-300">Edit →</span>
            </a>
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

function ResourceEditorPage({
  resource,
  id,
  label,
  basePath,
}: {
  resource: DomainResource;
  id: string;
  label: string;
  basePath: string;
}) {
  const [record, setRecord] = useState<DomainRecord>();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
  }, [id, resource]);

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
              <a href={`/${basePath}`} className="text-sm text-amber-300">
                ← Back to {label.toLowerCase()}
              </a>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                {record?.name ?? "Loading…"}
              </h1>
              {record && (
                <p className="mt-2 text-sm text-zinc-500">
                  Revision {record.revision}
                </p>
              )}
            </div>
            <button disabled={!record || saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
          <textarea
            aria-label="Domain aggregate JSON"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="textarea textarea-bordered mt-8 min-h-[60vh] w-full resize-y p-5 font-mono text-sm leading-6"
          />
          {message && <p className="mt-4 text-sm text-zinc-300">{message}</p>}
        </form>
      </div>
    </main>
  );
}

function SessionsPage() {
  const [sessions, setSessions] = useState<DomainRecord[]>([]);
  const [campaign, setCampaign] = useState<DomainRecord>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      listDomainRecords("sessions", {
        limit: 100,
        sort: "createdAt",
        order: "desc",
      }),
      listDomainRecords("campaigns", {
        limit: 1,
        sort: "updatedAt",
        order: "desc",
      }),
    ]).then(
      ([sessionResult, campaignResult]) => {
        const currentCampaign = campaignResult.items[0];
        setSessions(
          currentCampaign
            ? sessionResult.items.filter(
                (session) => session.data.campaignId === currentCampaign.id,
              )
            : [],
        );
        setCampaign(currentCampaign);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const workspaceHref = campaign
    ? `/campaigns/${encodeURIComponent(campaign.id)}/locations`
    : "/campaigns";

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-base-300 pb-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              World journal
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Sessions</h1>
            <p className="mt-2 text-sm text-base-content/55">
              Sessions mark periods of play; world and location state continues
              between them.
            </p>
          </div>
          <a href={workspaceHref} className="btn btn-primary">
            Open location workspace
          </a>
        </div>
        {loading ? (
          <p className="py-10 text-sm text-base-content/50">
            Loading session history…
          </p>
        ) : sessions.length ? (
          <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-box border border-base-300 bg-base-200/65 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">
                    {session.name ?? "Untitled session"}
                  </h2>
                  <span className="badge badge-outline capitalize">
                    {typeof session.data.status === "string"
                      ? session.data.status.replaceAll("-", " ")
                      : "Recorded"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-base-content/50">
                  {typeof session.data.notes === "string" &&
                  session.data.notes.trim()
                    ? session.data.notes
                    : "No session notes yet."}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-6 rounded-box border border-dashed border-base-300 p-8 text-center">
            <h2 className="font-semibold">No sessions recorded yet</h2>
            <p className="mt-2 text-sm text-base-content/50">
              Start the first session from any location workspace.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function WorkspaceEntryPage() {
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    void listDomainRecords("campaigns", {
      limit: 1,
      sort: "updatedAt",
      order: "desc",
    }).then(
      (result) => {
        const current = result.items[0];
        if (!current) {
          setShowSetup(true);
          return;
        }
        window.location.replace(
          `/campaigns/${encodeURIComponent(current.id)}/locations`,
        );
      },
      () => setShowSetup(true),
    );
  }, []);

  if (showSetup) return <LandingPage />;
  return (
    <main className="grid min-h-[calc(100dvh-3rem)] place-items-center bg-base-100">
      <p className="text-sm text-base-content/55">Opening your world…</p>
    </main>
  );
}

function AppContent() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (
    segments[0] === "worlds" &&
    segments[1] &&
    segments[2] === "items" &&
    segments[3] === "new"
  ) {
    return <ItemCreatePage worldId={decodeURIComponent(segments[1])} />;
  }
  if (
    segments[0] === "worlds" &&
    segments[1] &&
    segments[2] === "items" &&
    segments[3]
  ) {
    return (
      <ItemEditorPage
        itemId={decodeURIComponent(segments[3])}
        worldId={decodeURIComponent(segments[1])}
      />
    );
  }
  if (segments[0] === "worlds" && segments[1] && segments[2] === "items") {
    return <ItemListPage worldId={decodeURIComponent(segments[1])} />;
  }
  if (
    segments[0] === "worlds" &&
    segments[1] &&
    segments[2] === "creatures" &&
    segments[3] === "new"
  ) {
    return <CreatureCreatePage worldId={decodeURIComponent(segments[1])} />;
  }
  if (
    segments[0] === "worlds" &&
    segments[1] &&
    segments[2] === "creatures" &&
    segments[3]
  ) {
    const worldId = decodeURIComponent(segments[1]);
    return (
      <CreatureEditorPage
        creatureId={decodeURIComponent(segments[3])}
        worldId={worldId}
      />
    );
  }
  if (segments[0] === "worlds" && segments[1] && segments[2] === "creatures") {
    return <CreatureListPage worldId={decodeURIComponent(segments[1])} />;
  }
  if (segments[0] === "worlds" && segments[1]) {
    return <WorldEditor id={decodeURIComponent(segments[1])} />;
  }
  if (segments[0] === "campaigns" && segments[1] === "new")
    return <CampaignCreatePage />;
  if (segments[0] === "campaigns" && segments[1])
    return (
      <CampaignEditorPage
        id={decodeURIComponent(segments[1])}
        view={segments[2] === "locations" ? "locations" : "definition"}
      />
    );
  if (segments[0] === "locations" && segments[1]) {
    return (
      <ResourceEditorPage
        resource="locations"
        id={decodeURIComponent(segments[1])}
        label="Locations"
        basePath="locations"
      />
    );
  }
  if (segments[0] === "creatures" && segments[1]) {
    return <CreatureEditorPage creatureId={decodeURIComponent(segments[1])} />;
  }
  if (segments[0] === "items" && segments[1]) {
    return (
      <ResourceEditorPage
        resource="definitions"
        id={decodeURIComponent(segments[1])}
        label="Items"
        basePath="items"
      />
    );
  }
  if (segments[0] === "systems" && segments[1]) {
    return (
      <ResourceEditorPage
        resource="systems"
        id={decodeURIComponent(segments[1])}
        label="Systems"
        basePath="systems"
      />
    );
  }
  if (segments[0] === "worlds")
    return (
      <ResourceListPage
        resource="locations"
        label="Worlds"
        basePath="worlds"
        kind="world"
      />
    );
  if (segments[0] === "campaigns")
    return (
      <ResourceListPage
        resource="campaigns"
        label="Campaigns"
        basePath="campaigns"
      />
    );
  if (segments[0] === "locations")
    return (
      <ResourceListPage
        resource="locations"
        label="Locations"
        basePath="locations"
      />
    );
  if (segments[0] === "creatures")
    return (
      <ResourceListPage
        resource="creatures"
        label="Creatures"
        basePath="creatures"
      />
    );
  if (segments[0] === "items")
    return (
      <ResourceListPage
        resource="definitions"
        label="Items"
        basePath="items"
        kind="item"
      />
    );
  if (segments[0] === "systems")
    return (
      <ResourceListPage resource="systems" label="Systems" basePath="systems" />
    );
  if (segments[0] === "sessions") return <SessionsPage />;
  return <WorkspaceEntryPage />;
}

export function App() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "session-canvas-lab") {
    return <SessionCanvasHarness />;
  }
  return (
    <AppShell>
      <AppContent />
    </AppShell>
  );
}
