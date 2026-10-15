import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Select, TextInput } from "@aow/ui";
import type { PlayerDirectoryItem } from "@aow/common";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { InternalLink } from "./navigation";
import {
  getCurrentUser,
  listPlayers,
  type WorldDefinitionDraft,
  type WorldDefinitionDetail,
} from "./api";
import {
  worldAccessRequest,
  type WorldAccessEntry,
} from "./AstraSupportingApi";
import "./AstraSupporting.css";
import { astraRequest } from "./astraApi";

export function AstraSupporting({ view }: { view: string }) {
  return view === "account" ? (
    <AccountSettings />
  ) : view === "people" ? (
    <PeopleAccess />
  ) : view === "export" ? (
    <ExportWorld />
  ) : (
    <RuleSystem />
  );
}

function SupportingPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { definition } = useWorldAuthoring();
  return (
    <main className="astra-form-page">
      <InternalLink
        href={`/worlds/${encodeURIComponent(definition.id)}`}
        className="astra-back"
      >
        ← Back
      </InternalLink>
      <div className="astra-eyebrow">WORKSPACE / AUTHORING</div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function RuleSystem() {
  const { definition, draft, canEdit, saveDraft } = useWorldAuthoring();
  const [name, setName] = useState(
    String(draft?.content.ruleSystemName ?? `${definition.name} Rules`),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const models = draft?.effectiveModels;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !canEdit) return;
    setBusy(true);
    setNotice("");
    setError("");
    const saved = await saveDraft({
      ...draft,
      content: { ...draft.content, ruleSystemName: name.trim() },
    });
    setBusy(false);
    if (saved) setNotice("Rule system saved.");
    else
      setError(
        "Changes could not be saved. Reload if this world changed elsewhere.",
      );
  }
  return (
    <SupportingPage title="Rule system">
      <form
        className="astra-panel astra-form"
        onSubmit={(event) => void save(event)}
      >
        <p className="astra-muted">
          A shared language for every creature, character, and encounter in your
          world.
        </p>
        <TextInput
          label="Rule system name"
          value={name}
          required
          maxLength={120}
          disabled={!draft || !canEdit}
          onChange={(event) => setName(event.target.value)}
        />
        <section className="astra-supporting-options">
          <h2>World foundations</h2>
          <p className="astra-muted">
            The adopted world model supplies these values to your Codex.
          </p>
          {[
            ["Attributes", models?.attributes],
            ["Equipment slots", models?.equipmentSlots],
            ["Profession ranks", models?.professionRanks],
          ].map(([title, options]) => (
            <div key={String(title)} className="astra-supporting-summary">
              <strong>{String(title)}</strong>
              <p className="astra-muted">
                {Array.isArray(options) && options.length
                  ? options.map((option) => option.name).join(" · ")
                  : "No values adopted yet."}
              </p>
            </div>
          ))}
          {Boolean(models?.selectedReleaseNames?.length) && (
            <p className="astra-muted">
              Based on {models!.selectedReleaseNames!.join(", ")}.
            </p>
          )}
        </section>
        <div className="astra-supporting-summary">
          <h2>Rules</h2>
          <p className="astra-muted">
            Create and maintain the rules used by your world.
          </p>
          <InternalLink
            className="btn"
            href={`/worlds/${encodeURIComponent(definition.id)}?view=codex&kind=rules`}
          >
            Manage rules ↗
          </InternalLink>
        </div>
        {error && (
          <p role="alert" className="astra-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {(!draft || !canEdit) && (
          <p className="astra-muted">This world is currently read only.</p>
        )}
        <div className="astra-actions">
          <InternalLink
            className="btn"
            href={`/worlds/${encodeURIComponent(definition.id)}`}
          >
            Cancel
          </InternalLink>
          <Button
            tone="primary"
            type="submit"
            disabled={busy || !draft || !canEdit || !name.trim()}
          >
            Save changes
          </Button>
        </div>
      </form>
    </SupportingPage>
  );
}

