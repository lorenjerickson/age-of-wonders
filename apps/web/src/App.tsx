import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Label,
  StatusIndicator,
  StructuralCheckbox,
  Textarea,
  TextareaField,
} from "@aow/ui";
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
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";

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

function PrimaryNavigationLink({
  item,
  active,
  world,
  campaign,
}: {
  item: PrimaryNavigationLabel;
  active: boolean;
  world?: DomainRecord;
  campaign?: DomainRecord;
}) {
  const className = active ? "menu-active font-semibold" : undefined;
  const content = (
    <>
      <NavigationIcon item={item} />
      {item}
    </>
  );
  if (item === "Location") {
    if (campaign) {
      return (
        <Link
          to="/campaigns/$campaignId/locations"
          params={{ campaignId: campaign.id }}
          aria-current={active ? "page" : undefined}
          className={className}
        >
          {content}
        </Link>
      );
    }
    if (world) {
      return (
        <Link
          to="/worlds/$worldId"
          params={{ worldId: world.id }}
          aria-current={active ? "page" : undefined}
          className={className}
        >
          {content}
        </Link>
      );
    }
    return (
      <Link
        to="/worlds"
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  if (item === "Campaign") {
    return campaign ? (
      <Link
        to="/campaigns/$campaignId"
        params={{ campaignId: campaign.id }}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    ) : (
      <Link
        to="/campaigns"
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  if (item === "Sessions") {
    return (
      <Link
        to="/sessions"
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  if (item === "Creatures" && world) {
    return (
      <Link
        to="/worlds/$worldId/creatures"
        params={{ worldId: world.id }}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  if (item === "Items" && world) {
    return (
      <Link
        to="/worlds/$worldId/items"
        params={{ worldId: world.id }}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  return (
    <Link
      to={item === "Creatures" ? "/creatures" : "/items"}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {content}
    </Link>
  );
}

export function AppShell({
  children,
  initialWorld,
  initialCampaign,
}: {
  children: ReactNode;
  initialWorld?: DomainRecord;
  initialCampaign?: DomainRecord;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  const activeSection = segments[0];
  const nestedSection = activeSection === "worlds" ? segments[2] : undefined;
  const world = initialWorld;
  const campaign = initialCampaign;
  const locationWorkspaceActive =
    activeSection === "campaigns" && segments[2] === "locations";

  const primaryNavigation: ReadonlyArray<{
    label: PrimaryNavigationLabel;
    active: boolean;
  }> = [
    {
      label: "Location",
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
      active: activeSection === "campaigns" && segments[2] !== "locations",
    },
    {
      label: "Sessions",
      active: activeSection === "sessions",
    },
    {
      label: "Creatures",
      active:
        activeSection === "creatures" ||
        (activeSection === "worlds" && nestedSection === "creatures"),
    },
    {
      label: "Items",
      active:
        activeSection === "items" ||
        (activeSection === "worlds" && nestedSection === "items"),
    },
  ];

  return (
    <div className="drawer h-dvh overflow-hidden lg:drawer-open">
      <StructuralCheckbox id="app-drawer" />
      <div
        className={`drawer-content app-browse-frame h-dvh min-w-0 w-full ${locationWorkspaceActive ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        <Label
          htmlFor="app-drawer"
          aria-label="Open navigation"
          className="btn btn-square btn-ghost btn-sm fixed top-3 left-3 z-50 bg-base-200/75 shadow-lg backdrop-blur-xl lg:hidden"
        >
          <span aria-hidden="true">☰</span>
        </Label>
        {children}
      </div>
      <div className="drawer-side z-40">
        <Label
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
                  <PrimaryNavigationLink
                    item={item.label}
                    active={item.active}
                    world={world}
                    campaign={campaign}
                  />
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
            <RouterButtonLink
              href={href ?? "/"}
              tone="ghost"
              className="mt-7 w-fit px-0 text-primary"
            >
              Edit {isWorld ? "world" : "campaign"} <span aria-hidden>→</span>
            </RouterButtonLink>
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

export function LandingPage({
  initialHealthy,
  initialWorlds,
  initialCampaigns,
}: {
  initialHealthy?: boolean;
  initialWorlds?: DomainList;
  initialCampaigns?: DomainList;
} = {}) {
  const navigate = useInternalNavigate();
  const [healthy, setHealthy] = useState(initialHealthy ?? false);
  const [worlds, setWorlds] = useState<DomainList | undefined>(initialWorlds);
  const [campaigns, setCampaigns] = useState<DomainList | undefined>(
    initialCampaigns,
  );
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialHealthy === undefined) {
      void checkHealth().then(
        () => setHealthy(true),
        () => setHealthy(false),
      );
    }
    if (!initialWorlds) {
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
    }
    if (!initialCampaigns) {
      void listDomainRecords("campaigns", {
        limit: 1,
        sort: "updatedAt",
        order: "desc",
      }).then(setCampaigns, (caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load campaigns",
        ),
      );
    }
  }, [initialCampaigns, initialHealthy, initialWorlds]);

  async function createWorld(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await createWorldWithAi(prompt);
      await navigate(`/worlds/${encodeURIComponent(result.world.id)}`);
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
              <TextareaField
                id="world-prompt"
                label="Create a new world with AI"
                help="Describe the mood, premise, people, or conflict you want to explore."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A rain-soaked empire built inside the skeleton of a sleeping god…"
                rows={4}
                resize="none"
                className="text-base"
              />
              <Button
                type="submit"
                tone="primary"
                disabled={loading || prompt.trim().length < 3}
                loading={loading}
                className="mt-4"
              >
                Create world
              </Button>
            </div>
          </form>
        </section>

        {error && (
          <Alert tone="error" className="mb-6">
            {error}
          </Alert>
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
          {(worlds?.total ?? 0) > 1 && (
            <InternalLink href="/worlds">View all worlds →</InternalLink>
          )}
          {(campaigns?.total ?? 0) > 1 && (
            <InternalLink href="/campaigns">View all campaigns →</InternalLink>
          )}
        </nav>
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

export function SessionsPage({
  initialSessions,
  initialCampaign,
}: {
  initialSessions?: DomainRecord[];
  initialCampaign?: DomainRecord;
} = {}) {
  const [sessions, setSessions] = useState<DomainRecord[]>(
    initialSessions ?? [],
  );
  const [campaign, setCampaign] = useState<DomainRecord | undefined>(
    initialCampaign,
  );
  const [loading, setLoading] = useState(initialSessions === undefined);

  useEffect(() => {
    if (initialSessions) return;
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
  }, [initialSessions]);

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
          <RouterButtonLink href={workspaceHref} tone="primary">
            Open location workspace
          </RouterButtonLink>
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
                  <Badge outline className="capitalize">
                    {typeof session.data.status === "string"
                      ? session.data.status.replaceAll("-", " ")
                      : "Recorded"}
                  </Badge>
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
