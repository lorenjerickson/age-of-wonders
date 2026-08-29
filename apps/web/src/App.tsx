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

const TOP_NAVIGATION = [
  { label: "Systems", href: "/systems" },
  { label: "Worlds", href: "/worlds" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Sessions", href: "/sessions" },
] as const;

interface AiActivity {
  title: string;
  description: string;
}

function aiActivitiesFor(section: string | undefined, hasRecord: boolean) {
  const activities: Record<string, AiActivity[]> = {
    systems: [
      {
        title: "Adapt a ruleset",
        description:
          "Translate the system’s core rules into table-ready guidance and rulings.",
      },
      {
        title: "Draft content guidelines",
        description:
          "Define the tone, constraints, and balance targets for generated content.",
      },
      {
        title: "Check system coverage",
        description:
          "Identify missing mechanics, definitions, or play procedures.",
      },
    ],
    campaigns: [
      {
        title: hasRecord ? "Refine the foundation" : "Pitch a campaign",
        description: hasRecord
          ? "Strengthen the premise, introduction, placements, and discoveries without scripting play."
          : "Develop a campaign premise from a world, conflict, and desired atmosphere.",
      },
      {
        title: "Create a session brief",
        description:
          "Prepare objectives, likely scenes, key NPCs, and flexible complications.",
      },
      {
        title: "Surface open threads",
        description:
          "Summarize unresolved hooks and suggest meaningful ways to pay them off.",
      },
    ],
    sessions: [
      {
        title: "Prepare the next session",
        description:
          "Build a concise run sheet from the campaign’s current state.",
      },
      {
        title: "Recap recent play",
        description:
          "Turn session notes into a player-facing recap and GM follow-ups.",
      },
      {
        title: "Improvise an encounter",
        description:
          "Generate a situation that fits the active location and party goals.",
      },
    ],
    creatures: [
      {
        title: hasRecord ? "Deepen this creature" : "Invent a creature",
        description:
          "Develop memorable behavior, ecology, motivations, and encounter cues.",
      },
      {
        title: "Create encounter tactics",
        description:
          "Suggest terrain-aware tactics and escalation options for the table.",
      },
      {
        title: "Generate variants",
        description:
          "Adapt a creature for a different environment, role, or challenge level.",
      },
    ],
    items: [
      {
        title: hasRecord ? "Develop this item" : "Invent an item",
        description:
          "Create setting-specific equipment with table-ready mechanics and history.",
      },
      {
        title: "Balance item mechanics",
        description:
          "Review dice, actions, requirements, and rarity against the active rules.",
      },
      {
        title: "Create related items",
        description:
          "Build a family, upgrade path, or cultural variant grounded in the world.",
      },
    ],
    locations: [
      {
        title: hasRecord ? "Enrich this location" : "Outline a location",
        description:
          "Add sensory details, landmarks, inhabitants, secrets, and active tensions.",
      },
      {
        title: "Generate a map concept",
        description:
          "Describe a playable layout shaped by the location’s terrain and purpose.",
      },
      {
        title: "Seed local encounters",
        description:
          "Create situations grounded in this place and its current conflicts.",
      },
    ],
    worlds: [
      {
        title: hasRecord ? "Expand this world" : "Imagine a new world",
        description: hasRecord
          ? "Develop the selected place while preserving the world’s established facts."
          : "Turn a premise, mood, or conflict into a coherent setting.",
      },
      {
        title: "Create a child location",
        description:
          "Add a place that reinforces the parent location’s themes and conflicts.",
      },
      {
        title: "Draft a session-zero brief",
        description:
          "Summarize player-safe themes, expectations, and character prompts.",
      },
    ],
  };

  return activities[section ?? ""] ?? activities.worlds;
}

function NavigationIcon({
  item,
}: {
  item: "Definition" | "Locations" | "Creatures" | "Items";
}) {
  if (item === "Definition") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M6 3.5h9l3 3V20.5H6v-17Z" />
        <path d="M15 3.5v3h3M9 11h6M9 15h6" />
      </svg>
    );
  }

  if (item === "Locations") {
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

type EditorSection = "worlds" | "campaigns" | "sessions";
type EditorNavigationLabel = "Definition" | "Locations" | "Creatures" | "Items";

interface EditorLayoutRoute {
  section: EditorSection;
  title: string;
  activeNavigation: string;
  navigation: ReadonlyArray<{
    label: EditorNavigationLabel;
    href: string;
  }>;
}

function editorLayoutRouteFor(
  segments: string[],
): EditorLayoutRoute | undefined {
  const [section, encodedId, nestedSection] = segments;

  if (section === "campaigns" && encodedId && encodedId !== "new") {
    const campaignHref = `/campaigns/${encodeURIComponent(
      decodeURIComponent(encodedId),
    )}`;
    return {
      section,
      title: "Campaign studio",
      activeNavigation:
        nestedSection === "locations" ? "locations" : "definition",
      navigation: [
        { label: "Definition", href: campaignHref },
        { label: "Locations", href: `${campaignHref}/locations` },
      ],
    };
  }

  // List and other top-level routes stay full-width.
  if (section !== "worlds" || !encodedId) return undefined;

  const worldHref = `/worlds/${encodeURIComponent(
    decodeURIComponent(encodedId),
  )}`;
  return {
    section,
    title: "World studio",
    activeNavigation:
      nestedSection === "creatures" || nestedSection === "items"
        ? nestedSection
        : "locations",
    navigation: [
      { label: "Locations", href: worldHref },
      { label: "Creatures", href: `${worldHref}/creatures` },
      { label: "Items", href: `${worldHref}/items` },
    ],
  };
}

function AppShell({
  children,
  editorRoute,
}: {
  children: ReactNode;
  editorRoute?: EditorLayoutRoute;
}) {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const activeSection = segments[0];
  const nestedSection = activeSection === "worlds" ? segments[2] : undefined;
  const activitySection =
    nestedSection === "creatures" || nestedSection === "items"
      ? nestedSection
      : activeSection;
  const hasActivityRecord =
    nestedSection === "creatures" || nestedSection === "items"
      ? Boolean(segments[3] && segments[3] !== "new")
      : Boolean(segments[1]);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const activities = aiActivitiesFor(activitySection, hasActivityRecord);
  const activeTopSection =
    activeSection === "locations" ||
    activeSection === "creatures" ||
    activeSection === "items"
      ? "worlds"
      : (activeSection ?? "worlds");

  useEffect(() => {
    if (!aiDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAiDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [aiDrawerOpen]);

  return (
    <div className={editorRoute ? "drawer lg:drawer-open" : "min-h-screen"}>
      {editorRoute && (
        <input id="app-drawer" type="checkbox" className="drawer-toggle" />
      )}
      <div className={editorRoute ? "drawer-content min-w-0" : "min-w-0"}>
        <header className="navbar sticky top-0 z-30 min-h-16 border-b border-base-300 bg-base-200/95 px-3 backdrop-blur sm:px-5">
          {editorRoute && (
            <div className="navbar-start min-w-0 lg:hidden">
              <label
                htmlFor="app-drawer"
                aria-label="Open navigation"
                className="btn btn-square btn-ghost btn-sm"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </label>
            </div>
          )}
          <nav
            aria-label="Workspace navigation"
            className="navbar-center min-w-0 flex-1 justify-start overflow-x-auto lg:justify-center"
          >
            <div role="tablist" className="tabs tabs-border flex-nowrap">
              {TOP_NAVIGATION.map((item) => {
                const section = item.href.slice(1);
                const active = activeTopSection === section;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    role="tab"
                    aria-current={active ? "page" : undefined}
                    className={`tab h-16 whitespace-nowrap ${active ? "tab-active font-semibold" : ""}`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </nav>
          <div className="navbar-end ml-2 w-auto">
            <button
              type="button"
              className={`btn btn-sm gap-2 ${aiDrawerOpen ? "btn-primary" : "btn-ghost"}`}
              aria-controls="ai-activities-drawer"
              aria-expanded={aiDrawerOpen}
              onClick={() => setAiDrawerOpen((open) => !open)}
            >
              <span aria-hidden="true" className="text-base">
                ✦
              </span>
              <span className="hidden sm:inline">AI activities</span>
            </button>
          </div>
        </header>
        {children}
      </div>
      {editorRoute && (
        <div className="drawer-side z-40">
          <label
            htmlFor="app-drawer"
            aria-label="Close navigation"
            className="drawer-overlay"
          />
          <aside className="flex min-h-full w-72 flex-col border-r border-base-300 bg-base-200 p-4 text-base-content">
            <a
              href={`/${editorRoute.section}`}
              className="btn btn-ghost h-auto justify-start px-3 py-4 text-left"
            >
              <span>
                <span className="block text-xs font-semibold tracking-[0.22em] text-primary uppercase">
                  Age of Wonders
                </span>
                <span className="mt-1 block text-lg font-semibold">
                  {editorRoute.title}
                </span>
              </span>
            </a>
            <nav aria-label="Primary navigation" className="mt-8">
              <ul className="menu w-full gap-2 p-0">
                {editorRoute.navigation.map((item) => {
                  const section = item.label.toLowerCase();
                  const active = editorRoute.activeNavigation === section;
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={
                          active ? "menu-active font-semibold" : undefined
                        }
                      >
                        <NavigationIcon item={item.label} />
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        </div>
      )}

      {aiDrawerOpen && (
        <button
          type="button"
          aria-label="Close AI activities"
          className="fixed inset-0 z-40 cursor-default bg-black/35"
          onClick={() => setAiDrawerOpen(false)}
        />
      )}
      <aside
        id="ai-activities-drawer"
        aria-label="Recommended AI activities"
        aria-hidden={!aiDrawerOpen}
        inert={!aiDrawerOpen}
        className={`fixed top-0 right-0 z-50 flex h-dvh w-[min(24rem,calc(100vw-2rem))] flex-col border-l border-base-300 bg-base-200 shadow-2xl transition-transform duration-200 ease-out ${aiDrawerOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-base-300 p-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              AI assistant
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Recommended next steps
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-sm"
            aria-label="Close AI activities"
            onClick={() => setAiDrawerOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm leading-6 text-base-content/60">
            Suggestions are tailored to the section and record you are viewing.
          </p>
          <ol className="mt-6 grid gap-3">
            {activities.map((activity, index) => (
              <li
                key={activity.title}
                className="card border border-base-300 bg-base-100"
              >
                <div className="card-body gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="badge badge-primary badge-outline mt-0.5">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{activity.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-base-content/60">
                        {activity.description}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
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
  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
        <Header />
        <section className="py-12">
          <p className="text-sm text-amber-300">Play workspace</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight">
            Sessions
          </h1>
          <div className="card mt-10 border border-dashed border-base-300 bg-base-200/50">
            <div className="card-body items-center py-16 text-center">
              <span className="text-4xl text-primary" aria-hidden="true">
                ◷
              </span>
              <h2 className="mt-3 text-xl font-semibold">
                Session workspace is ready for its next chapter
              </h2>
              <p className="mt-2 max-w-lg leading-7 text-base-content/60">
                There is no persisted session resource yet. When session data is
                added to the domain model, preparation notes, recaps, and live
                play tools can live here.
              </p>
            </div>
          </div>
        </section>
      </div>
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
  return <LandingPage />;
}

export function App() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "session-canvas-lab") {
    return <SessionCanvasHarness />;
  }
  const editorRoute = editorLayoutRouteFor(segments);

  return (
    <AppShell editorRoute={editorRoute}>
      <AppContent />
    </AppShell>
  );
}
