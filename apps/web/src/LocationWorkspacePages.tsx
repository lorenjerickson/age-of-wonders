import { useEffect, useState, type ReactNode } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Field,
  Fieldset,
  Input,
  Select,
  Textarea,
} from "@aow/ui";
import type { JsonValue, WorldDraftRecord } from "./api";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import {
  recordName,
  recordPayload,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import { InternalLink } from "./navigation";
import { WorldLocationPlacements } from "./WorldAuthoringPages";
import { RecordThumbnail } from "./RecordArtwork";
import {
  locationHref,
  locationParentOptions,
  updateLocationFields,
  locationGmNotes,
} from "./locationWorkspaceModel";

export function LocationSectionPage({
  locationId,
  section,
}: {
  locationId: string;
  section:
    "description" | "discoveries" | "connections" | "creatures" | "items";
}) {
  const { draft } = useWorldAuthoring();
  const record = draft?.records.find(
    (record) =>
      record.resourceType === "locations" && record.sourceId === locationId,
  );
  if (!record)
    return (
      <main className="p-8">
        <Alert>
          This Location is unavailable. Choose a Location from the Atlas.
        </Alert>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">
        Location · {recordName(record, "Unnamed Location")}
      </p>
      <DraftRequired>
        {section === "description" ? (
          <LocationDescription key={locationId} record={record} />
        ) : section === "discoveries" ? (
          <LocationDiscoveries key={locationId} record={record} />
        ) : section === "connections" ? (
          <LocationConnections key={locationId} record={record} />
        ) : (
          <WorldLocationPlacements
            key={`${locationId}-${section}`}
            location={record}
            filter={section}
          />
        )}
      </DraftRequired>
    </main>
  );
}

function LocationForm({
  record,
  title,
  fields,
  children,
  valid = true,
}: {
  record: WorldDraftRecord;
  title: string;
  fields: Record<string, JsonValue>;
  children: ReactNode;
  valid?: boolean;
}) {
  const { saveRecord, canEdit, markDirty } = useWorldAuthoring();
  const [baseline, setBaseline] = useState(JSON.stringify(fields));
  const dirty = JSON.stringify(fields) !== baseline;
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving these Location changes?"),
    enableBeforeUnload: dirty,
  });
  return (
    <>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <form
        className="mt-8 space-y-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setBusy(true);
          setSaved(false);
          const success = await saveRecord(
            updateLocationFields(record, fields),
          );
          setBusy(false);
          if (success) {
            setBaseline(JSON.stringify(fields));
            setSaved(true);
          }
        }}
      >
        <Fieldset disabled={busy || !canEdit} className="space-y-6">
          {children}
          <Button
            type="submit"
            tone="primary"
            loading={busy}
            disabled={!dirty || !valid}
          >
            Save {title}
          </Button>
        </Fieldset>
        {saved && !dirty && (
          <Alert tone="success" aria-live="polite">
            {title} saved to the World draft.
          </Alert>
        )}
      </form>
    </>
  );
}
function LocationDescription({ record }: { record: WorldDraftRecord }) {
  const payload = recordPayload(record);
  const [name, setName] = useState(recordName(record, "Unnamed Location"));
  const [description, setDescription] = useState(
    String(payload.description ?? ""),
  );
  const [gmDescription, setGmDescription] = useState(locationGmNotes(record));
  const profile = (payload.profile ?? {}) as Record<string, JsonValue>;
  const [kind, setKind] = useState(String(payload.kind ?? "region"));
  const [summary, setSummary] = useState(String(profile.summary ?? ""));
  const [tags, setTags] = useState(
    Array.isArray(profile.tags)
      ? profile.tags.filter((tag) => typeof tag === "string").join(", ")
      : "",
  );
  const root =
    (payload.placement as { kind?: string } | undefined)?.kind === "root";
  return (
    <LocationForm
      record={record}
      title="Description"
      valid={!!name.trim() && !!kind.trim()}
      fields={{
        name: name.trim(),
        description,
        gmDescription,
        kind: kind.trim(),
        profile: {
          ...profile,
          summary,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      }}
    >
      <RecordThumbnail
        payload={payload}
        name={name}
        className="max-w-sm"
        onlyIfPresent
      />
      <Field label="Location name" required>
        <Input
          className="mt-2 w-full"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        label="Player-facing description"
        help="What the players can see and hear when they arrive."
      >
        <Textarea
          className="mt-2 w-full"
          rows={8}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field
        label="GM-facing description"
        help="Private notes and secrets for the GM."
      >
        <Textarea
          className="mt-2 w-full"
          rows={8}
          maxLength={20000}
          value={gmDescription}
          onChange={(event) => setGmDescription(event.target.value)}
        />
      </Field>
      <Field label="Location kind">
        <Input
          className="mt-2 w-full"
          required
          maxLength={120}
          disabled={root}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        />
      </Field>
      <Field label="Profile summary">
        <Textarea
          className="mt-2 w-full"
          rows={3}
          maxLength={2000}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </Field>
      <Field label="Tags" help="Separate tags with commas.">
        <Input
          className="mt-2 w-full"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </Field>
    </LocationForm>
  );
}
function LocationDiscoveries({ record }: { record: WorldDraftRecord }) {
  type Claim = {
    id: string;
    kind: string;
    statement: string;
    provenance?: string;
    [key: string]: JsonValue | undefined;
  };
  const { saveRecord, canEdit } = useWorldAuthoring();
  const value = recordPayload(record).discoveries;
  const claims = Array.isArray(value) ? (value as Claim[]) : [];
  const [editor, setEditor] = useState<Claim | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = editor !== null && JSON.stringify(editor) !== baseline;
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving this discovery?"),
    enableBeforeUnload: dirty,
  });
  function openEditor(claim?: Claim) {
    const next = claim
      ? { ...claim }
      : {
          id: crypto.randomUUID(),
          kind: "truth",
          statement: "",
        };
    setEditor(next);
    setEditingId(claim?.id ?? null);
    setBaseline(JSON.stringify(next));
    setMessage("");
  }
  async function persist(next: Claim[], successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      const success = await saveRecord(
        updateLocationFields(record, { discoveries: next as JsonValue }),
      );
      if (success) setMessage(successMessage);
      return success;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Discoveries</h1>
        <Button
          type="button"
          tone="primary"
          disabled={!canEdit || busy || editor !== null}
          onClick={() => openEditor()}
        >
          Add discovery
        </Button>
      </div>
      <p className="mt-6 text-base-content/65">
        Author truths, rumors, and beliefs the party may discover here. These
        remain GM-authored content until revealed during play.
      </p>
      {editor && (
        <form
          className="mt-6 rounded-box border border-base-300 bg-base-200 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !canEdit || !editor.statement.trim()) return;
            const next = editingId
              ? claims.map((claim) => (claim.id === editingId ? editor : claim))
              : [...claims, editor];
            if (
              await persist(
                next,
                editingId
                  ? "Discovery saved."
                  : "Discovery added to this Location.",
              )
            ) {
              setEditor(null);
              setEditingId(null);
            }
          }}
        >
          <Fieldset disabled={busy || !canEdit} className="space-y-4">
            <h2 className="text-lg font-semibold">
              {editingId ? "Edit discovery" : "New discovery"}
            </h2>
            <Field label="Discovery kind">
              <Select
                className="mt-2 w-full"
                value={editor.kind}
                onChange={(event) =>
                  setEditor({ ...editor, kind: event.target.value })
                }
              >
                <option value="truth">Truth</option>
                <option value="rumor">Rumor</option>
                <option value="belief">Belief</option>
              </Select>
            </Field>
            <Field label="Statement" required>
              <Textarea
                className="mt-2 w-full"
                required
                rows={4}
                value={editor.statement}
                onChange={(event) =>
                  setEditor({ ...editor, statement: event.target.value })
                }
              />
            </Field>
            <Field label="Source or provenance">
              <Input
                className="mt-2 w-full"
                value={editor.provenance ?? ""}
                onChange={(event) =>
                  setEditor({ ...editor, provenance: event.target.value })
                }
              />
            </Field>
            <div className="flex gap-3">
              <Button
                type="submit"
                tone="primary"
                loading={busy}
                disabled={!editor.statement.trim()}
              >
                Save discovery
              </Button>
              <Button
                type="button"
                tone="outline"
                onClick={() => {
                  setEditor(null);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </Fieldset>
        </form>
      )}
      {message && (
        <Alert className="mt-6" tone="success" aria-live="polite">
          {message}
        </Alert>
      )}
      <div className="mt-6 overflow-x-auto rounded-box border border-base-300">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Discoveries at this Location</caption>
          <thead className="bg-base-200">
            <tr>
              <th scope="col" className="px-4 py-3">
                Kind
              </th>
              <th scope="col" className="px-4 py-3">
                Statement
              </th>
              <th scope="col" className="px-4 py-3">
                Source or provenance
              </th>
              <th scope="col" className="px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.id} className="border-t border-base-300 align-top">
                <td className="px-4 py-3">
                  {{ truth: "Truth", rumor: "Rumor", belief: "Belief" }[
                    claim.kind
                  ] ?? "Discovery"}
                </td>
                <td className="px-4 py-3 whitespace-pre-wrap break-words">
                  {claim.statement}
                </td>
                <td className="px-4 py-3 whitespace-pre-wrap break-words">
                  {claim.provenance || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      tone="outline"
                      disabled={!canEdit || busy || editor !== null}
                      onClick={() => openEditor(claim)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      tone="outline"
                      disabled={!canEdit || busy || editor !== null}
                      onClick={() =>
                        void persist(
                          claims.filter((item) => item.id !== claim.id),
                          "Discovery removed.",
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!claims.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-base-content/65">
                  No discoveries have been authored here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LocationConnections({ record }: { record: WorldDraftRecord }) {
  const { definition, draft } = useWorldAuthoring();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const payload = recordPayload(record);
  const placement = (payload.placement ?? {}) as Record<string, JsonValue>;
  const root =
    draft?.content.rootLocationId === record.sourceId ||
    placement.kind === "root";
  const [parent, setParent] = useState(
    String(placement.parentLocationId ?? ""),
  );
  const records = draft?.records ?? [];
  const children = records.filter(
    (entry) =>
      entry.resourceType === "locations" &&
      (recordPayload(entry).placement as { parentLocationId?: string })
        ?.parentLocationId === record.sourceId,
  );
  const options = locationParentOptions(records, record.sourceId);
  const fields: Record<string, JsonValue> = root
    ? {}
    : {
        placement: (parent === placement.parentLocationId
          ? placement
          : { kind: "within-parent", parentLocationId: parent }) as JsonValue,
      };
  const createSearch = new URLSearchParams(suffix.replace(/^\?/, ""));
  createSearch.set("parentLocationId", record.sourceId);
  return (
    <LocationForm
      record={record}
      title="Connections"
      fields={fields}
      valid={root || options.some((option) => option.id === parent)}
    >
      <h2 className="text-xl font-semibold">Parent Location</h2>
      {root ? (
        <p className="text-base-content/65">
          This is the root Location of the World.
        </p>
      ) : (
        <>
          <Field label="Contained within">
            <Select
              className="mt-2 w-full"
              required
              value={parent}
              onChange={(event) => setParent(event.target.value)}
            >
              <option value="">Choose a parent Location</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          {parent && (
            <InternalLink
              className="link"
              href={`${locationHref(definition.id, parent)}${suffix}`}
            >
              Open{" "}
              {options.find((option) => option.id === parent)?.name ??
                "parent Location"}
            </InternalLink>
          )}
          <p className="text-sm text-base-content/60">
            Moving a Location clears its position and boundary on the old parent
            map.
          </p>
        </>
      )}
      <h2 className="text-xl font-semibold">Child Locations</h2>
      {children.length ? (
        <ul className="space-y-2">
          {children.map((child) => (
            <li key={child.sourceId}>
              <InternalLink
                className="block rounded-lg border border-base-300 p-4 hover:bg-base-200"
                href={`${locationHref(definition.id, child.sourceId)}${suffix}`}
              >
                {recordName(child, "Unnamed Location")}
              </InternalLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base-content/65">No child Locations yet.</p>
      )}
      <InternalLink
        className="btn btn-outline"
        href={`${locationHref(definition.id, "new")}?${createSearch}`}
      >
        Create child Location
      </InternalLink>
    </LocationForm>
  );
}
