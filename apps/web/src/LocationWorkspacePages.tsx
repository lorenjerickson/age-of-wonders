import { visibleRecordName } from "./recordDisplay";
import { protectedComparisonText } from "./protectedAuthoringText";
import { RuleTextField } from "./RuleValueFields";
import { WorldRecordRemoval } from "./WorldRecordRemoval";
import { useEffect, useState, type ReactNode } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Disclosure,
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
import { LocationCollectionPage } from "./LocationCollectionPages";
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
  section: "description" | "discoveries" | "hierarchy" | "creatures" | "items";
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
    <main className="mx-auto max-w-6xl p-4 lg:px-8 lg:py-7">
      <DraftRequired>
        {section === "description" ? (
          <LocationDescription key={locationId} record={record} />
        ) : section === "discoveries" ? (
          <LocationCollectionPage
            key={locationId}
            location={record}
            collection="discoveries"
          />
        ) : section === "hierarchy" ? (
          <LocationHierarchy key={locationId} record={record} />
        ) : (
          <LocationCollectionPage
            key={`${locationId}-${section}`}
            location={record}
            collection={section}
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
  const { definition, saveRecord, canEdit, markDirty } = useWorldAuthoring();
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
      <h2 className="mt-6 text-xl font-semibold">{title}</h2>
      <form
        className="mt-4 space-y-6 rounded-box border border-base-300 bg-base-200 p-5"
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
            Save changes
          </Button>
        </Fieldset>
        {saved && !dirty && (
          <Alert tone="success" aria-live="polite">
            {title} saved to the World draft.
          </Alert>
        )}
      </form>
      {title === "Overview" && (
        <WorldRecordRemoval
          record={record}
          path="atlas/locations"
          returnPath={`/worlds/${encodeURIComponent(definition.id)}/atlas`}
          disabled={dirty || busy}
        />
      )}
    </>
  );
}
function LocationDescription({ record }: { record: WorldDraftRecord }) {
  const payload = recordPayload(record);
  const { draft } = useWorldAuthoring();
  const ids = new Set(draft?.records.map((entry) => entry.sourceId) ?? []);
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
      title="Overview"
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
        name={protectedComparisonText(name, ids) ? "Location" : name}
        className="max-w-sm"
        onlyIfPresent
      />
      {protectedComparisonText(name, ids) ? (
        <RuleTextField
          label="Location name"
          value={name}
          recordIds={ids}
          onChange={setName}
        />
      ) : (
        <Field label="Location name" required>
          <Input
            className="mt-2 w-full"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      )}
      {protectedComparisonText(description, ids) ? (
        <RuleTextField
          label="Player-facing description"
          value={description}
          recordIds={ids}
          onChange={setDescription}
        />
      ) : (
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
      )}
      <Disclosure summary="Additional details">
        <div className="space-y-6">
          {protectedComparisonText(gmDescription, ids) ? (
            <RuleTextField
              label="GM-facing description"
              value={gmDescription}
              recordIds={ids}
              onChange={setGmDescription}
            />
          ) : (
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
          )}
          {protectedComparisonText(kind, ids) ? (
            root ? (
              <p>Existing Location kind preserved.</p>
            ) : (
              <RuleTextField
                label="Location kind"
                value={kind}
                recordIds={ids}
                onChange={setKind}
              />
            )
          ) : (
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
          )}
          {protectedComparisonText(summary, ids) ? (
            <RuleTextField
              label="Profile summary"
              value={summary}
              recordIds={ids}
              onChange={setSummary}
            />
          ) : (
            <Field label="Profile summary">
              <Textarea
                className="mt-2 w-full"
                rows={3}
                maxLength={2000}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>
          )}
          {protectedComparisonText(tags, ids) ? (
            <RuleTextField
              label="Tags"
              value={tags}
              recordIds={ids}
              onChange={setTags}
            />
          ) : (
            <Field label="Tags" help="Separate tags with commas.">
              <Input
                className="mt-2 w-full"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
          )}
        </div>
      </Disclosure>
    </LocationForm>
  );
}

function LocationHierarchy({ record }: { record: WorldDraftRecord }) {
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
  const ids = new Set(records.map((entry) => entry.sourceId));
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
      title="Location hierarchy"
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
                  {protectedComparisonText(option.name, ids)
                    ? "Location"
                    : option.name}
                </option>
              ))}
            </Select>
          </Field>
          {parent && (
            <InternalLink
              className="link"
              href={`${locationHref(definition.id, parent)}${suffix}`}
            >
              Open parent Location
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
                {visibleRecordName(child, "Unnamed Location", ids)}
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