function PeopleAccess() {
  const { definition } = useWorldAuthoring();
  const [entries, setEntries] = useState<WorldAccessEntry[]>([]);
  const [players, setPlayers] = useState<readonly PlayerDirectoryItem[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [role, setRole] = useState<WorldAccessEntry["role"]>("viewer");
  const [owner, setOwner] = useState("World owner");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string>();
  async function refresh() {
    const result = await worldAccessRequest<{ items: WorldAccessEntry[] }>(
      definition.id,
    );
    setEntries(result.items);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [access, user] = await Promise.all([
          worldAccessRequest<{ items: WorldAccessEntry[] }>(definition.id),
          getCurrentUser(),
        ]);
        const directory: PlayerDirectoryItem[] = [];
        let offset = 0;
        while (true) {
          const page = await listPlayers({ limit: 100, offset });
          directory.push(...page.items);
          offset += page.items.length;
          if (!page.items.length || offset >= page.total) break;
        }
        if (active) {
          setEntries(access.items);
          setOwner(user.user.displayName);
          setPlayers(directory);
          setLoaded(true);
        }
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "People could not be loaded. Refresh to try again.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [definition.id]);
  async function mutate(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await refresh();
      setNotice(success);
      setPlayerId("");
      setConfirmRemove(undefined);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Access could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const available = players.filter(
    (player) =>
      !entries.some((entry) => entry.playerId === player.playerId) &&
      player.standing === "active",
  );
  return (
    <SupportingPage title="People & access">
      <div className="astra-panel astra-form">
        <p className="astra-muted">
          Keep track of the people you want to bring into your world.
        </p>
        <p className="astra-supporting-note">
          Viewers can read this world. Editors can update its draft content.
          Only the owner can manage access, publish, archive, or fork the world.
        </p>
        <div className="astra-supporting-person">
          <span className="astra-avatar">{owner.slice(0, 1)}</span>
          <div>
            <strong>{owner}</strong>
            <small>World owner · Full access</small>
          </div>
        </div>
        {entries.map((entry) => {
          const name =
            players.find((player) => player.playerId === entry.playerId)
              ?.displayName ||
            entry.displayName ||
            "Player";
          return (
            <div className="astra-supporting-person" key={entry.id}>
              <span className="astra-avatar">{name.slice(0, 1)}</span>
              <div>
                <strong>{name}</strong>
                <small>
                  {entry.role === "editor" ? "Editor" : "Viewer"} access
                </small>
              </div>
              <div className="astra-supporting-person-actions">
                <Field label={`Role for ${name}`}>
                  <Select
                    value={entry.role}
                    disabled={busy}
                    onChange={(event) =>
                      void mutate(
                        () =>
                          worldAccessRequest(
                            definition.id,
                            "PUT",
                            {
                              role: event.target.value,
                              expectedRevision: entry.revision,
                            },
                            entry.id,
                          ),
                        "Role updated.",
                      )
                    }
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </Select>
                </Field>
                {confirmRemove === entry.id ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          () =>
                            worldAccessRequest(
                              definition.id,
                              "DELETE",
                              { expectedRevision: entry.revision },
                              entry.id,
                            ),
                          "Person removed.",
                        )
                      }
                    >
                      Confirm removal
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => setConfirmRemove(undefined)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    tone="ghost"
                    disabled={busy}
                    onClick={() => setConfirmRemove(entry.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {loaded && !entries.length && (
          <p className="astra-muted">No other people have been added.</p>
        )}
        <form
          className="astra-supporting-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (playerId)
              void mutate(
                () =>
                  worldAccessRequest(definition.id, "POST", { playerId, role }),
                "Person added.",
              );
          }}
        >
          <Field label="Person">
            <Select
              value={playerId}
              required
              disabled={busy || !available.length}
              onChange={(event) => setPlayerId(event.target.value)}
            >
              <option value="">Choose a player</option>
              {available.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.displayName || "Player"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select
              value={role}
              disabled={busy}
              onChange={(event) =>
                setRole(event.target.value as WorldAccessEntry["role"])
              }
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </Select>
          </Field>
          <Button type="submit" tone="primary" disabled={busy || !playerId}>
            Add person
          </Button>
        </form>
        {loaded && !available.length && (
          <p className="astra-muted">
            No additional players are available in your directory.
          </p>
        )}
        {!loaded && !error && <p role="status">Loading people…</p>}
        {error && (
          <div className="astra-error" role="alert">
            <p>{error}</p>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </SupportingPage>
  );
}

function ExportWorld() {
  const { definition, draft } = useWorldAuthoring();
  const [selection, setSelection] = useState(
    draft ? "draft" : (definition.currentRevisionId ?? ""),
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = definition.revisions.find((item) => item.id === selection);
  const available = selection === "draft" ? Boolean(draft) : Boolean(revision);
  async function download(event: FormEvent) {
    event.preventDefault();
    if (!available || busy) return;
    setNotice("");
    setError("");
    setBusy(true);
    try {
      const completeDraft =
        selection === "draft"
          ? await astraRequest<
              Pick<
                WorldDefinitionDraft,
                "revisionName" | "storageRevision" | "content" | "records"
              >
            >(`/worlds/${encodeURIComponent(definition.id)}/draft/export`)
          : undefined;
      const completeRevision =
        selection !== "draft"
          ? await astraRequest<WorldDefinitionDetail["revisions"][number]>(
              `/worlds/${encodeURIComponent(definition.id)}/revisions/${encodeURIComponent(selection)}`,
            )
          : undefined;
      const snapshot = completeRevision?.snapshots[0];
      if (!completeDraft && !snapshot)
        throw new Error("No published snapshot is available.");
      const name = String(completeDraft?.content.name ?? definition.name);
      const content = completeDraft
        ? { kind: "draft", ...completeDraft }
        : {
            kind: "published",
            revisionName: completeRevision!.name,
            revisionNumber: completeRevision!.revisionNumber,
            content: completeRevision!.content,
            manifest: snapshot!.manifest,
          };
      const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "astra-world-export",
              formatVersion: 1,
              exportedAt: new Date().toISOString(),
              world: { name, description: definition.description },
              ...content,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${
        name
          .replace(/[^a-zA-Z0-9-]+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "world"
      }-${selection === "draft" ? "draft" : `revision-${revision!.revisionNumber}`}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("World export downloaded.");
    } catch {
      setError("The export could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SupportingPage title="Export world">
      <form
        className="astra-panel astra-form"
        onSubmit={(event) => void download(event)}
      >
        <p className="astra-muted">
          Download your world’s authored content as a JSON file.
        </p>
        <Field label="Version to export">
          <Select
            disabled={busy}
            value={selection}
            onChange={(event) => {
              setSelection(event.target.value);
              setNotice("");
            }}
            required
          >
            {draft && <option value="draft">Current working draft</option>}
            {definition.revisions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || `Published revision ${item.revisionNumber}`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="astra-supporting-summary">
          <h2>Included in your export</h2>
          <p className="astra-muted">
            World details, locations, Codex entries, rules, and their authored
            references. Published versions include the selected captured
            content.
          </p>
          <p className="astra-muted">
            Linked media remains linked; image files are not bundled. Account
            credentials, private player contact details, and access assignments
            are not included.
          </p>
        </div>
        {!available && (
          <p className="astra-muted">
            There is no draft or published snapshot available to export.
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="astra-error">
            {error}
          </p>
        )}
        <div className="astra-actions">
          <InternalLink
            className="btn"
            href={`/worlds/${encodeURIComponent(definition.id)}`}
          >
            Cancel
          </InternalLink>
          <Button type="submit" tone="primary" disabled={!available || busy}>
            {busy ? "Preparing export…" : "Download world ↗"}
          </Button>
        </div>
      </form>
    </SupportingPage>
  );
}

function AccountSettings() {
  const { definition } = useWorldAuthoring();
  const [accountName, setAccountName] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    astraRequest<{ configured: boolean; accountName?: string }>(
      "/auth/credentials/me",
    )
      .then((status) => {
        if (active) {
          setConfigured(status.configured);
          setAccountName(status.accountName ?? "");
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Account settings could not be loaded. Refresh and try again.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !loaded) return;
    setError("");
    setNotice("");
    if (password !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await astraRequest<{
        configured: boolean;
        accountName: string;
      }>("/auth/credentials", {
        accountName,
        password,
        ...(configured ? { currentPassword } : {}),
      });
      setAccountName(result.accountName);
      setConfigured(result.configured);
      setPassword("");
      setConfirmation("");
      setCurrentPassword("");
      setNotice(
        configured
          ? "Account updated. Other sessions have been signed out."
          : "Password sign-in is ready. Use this account name next time you sign in.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Account settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SupportingPage title="Your account">
      <form
        className="astra-panel astra-form"
        onSubmit={(event) => void save(event)}
      >
        <p className="astra-muted">
          {configured
            ? "Update your account name and password."
            : "Create an account name and password for your existing identity."}
        </p>
        <TextInput
          label="Account name"
          autoComplete="username"
          required
          minLength={3}
          maxLength={64}
          pattern={"[A-Za-z0-9._\\-]{3,64}"}
          help="Use letters, numbers, dots, underscores, or hyphens."
          value={accountName}
          disabled={!loaded || busy}
          onChange={(event) => setAccountName(event.target.value)}
        />
        {configured && (
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            disabled={busy}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        )}
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          help="Use at least 12 characters."
          value={password}
          disabled={!loaded || busy}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={confirmation}
          disabled={!loaded || busy}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {!loaded && !error && <p role="status">Loading your account…</p>}
        {error && (
          <p role="alert" className="astra-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="astra-actions">
          <InternalLink
            className="btn"
            href={`/worlds/${encodeURIComponent(definition.id)}`}
          >
            Cancel
          </InternalLink>
          <Button type="submit" tone="primary" disabled={!loaded || busy}>
            {busy
              ? "Saving…"
              : configured
                ? "Save changes"
                : "Set up password sign-in"}
          </Button>
        </div>
      </form>
    </SupportingPage>
  );
}
