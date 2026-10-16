import { worldNavigationCounts } from "./gmNavigationModel";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useLocation, useBlocker } from "@tanstack/react-router";
import { Button, TextInput, Textarea, Field } from "@aow/ui";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { InternalLink, useInternalNavigate } from "./navigation";
import {
  startWorldDefinitionDraft,
  getEffectiveWorldModels,
  listWorldDefinitions,
  getCurrentUser,
  logout,
  type WorldDefinitionSummary,
} from "./api";
import {
  recordName,
  recordPayload,
  recordsForLibrary,
  projectEffectiveModels,
} from "./worldAuthoringModel";
import { AstraAtlas } from "./AstraAtlas";
import { AstraCodex } from "./AstraCodex";
import { AstraSupporting } from "./AstraSupporting";
import "./Astra.css";
export function AstraFooter() {
  return (
    <footer className="astra-footer">
      <span>Made for the stories only you can tell.</span>
      <span>ASTRA / WORLD BUILDER</span>
    </footer>
  );
}
export function AstraFrame({
  children,
  name = "Your worlds",
  ruleName = "World builder",
  base = "/worlds",
  counts = { locations: 0, codex: 0 },
  view = "overview",
  title = "World overview",
}: {
  children: ReactNode;
  name?: string;
  ruleName?: string;
  base?: string;
  counts?: { locations: number; codex: number };
  view?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("GM");
  const navigate = useInternalNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.searchStr);
  const worldPath = location.pathname
    .slice(base.length)
    .split("/")
    .filter(Boolean);
  const optionKind =
    worldPath[0] === "characters" &&
    ["professions", "skills", "backgrounds"].includes(worldPath[1])
      ? worldPath[1]
      : undefined;
  const activeView =
    worldPath[0] === "rules" ||
    (worldPath[0] === "characters" && worldPath.length > 1 && !optionKind)
      ? "rules"
      : worldPath[0] === "atlas"
        ? "atlas"
        : worldPath[0] === "bestiary"
          ? "bestiary"
          : worldPath[0] === "characters" && worldPath.length === 1
            ? "characters"
            : worldPath[0] === "item-compendium"
              ? "items"
              : optionKind
                ? "codex"
                : worldPath[0] === "versions"
                  ? "overview"
                  : view;
  const activeKind =
    optionKind ??
    (worldPath[0] === "item-compendium"
      ? "items"
      : (query.get("kind") ?? "items"));
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    void getCurrentUser()
      .then((r) => setUser(r.user.displayName))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.href]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    sidebar.current?.querySelector<HTMLElement>("button,a")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          sidebar.current?.querySelectorAll<HTMLElement>("a,button") ?? [],
        ).filter((n) => n.offsetParent !== null);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  return (
    <div className="astra-shell">
      <aside
        ref={sidebar}
        className="astra-sidebar"
        data-open={open}
        aria-label="Workspace navigation"
      >
        <Button className="astra-mobile-close" onClick={() => setOpen(false)}>
          Close menu
        </Button>
        <InternalLink href="/" className="astra-brand">
          <span>✧</span>ASTRA
        </InternalLink>
        <div className="astra-tagline">THE WORLD IS YOURS</div>
        <InternalLink className="astra-world-picker" href="/worlds">
          <span style={{ fontSize: 22 }}>◈</span>
          <span>
            <strong>{name}</strong>
            <small>{ruleName}</small>
          </span>
          <span style={{ marginLeft: "auto" }}>⌄</span>
        </InternalLink>
        {base !== "/worlds" && (
          <>
            <div className="astra-nav-label">WORKSPACE</div>
            <nav aria-label="World navigation">
              {[
                ["atlas", "⌖", "Atlas"],
                ["bestiary", "♧", "Bestiary"],
                ["characters", "♙", "Characters"],
                ["codex", "▤", "Codex"],
                ["items", "◇", "Items"],
                ["overview", "◈", "Overview"],
                ["rules", "⚙", "Rules"],
              ].map(([key, icon, label]) => (
                <div key={key}>
                  <InternalLink
                    href={
                      key === "rules" ? `${base}/rules` : `${base}?view=${key}`
                    }
                    className={activeView === key ? "active" : ""}
                    aria-current={
                      activeView === key && key !== "codex" ? "page" : undefined
                    }
                  >
                    <span className="astra-nav-icon">{icon}</span>
                    {label}
                    {(key === "atlas" || key === "codex") && (
                      <span className="astra-nav-count">
                        {key === "atlas" ? counts.locations : counts.codex}
                      </span>
                    )}
                  </InternalLink>
                  {key === "codex" && (
                    <nav
                      className="astra-codex-navigation"
                      aria-label="Codex navigation"
                    >
                      {[
                        ["backgrounds", "Backgrounds"],
                        ["conditions", "Conditions"],
                        ["effects", "Effects"],
                        ["professions", "Professions"],
                        ["skills", "Skills"],
                      ].map(([kind, title]) => (
                        <InternalLink
                          key={kind}
                          href={
                            ["professions", "skills", "backgrounds"].includes(
                              kind,
                            )
                              ? `${base}/characters/${kind}`
                              : `${base}?view=codex&kind=${kind}`
                          }
                          className={
                            activeView === "codex" && activeKind === kind
                              ? "active"
                              : ""
                          }
                          aria-current={
                            activeView === "codex" && activeKind === kind
                              ? "page"
                              : undefined
                          }
                        >
                          {title}
                        </InternalLink>
                      ))}
                    </nav>
                  )}
                </div>
              ))}
            </nav>
          </>
        )}
        <div className="astra-sidebar-bottom">
          {base !== "/worlds" && (
            <nav>
              <InternalLink href={`${base}?view=export`}>
                <span className="astra-nav-icon">↗</span>Export world
              </InternalLink>
              <InternalLink href={`${base}?view=people`}>
                <span className="astra-nav-icon">♙</span>People &amp; access
              </InternalLink>
            </nav>
          )}
          <div className="astra-account">
            <span className="astra-avatar">{user.slice(0, 1)}</span>
            <span>
              {base === "/worlds" ? (
                <strong>{user}</strong>
              ) : (
                <InternalLink href={`${base}?view=account`}>
                  <strong>{user}</strong>
                </InternalLink>
              )}
              <small>Game master</small>
            </span>
            <Button
              tone="ghost"
              aria-label="Sign out"
              style={{ marginLeft: "auto", padding: 6 }}
              onClick={() => void logout().then(() => navigate("/login"))}
            >
              ⇥
            </Button>
          </div>
        </div>
      </aside>
      <div className="astra-main" inert={open ? true : undefined}>
        <header className="astra-topbar">
          <Button
            ref={menuButton}
            className="astra-mobile-menu"
            aria-expanded={open}
            aria-label="Open navigation menu"
            onClick={() => setOpen(true)}
          >
            ☰
          </Button>
          <span>
            Workspace <span style={{ margin: "0 14px" }}>/</span>{" "}
            <strong>{title}</strong>
          </span>
          <span className="astra-mode">
            ✦ Authoring mode <b>GM WORKSPACE</b>
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
export function AstraWorldWorkspace() {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const canStart = canEdit && definition.accessRole !== "editor";
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  async function startEditing() {
    if (!definition.currentRevisionId) return;
    setStarting(true);
    setStartError("");
    try {
      const next = await startWorldDefinitionDraft(
        definition.id,
        definition.currentRevisionId,
      );
      adoptDraft(next);
      const models = await getEffectiveWorldModels(definition.id);
      adoptDraft({ ...next, effectiveModels: projectEffectiveModels(models) });
    } catch (e) {
      setStartError(
        e instanceof Error ? e.message : "Could not start editing.",
      );
    } finally {
      setStarting(false);
    }
  }
  const location = useLocation();
  const params = new URLSearchParams(location.searchStr);
  const suffix = location.pathname.split("/").slice(3).join("/");
  const view =
    params.get("view") ||
    (suffix.startsWith("atlas")
      ? "atlas"
      : suffix.startsWith("bestiary")
        ? "bestiary"
        : suffix.startsWith("item-compendium") ||
            suffix.startsWith("characters") ||
            suffix.startsWith("rules")
          ? "codex"
          : "overview");
  const records = draft?.records ?? [];
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const counts = worldNavigationCounts(records);
  const name = String(draft?.content.name ?? definition.name);
  return (
    <AstraFrame
      name={name}
      ruleName={String(draft?.content.ruleSystemName ?? `${name} Rules`)}
      base={base}
      counts={counts}
      view={view}
      title={
        view === "atlas"
          ? "World atlas"
          : view === "items"
            ? "Items"
            : view === "bestiary"
              ? "Bestiary"
              : view === "characters"
                ? "Characters"
                : view === "codex"
                  ? "World codex"
                  : view === "system"
                    ? "Rule system"
                    : view === "people"
                      ? "People & access"
                      : view === "export"
                        ? "Export world"
                        : view === "account"
                          ? "Account"
                          : params.get("edit")
                            ? "Edit world"
                            : "World overview"
      }
    >
      {!draft && !["account", "people", "export"].includes(view) ? (
        <main className="astra-page">
          <div className="astra-eyebrow">YOUR WORLD, AT A GLANCE</div>
          <h1>{name}</h1>
          <p className="astra-muted">{definition.description}</p>
          <section className="astra-panel astra-empty">
            <h3>No working draft is open.</h3>
            <p>
              {canStart
                ? "Open a working copy of your published World to continue authoring."
                : "The world owner has not opened a working draft yet."}
            </p>
            {canStart && definition.currentRevisionId && (
              <Button
                tone="primary"
                onClick={() => void startEditing()}
                disabled={starting}
              >
                {starting ? "Opening…" : "Start editing"}
              </Button>
            )}
            {startError && (
              <p className="astra-error" role="alert">
                {startError}
              </p>
            )}
          </section>
          <AstraFooter />
        </main>
      ) : view === "atlas" ? (
        <AstraAtlas />
      ) : ["codex", "bestiary", "characters", "items"].includes(view) ? (
        <AstraCodex key={view} />
      ) : ["system", "people", "export", "account"].includes(view) ? (
        <AstraSupporting view={view} />
      ) : (
        <AstraOverview />
      )}
    </AstraFrame>
  );
}
function AstraOverview() {
  const { definition, draft, saveDraft, canEdit } = useWorldAuthoring();
  const loc = useLocation();
  const navigate = useInternalNavigate();
  const base = `/worlds/${encodeURIComponent(definition.id)}`;
  const name = String(draft?.content.name ?? definition.name);
  const description = String(
    draft?.content.description ?? definition.description ?? "",
  );
  const [newName, setName] = useState(name);
  const [newDescription, setDescription] = useState(description);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = new URLSearchParams(loc.searchStr).has("edit");
  const mayLeave = useRef(false);
  const dirty = editing && (newName !== name || newDescription !== description);
  useBlocker({
    shouldBlockFn: () =>
      !mayLeave.current &&
      (busy ||
        (dirty && !window.confirm("Leave without saving your changes?"))),
    enableBeforeUnload: !mayLeave.current && (dirty || busy),
  });
  const records = draft?.records ?? [];
  const locations = records.filter((r) => r.resourceType === "locations");
  const counts = [
    locations.length,
    recordsForLibrary(records, "items").length,
    recordsForLibrary(records, "creatures").length,
    records.filter((r) => r.resourceType === "world-character-templates")
      .length,
  ];
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !canEdit || busy) return;
    setBusy(true);
    const ok = await saveDraft({
      ...draft,
      content: { ...draft.content, name: newName, description: newDescription },
    });
    setBusy(false);
    if (ok) {
      mayLeave.current = true;
      void navigate(base);
    } else
      setError(
        "The World could not be saved. Refresh if another editor changed it.",
      );
  }
  if (editing)
    return (
      <main className="astra-form-page">
        <InternalLink href={base} className="astra-back">
          ← Back
        </InternalLink>
        <div className="astra-eyebrow">WORKSPACE / AUTHORING</div>
        <h1>Edit world</h1>
        <form className="astra-panel astra-form" onSubmit={save}>
          <p className="astra-muted">
            Your world is a home for locations, a Codex, and a shared rule
            system.
          </p>
          <TextInput
            label="World name"
            required
            value={newName}
            onChange={(e) => setName(e.target.value)}
          />
          <Field label="A few words about your world">
            <Textarea
              value={newDescription}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="astra-error">
              {error}
            </p>
          )}
          <div className="astra-actions">
            <InternalLink href={base} className="btn">
              Cancel
            </InternalLink>
            <Button
              tone="primary"
              disabled={busy || !draft || !canEdit}
              type="submit"
            >
              Save changes
            </Button>
          </div>
        </form>
      </main>
    );
  return (
    <main className="astra-page">
      <div className="astra-heading">
        <div>
          <div className="astra-eyebrow">YOUR WORLD, AT A GLANCE</div>
          <h1>{name}</h1>
        </div>
        {canEdit && (
          <div className="astra-actions">
            <InternalLink className="btn" href={`${base}?edit=1`}>
              Edit world
            </InternalLink>
            <InternalLink
              className="btn btn-primary"
              href={`${base}?view=atlas&entry=new`}
            >
              ＋ Add location
            </InternalLink>
          </div>
        )}
      </div>
      <p className="astra-muted">{description}</p>
      <InternalLink className="btn" href={`${base}/versions`}>
        Versions
      </InternalLink>
      <section className="astra-hero">
        <img
          className="astra-hero-art"
          src="/astra/world-landscape.svg"
          alt=""
        />
        <div className="astra-hero-content">
          <div className="astra-eyebrow">THE GAME MASTER’S WORKSPACE</div>
          <h2>A world of possibility.</h2>
          <p>
            Weave the places, people, and little secrets that turn a setting
            into a story.
          </p>
          <InternalLink className="btn btn-primary" href={`${base}?view=atlas`}>
            Explore your world ↗
          </InternalLink>
        </div>
        <span className="astra-hero-caption">
          EVERY DETAIL IS A STORY WAITING TO HAPPEN
        </span>
      </section>
      <div className="astra-stats">
        {["Locations", "Items", "Creatures", "Characters"].map((label, i) => (
          <InternalLink
            key={label}
            href={`${base}?view=${i === 0 ? "atlas" : i === 2 ? "bestiary" : i === 3 ? "characters" : "items"}`}
            className="astra-panel astra-stat"
          >
            <strong>{String(counts[i]).padStart(2, "0")}</strong>
            <span>{label}</span>
            <i>{["⌖", "◇", "♧", "♙"][i]}</i>
          </InternalLink>
        ))}
      </div>
      <div className="astra-overview-columns">
        <section>
          <div className="astra-section-heading">
            <h2>Your world atlas</h2>
            <InternalLink href={`${base}?view=atlas`}>
              All locations ↗
            </InternalLink>
          </div>
          <div className="astra-panel">
            {locations.length ? (
              locations
                .slice(-4)
                .reverse()
                .map((r) => (
                  <InternalLink
                    className="astra-list-row"
                    key={r.sourceId}
                    href={`${base}?view=atlas&entry=${encodeURIComponent(r.sourceId)}`}
                  >
                    <span className="astra-card-icon">⌖</span>
                    <span>
                      <strong>{recordName(r, "Unnamed location")}</strong>
                      <small>
                        {(() => {
                          const placement = recordPayload(r).placement as
                            { parentLocationId?: string } | undefined;
                          const parent = locations.find(
                            (p) => p.sourceId === placement?.parentLocationId,
                          );
                          return parent
                            ? recordName(parent, "World location")
                            : "World location";
                        })()}
                        {recordPayload(r).image ? " · Map attached" : ""}
                      </small>
                    </span>
                    <span style={{ marginLeft: "auto" }}>↗</span>
                  </InternalLink>
                ))
            ) : (
              <div className="astra-list-row">
                Add your first location to begin.
              </div>
            )}
          </div>
        </section>
        <section>
          <div className="astra-section-heading">
            <h2>The foundations</h2>
            <span className="astra-eyebrow" style={{ fontSize: 8 }}>
              WORLD SETUP
            </span>
          </div>
          <div className="astra-panel">
            {[
              ["Game master", "Your seat at the head of the table", "people"],
              [
                String(draft?.content.ruleSystemName ?? `${name} Rules`),
                "A shared language for every creature",
                "system",
              ],
              [
                "A place to begin",
                locations.length
                  ? "Your first map is ready"
                  : "Add your first location",
                "atlas",
              ],
            ].map(([title, text, view]) => (
              <InternalLink
                className="astra-list-row"
                href={`${base}?view=${view}`}
                key={view}
              >
                <span className="astra-card-icon">✓</span>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
                <span style={{ marginLeft: "auto" }}>›</span>
              </InternalLink>
            ))}
          </div>
          <div className="astra-panel astra-wisdom">
            <div className="astra-eyebrow" style={{ fontSize: 9 }}>
              ✧ A LITTLE GM WISDOM
            </div>
            <p className="astra-muted" style={{ marginTop: 12, fontSize: 11 }}>
              You don’t need to build everything at once. Start with one place,
              one interesting person, and one secret.
            </p>
          </div>
        </section>
      </div>
      <AstraFooter />
    </main>
  );
}
export function AstraWorldLibrary() {
  const [worlds, setWorlds] = useState<WorldDefinitionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    listWorldDefinitions()
      .then((r) => {
        setWorlds(r.items.filter((w) => w.status.toLowerCase() !== "archived"));
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <AstraFrame title="Your worlds">
      <main className="astra-page">
        <div className="astra-heading">
          <div>
            <div className="astra-eyebrow">THE GAME MASTER’S WORKSPACE</div>
            <h1>Your worlds.</h1>
            <p>Choose a world to continue its story.</p>
          </div>
          <InternalLink className="btn btn-primary min-h-11" href="/worlds/new">
            ＋ Create world
          </InternalLink>
        </div>
        {error && (
          <p role="alert" className="astra-error">
            {error}
          </p>
        )}
        <div className="astra-grid">
          {worlds.map((w) => (
            <InternalLink
              key={w.id}
              href={`/worlds/${encodeURIComponent(w.id)}`}
              className="astra-panel astra-card"
            >
              <div className="astra-card-body">
                <span className="astra-card-icon">◈</span>
                <h3>{w.name}</h3>
                <p>{w.description || "A world of possibility."}</p>
              </div>
            </InternalLink>
          ))}
        </div>
        {loaded && !worlds.length && (
          <div className="astra-empty astra-panel">
            <h3>Your next story starts here.</h3>
            <p>Create a world to begin.</p>
          </div>
        )}
        <AstraFooter />
      </main>
    </AstraFrame>
  );
}
