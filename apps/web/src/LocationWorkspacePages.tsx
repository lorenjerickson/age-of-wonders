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
  const [claims, setClaims] = useState<Claim[]>(() => {
    const value = recordPayload(record).discoveries;
    return Array.isArray(value) ? (value as Claim[]) : [];
  });
  function update(index: number, field: string, value: string) {
    setClaims((current) =>
      current.map((claim, i) =>
        i === index ? { ...claim, [field]: value } : claim,
      ),
    );
  }
  return (
    <LocationForm
      record={record}
      title="Discoveries"
      valid={claims.every((claim) => claim.statement.trim())}
      fields={{ discoveries: claims as JsonValue }}
    >
      <p className="text-base-content/65">
        Author truths, rumors, and beliefs the party may discover here. These
        remain GM-authored content until revealed during play.
      </p>
      {!claims.length && (
        <Alert>No discoveries have been authored here yet.</Alert>
      )}
      {claims.map((claim, index) => (
        <section
          key={claim.id}
          className="space-y-4 rounded-box border border-base-300 bg-base-200 p-5"
        >
          <Field label="Discovery kind">
            <Select
              className="mt-2 w-full"
              value={claim.kind}
              onChange={(event) => update(index, "kind", event.target.value)}
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
              value={claim.statement}
              onChange={(event) =>
                update(index, "statement", event.target.value)
              }
            />
          </Field>
          <Field label="Source or provenance">
            <Input
              className="mt-2 w-full"
              value={claim.provenance ?? ""}
              onChange={(event) =>
                update(index, "provenance", event.target.value)
              }
            />
          </Field>
          <Button
            type="button"
            tone="outline"
            onClick={() =>
              setClaims((current) => current.filter((_, i) => i !== index))
            }
          >
            Remove discovery
          </Button>
        </section>
      ))}
      <Button
        type="button"
        tone="outline"
        onClick={() =>
          setClaims((current) => [
            ...current,
            { id: crypto.randomUUID(), kind: "truth", statement: "" },
          ])
        }
      >
        Add discovery
      </Button>
    </LocationForm>
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
