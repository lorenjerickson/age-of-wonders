import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { RuleTextField } from "./RuleValueFields";
import { useEffect, useState } from "react";
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
import {
  ApiRequestError,
  saveWorldDefinitionDraft,
  saveWorldLocation,
  type JsonValue,
  type WorldDraftRecord,
  type WorldDefinitionDraft,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { InternalLink } from "./navigation";
import {
  draftWithIndexedRecord,
  draftWithoutWorldPlacement,
  recordName,
  recordsForLibrary,
  recordPayload,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import { locationHref, locationClaims } from "./locationWorkspaceModel";

type Collection = "discoveries" | "creatures" | "items";
type ObjectValue = Record<string, JsonValue>;
function object(value: unknown): value is ObjectValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function LocationTextField({
  label,
  value,
  onChange,
  ids,
  multiline = false,
}: {
  label: string;
  value: JsonValue | undefined;
  onChange: (value: string) => void;
  ids: ReadonlySet<string>;
  multiline?: boolean;
}) {
  if (
    protectedComparisonText(value, ids) ||
    (value !== undefined && typeof value !== "string")
  )
    return (
      <RuleTextField
        label={label}
        value={value as string | undefined}
        recordIds={ids}
        onChange={onChange}
      />
    );
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea
          className="min-h-11"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          className="min-h-11"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
export function LocationCollectionRoute({
  locationId,
  collection,
  entryId,
}: {
  locationId: string;
  collection: Collection;
  entryId: string;
}) {
  const { draft } = useWorldAuthoring();
  const matches =
    draft?.records.filter(
      (r) => r.resourceType === "locations" && r.sourceId === locationId,
    ) ?? [];
  return matches.length === 1 ? (
    <main className="mx-auto max-w-4xl p-4">
      <LocationCollectionPage
        location={matches[0]!}
        collection={collection}
        entryId={entryId}
      />
    </main>
  ) : (
    <Alert>Location unavailable or ambiguous. Return to the Atlas.</Alert>
  );
}
export function LocationCollectionPage({
  location,
  collection,
  entryId,
}: {
  location: WorldDraftRecord;
  collection: Collection;
  entryId?: string;
}) {
  const { definition, draft, canEdit, adoptDraft, markDirty } =
    useWorldAuthoring();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const base = `${locationHref(definition.id, location.sourceId)}/${collection}`;
  const [pinned] = useState(draft);
  const claims = locationClaims(location);
  const records = draft?.records ?? [];
  const placements = records.filter(
    (r) =>
      r.resourceType === "world-placements" &&
      recordPayload(r).locationId === location.sourceId &&
      object(recordPayload(r).source) &&
      (collection === "items"
        ? (recordPayload(r).source as ObjectValue).kind === "world-item"
        : ["world-creature", "world-character"].includes(
            String((recordPayload(r).source as ObjectValue).kind),
          )),
  );
  const entries =
    collection === "discoveries"
      ? (claims ?? []).map((c) => ({ id: String(c.id), payload: c }))
      : placements.map((r) => ({
          id: r.sourceId,
          payload: recordPayload(r) as ObjectValue,
        }));
  const ids = new Set([
    ...records.map((r) => r.sourceId),
    ...(claims ?? []).map((c) => String(c.id)),
  ]);
  const labelFor = (text: unknown, fallback: string) =>
    typeof text === "string" &&
    text.trim() &&
    !protectedComparisonText(text, ids)
      ? text
      : fallback;
  const matches = entryId?.startsWith("entry-")
    ? entries.filter((e) => e.id === entryId.slice(6))
    : [];
  const existing = matches.length === 1 ? matches[0] : undefined;
  const creating = entryId === "new";
  const [value, setValue] = useState<ObjectValue>(
    () =>
      existing?.payload ??
      (collection === "discoveries"
        ? { id: crypto.randomUUID(), kind: "truth", statement: "" }
        : {
            id: `world-placement:${crypto.randomUUID()}`,
            locationId: location.sourceId,
            name: "",
            source: {
              kind: collection === "items" ? "world-item" : "world-creature",
            },
          }),
  );
  const [baseline, setBaseline] = useState(JSON.stringify(value));
  const [numbersDirty, setNumbersDirty] = useState(false);
  const dirty = baseline !== JSON.stringify(value) || numbersDirty;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [currentPinned, setCurrentPinned] = useState(pinned);
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving these changes?"),
    enableBeforeUnload: dirty,
  });
  const field = (key: string, text: string) =>
    setValue((v) => ({ ...v, [key]: text }));
  const sources = [
    ...recordsForLibrary(
      records,
      collection === "items" ? "items" : "creatures",
    ),
    ...(collection === "items"
      ? []
      : records.filter((r) => r.resourceType === "world-character-templates")),
  ];
  const source = object(value.source) ? value.source : {};
  const sourceKey =
    collection === "items"
      ? "itemDefinitionId"
      : source.kind === "world-character"
        ? "characterTemplateId"
        : "creatureId";
  const sourceId =
    typeof source[sourceKey] === "string" ? source[sourceKey] : "";
  const position = object(value.mapPosition) ? value.mapPosition : {};
  const [x, setX] = useState(String(position.x ?? ""));
  const [y, setY] = useState(String(position.y ?? ""));
  const [scale, setScale] = useState(String(value.scale ?? ""));
  const positionValid =
    (!x && !y) ||
    (!!x &&
      !!y &&
      Number.isFinite(Number(x)) &&
      Number.isFinite(Number(y)) &&
      Number(x) >= 0 &&
      Number(x) <= 1 &&
      Number(y) >= 0 &&
      Number(y) <= 1);
  const scaleValid =
    scale === "" || (Number.isFinite(Number(scale)) && Number(scale) > 0);
  const ownerInvalid =
    records.filter(
      (r) => r.resourceType === "locations" && r.sourceId === location.sourceId,
    ).length !== 1;
  const indexValue =
    draft?.content[
      collection === "discoveries"
        ? "locationIds"
        : "worldPlacementDefinitionIds"
    ];
  const indexInvalid =
    indexValue !== undefined &&
    (!Array.isArray(indexValue) ||
      indexValue.some((v) => typeof v !== "string"));
  const malformed =
    ownerInvalid ||
    indexInvalid ||
    (collection === "discoveries"
      ? claims === undefined
      : entries.some(
          (e) =>
            records.filter(
              (r) =>
                r.resourceType === "world-placements" && r.sourceId === e.id,
            ).length !== 1,
        ));
  const ambiguousSource =
    collection !== "discoveries" &&
    sources.filter((s) => s.sourceId === sourceId).length > 1;
  const malformedValue =
    ambiguousSource ||
    (collection !== "discoveries" && !!existing && value.id !== existing.id) ||
    (collection === "discoveries"
      ? (value.provenance !== undefined &&
          typeof value.provenance !== "string") ||
        (value.conflictsWithClaimIds !== undefined &&
          (!Array.isArray(value.conflictsWithClaimIds) ||
            value.conflictsWithClaimIds.some((v) => typeof v !== "string"))) ||
        (value.relatedTruthClaimId !== undefined &&
          typeof value.relatedTruthClaimId !== "string")
      : (value.mapPosition !== undefined &&
          (!object(value.mapPosition) ||
            value.mapPosition.kind !== "normalized-map" ||
            typeof value.mapPosition.x !== "number" ||
            typeof value.mapPosition.y !== "number")) ||
        (value.scale !== undefined && typeof value.scale !== "number") ||
        (value.notes !== undefined && typeof value.notes !== "string"));
  const valid =
    collection === "discoveries"
      ? typeof value.statement === "string" && !!value.statement.trim()
      : typeof value.name === "string" &&
        !!value.name.trim() &&
        !!sourceId &&
        positionValid &&
        scaleValid;
  const blocked =
    malformed ||
    malformedValue ||
    (!!entryId && !creating && !existing) ||
    !currentPinned;
  const title = collection === "discoveries" ? "discovery" : "placement";
  async function saveDraft(next: WorldDefinitionDraft) {
    setError("");
    try {
      let result: WorldDefinitionDraft;
      if (collection === "discoveries") {
        const changed = next.records.find(
          (record) =>
            record.resourceType === "locations" &&
            record.sourceId === location.sourceId,
        );
        if (!changed) throw new Error("Location unavailable");
        const payload = recordPayload(changed);
        const profile = payload.profile === undefined ? {} : payload.profile;
        const placement = payload.placement;
        if (
          typeof payload.name !== "string" ||
          typeof payload.kind !== "string" ||
          (payload.description !== undefined &&
            typeof payload.description !== "string") ||
          !object(profile) ||
          (profile.summary !== undefined &&
            typeof profile.summary !== "string") ||
          (profile.tags !== undefined &&
            (!Array.isArray(profile.tags) ||
              profile.tags.some((tag) => typeof tag !== "string"))) ||
          !object(placement) ||
          !["root", "within-parent"].includes(String(placement.kind)) ||
          (placement.kind === "within-parent" &&
            typeof placement.parentLocationId !== "string")
        ) {
          throw new Error(
            "The Location contains unsupported fields; its content is preserved.",
          );
        }
        // The dedicated authoring action merges the saved payload, retaining private
        // and unknown fields. Carry fields its authorPayload rebuilds; omit unrelated
        // artwork/map/GM content so those retain their authoritative saved values.
        result = await saveWorldLocation(
          definition.id,
          {
            expectedStorageRevision: next.storageRevision,
            name: payload.name,
            kind: payload.kind,
            description: payload.description as string | undefined,
            parentLocationId:
              placement.kind === "within-parent"
                ? (placement.parentLocationId as never)
                : undefined,
            profileSummary: profile.summary as string | undefined,
            profileTags: profile.tags as string[] | undefined,
            discoveries:
              payload.discoveries as unknown as import("@aow/common").DiscoveryClaim[],
          },
          location.sourceId,
        );
      } else {
        result = await saveWorldDefinitionDraft(definition.id, {
          storageRevision: next.storageRevision,
          revisionName: next.revisionName,
          content: next.content,
          records: next.records,
        });
      }
      const adopted = { ...result, effectiveModels: draft?.effectiveModels };
      adoptDraft(adopted);
      setCurrentPinned(adopted);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.status === 409
          ? "This draft changed elsewhere. Your edits remain here; reload before saving again."
          : "Changes could not be saved. Your edits remain here; try again.",
      );
      return false;
    }
  }
  async function persist(next: ObjectValue) {
    if (!currentPinned || !canEdit || busy || blocked) return;
    setBusy(true);
    setSaved(false);
    if (!valid) {
      setBusy(false);
      return;
    }
    const record: WorldDraftRecord =
      collection === "discoveries"
        ? {
            ...location,
            payload: {
              ...recordPayload(location),
              discoveries:
                creating && !saved
                  ? [...(claims ?? []), next]
                  : (claims ?? []).map((c) => (c.id === next.id ? next : c)),
            },
          }
        : {
            ...placements.find((r) => r.sourceId === existing?.id),
            resourceType: "world-placements",
            sourceId: existing?.id ?? String(next.id),
            payload: next,
          };
    const updated = draftWithIndexedRecord(currentPinned, record);
    const success = await saveDraft(updated);
    setBusy(false);
    if (success) {
      setBaseline(JSON.stringify(next));
      setValue(next);
      setNumbersDirty(false);
      setSaved(true);
    }
  }
  async function remove(id: string) {
    if (
      !draft ||
      !canEdit ||
      busy ||
      malformed ||
      !window.confirm(`Remove this ${title}?`)
    )
      return;
    setBusy(true);
    const next =
      collection === "discoveries"
        ? draftWithIndexedRecord(draft, {
            ...location,
            payload: {
              ...recordPayload(location),
              discoveries: (claims ?? []).filter((c) => c.id !== id),
            },
          })
        : draftWithoutWorldPlacement(draft, id);
    await saveDraft(next);
    setBusy(false);
  }
  return (
    <section className="space-y-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {entryId
            ? `${creating ? "Add" : "Edit"} ${title}`
            : collection === "discoveries"
              ? "Discoveries"
              : collection === "items"
                ? "Items"
                : "Creatures"}
        </h1>
        {!entryId && canEdit && !malformed && (
          <InternalLink
            className="btn btn-primary min-h-11"
            href={`${base}/new${suffix}`}
          >
            Add {title}
          </InternalLink>
        )}
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {malformed && (
        <Alert tone="warning">
          This imported collection cannot be safely edited. Its content is
          preserved.
        </Alert>
      )}
      {entryId ? (
        <>
          <InternalLink
            className="btn btn-ghost min-h-11"
            href={`${base}${suffix}`}
          >
            Back to {collection}
          </InternalLink>
          {blocked ? (
            <Alert tone="warning">
              This {title} is unavailable, ambiguous, or contains unsupported
              imported values. Return to the list; its content is preserved.
            </Alert>
          ) : (
            <form
              className="space-y-5 rounded-box border border-base-300 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                const next = { ...value };
                if (collection !== "discoveries" && numbersDirty) {
                  if (x && y)
                    next.mapPosition = {
                      ...position,
                      kind: "normalized-map",
                      x: Number(x),
                      y: Number(y),
                    };
                  else delete next.mapPosition;
                  if (scale) next.scale = Number(scale);
                  else delete next.scale;
                }
                void persist(next);
              }}
            >
              <Fieldset
                disabled={!canEdit || busy || saved}
                className="space-y-5"
              >
                {collection === "discoveries" ? (
                  <>
                    <Field label="Discovery kind">
                      <Select
                        className="min-h-11"
                        value={String(value.kind)}
                        onChange={(e) => field("kind", e.target.value)}
                      >
                        <option value="truth">Truth</option>
                        <option value="rumor">Rumor</option>
                        <option value="belief">Belief</option>
                      </Select>
                    </Field>
                    <LocationTextField
                      label="Statement"
                      value={value.statement}
                      ids={ids}
                      onChange={(text) => field("statement", text)}
                      multiline={true}
                    />
                    <LocationTextField
                      label="Source or provenance"
                      value={value.provenance}
                      ids={ids}
                      onChange={(text) => field("provenance", text)}
                      multiline={false}
                    />
                    {value.kind === "rumor" && (
                      <Field label="Related truth">
                        <Select
                          className="min-h-11"
                          value={String(value.relatedTruthClaimId ?? "")}
                          onChange={(e) => {
                            const next = { ...value };
                            if (e.target.value)
                              next.relatedTruthClaimId = e.target.value;
                            else delete next.relatedTruthClaimId;
                            setValue(next);
                          }}
                        >
                          <option value="">No related truth</option>
                          {value.relatedTruthClaimId &&
                          !claims?.some(
                            (c) => c.id === value.relatedTruthClaimId,
                          ) ? (
                            <option value={String(value.relatedTruthClaimId)}>
                              Unavailable truth (preserved)
                            </option>
                          ) : null}
                          {claims
                            ?.filter((c) => c.kind === "truth")
                            .map((c) => (
                              <option key={String(c.id)} value={String(c.id)}>
                                {labelFor(c.statement, "Unnamed truth")}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    )}
                    {value.kind !== "truth" && (
                      <div className="space-y-2">
                        <h2 className="font-semibold">Conflicting claims</h2>
                        {Array.isArray(value.conflictsWithClaimIds) &&
                          value.conflictsWithClaimIds.map((id, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between gap-3"
                            >
                              <span>
                                {labelFor(
                                  claims?.find((c) => c.id === id)?.statement,
                                  "Unavailable claim",
                                )}
                              </span>
                              <Button
                                className="min-h-11 min-w-11"
                                type="button"
                                tone="outline"
                                onClick={() =>
                                  setValue({
                                    ...value,
                                    conflictsWithClaimIds: (
                                      value.conflictsWithClaimIds as JsonValue[]
                                    ).filter((_, i) => i !== index),
                                  })
                                }
                              >
                                Remove conflict
                              </Button>
                            </div>
                          ))}
                        <Field label="Add conflicting claim">
                          <Select
                            className="min-h-11"
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                setValue({
                                  ...value,
                                  conflictsWithClaimIds: [
                                    ...(Array.isArray(
                                      value.conflictsWithClaimIds,
                                    )
                                      ? value.conflictsWithClaimIds
                                      : []),
                                    e.target.value,
                                  ],
                                });
                            }}
                          >
                            <option value="">Choose a claim</option>
                            {claims
                              ?.filter((c) => c.id !== value.id)
                              .map((c) => (
                                <option key={String(c.id)} value={String(c.id)}>
                                  {labelFor(c.statement, "Unnamed claim")}
                                </option>
                              ))}
                          </Select>
                        </Field>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <LocationTextField
                      label="Placement name"
                      value={value.name}
                      ids={ids}
                      onChange={(text) => field("name", text)}
                      multiline={false}
                    />
                    <Field
                      label={
                        collection === "items"
                          ? "Item"
                          : "Creature or Character"
                      }
                      required
                    >
                      <Select
                        className="min-h-11"
                        required
                        value={sourceId}
                        onChange={(e) =>
                          setValue({
                            ...value,
                            source:
                              collection === "items"
                                ? {
                                    kind: "world-item",
                                    itemDefinitionId: e.target.value,
                                  }
                                : sources.find(
                                      (r) => r.sourceId === e.target.value,
                                    )?.resourceType ===
                                    "world-character-templates"
                                  ? {
                                      kind: "world-character",
                                      characterTemplateId: e.target.value,
                                    }
                                  : {
                                      kind: "world-creature",
                                      creatureId: e.target.value,
                                    },
                          })
                        }
                      >
                        <option value="">Choose named World content</option>
                        {sourceId &&
                        !sources.some((s) => s.sourceId === sourceId) ? (
                          <option value={sourceId}>
                            Unavailable World content (preserved)
                          </option>
                        ) : null}
                        {sources.map((s) => (
                          <option key={s.sourceId} value={s.sourceId}>
                            {labelFor(
                              recordName(s, "Unnamed content"),
                              "Unnamed content",
                            )}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {[
                      ["Horizontal map position", x, setX],
                      ["Vertical map position", y, setY],
                      ["Token scale", scale, setScale],
                    ].map(([label, text, set]) => (
                      <Field key={String(label)} label={String(label)}>
                        <Input
                          className="min-h-11"
                          type="number"
                          step="any"
                          value={String(text)}
                          onChange={(e) => {
                            (set as (v: string) => void)(e.target.value);
                            setNumbersDirty(true);
                            field("name", String(value.name ?? ""));
                            markDirty();
                          }}
                        />
                      </Field>
                    ))}
                    {!positionValid && (
                      <Alert tone="warning">
                        Enter both coordinates between 0 and 1, or leave both
                        blank.
                      </Alert>
                    )}
                    {!scaleValid && (
                      <Alert tone="warning">
                        Token scale must be greater than zero.
                      </Alert>
                    )}
                    <LocationTextField
                      label="Presentation notes"
                      value={value.notes}
                      ids={ids}
                      onChange={(text) => field("notes", text)}
                      multiline={true}
                    />
                  </>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    className="min-h-11 min-w-11"
                    type="submit"
                    tone="primary"
                    loading={busy}
                    disabled={!valid}
                  >
                    Save {title}
                  </Button>
                  <InternalLink
                    className="btn btn-outline min-h-11"
                    href={`${base}${suffix}`}
                  >
                    Cancel
                  </InternalLink>
                </div>
              </Fieldset>
              {saved && (
                <Alert tone="success">
                  {title === "discovery" ? "Discovery" : "Placement"} saved to
                  the World draft. Return to the list to continue.
                </Alert>
              )}
            </form>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {!entries.length && !malformed && (
            <Alert>No {collection} authored at this Location.</Alert>
          )}
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-box border border-base-300 p-4 space-y-3"
            >
              <h2 className="font-semibold break-words">
                {labelFor(
                  collection === "discoveries"
                    ? entry.payload.statement
                    : entry.payload.name,
                  `Unnamed ${title}`,
                )}
              </h2>
              {collection === "discoveries" && (
                <p>{String(entry.payload.kind)}</p>
              )}
              {collection === "discoveries" &&
                typeof entry.payload.provenance === "string" && (
                  <p className="break-words">
                    {labelFor(entry.payload.provenance, "Source preserved")}
                  </p>
                )}
              {collection !== "discoveries" && (
                <p>
                  {(() => {
                    const ref = object(entry.payload.source)
                      ? entry.payload.source[
                          entry.payload.source.kind === "world-character"
                            ? "characterTemplateId"
                            : collection === "items"
                              ? "itemDefinitionId"
                              : "creatureId"
                        ]
                      : undefined;
                    const matched = sources.filter((s) => s.sourceId === ref);
                    return matched.length === 1
                      ? labelFor(
                          recordName(matched[0]!, "Unnamed World content"),
                          "Unnamed World content",
                        )
                      : "Unavailable World content";
                  })()}
                </p>
              )}
              {collection !== "discoveries" &&
                typeof entry.payload.notes === "string" && (
                  <p className="break-words">
                    {labelFor(entry.payload.notes, "Notes preserved")}
                  </p>
                )}
              <div className="flex flex-wrap gap-3">
                <InternalLink
                  className="btn btn-outline min-h-11"
                  href={`${base}/${encodeURIComponent(`entry-${entry.id}`)}${suffix}`}
                >
                  Edit {title}
                </InternalLink>
                <Button
                  className="min-h-11 min-w-11"
                  type="button"
                  tone="outline"
                  disabled={!canEdit || busy || malformed}
                  onClick={() => void remove(entry.id)}
                >
                  Remove {title}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Legacy unfiltered Location views keep unsupported placement sources visible. */
export function LocationPreservedPlacements({
  location,
}: {
  location: WorldDraftRecord;
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const records = draft?.records ?? [];
  const placements = records.filter(
    (r) =>
      r.resourceType === "world-placements" &&
      recordPayload(r).locationId === location.sourceId &&
      (!object(recordPayload(r).source) ||
        !["world-creature", "world-character", "world-item"].includes(
          String((recordPayload(r).source as ObjectValue).kind),
        )),
  );
  const index = draft?.content.worldPlacementDefinitionIds;
  const indexInvalid =
    index !== undefined &&
    (!Array.isArray(index) || index.some((v) => typeof v !== "string"));
  const ids = new Set(records.map((r) => r.sourceId));
  if (!placements.length) return null;
  return (
    <section className="mt-6 space-y-4">
      <h2 className="text-xl font-semibold">Preserved placements</h2>
      <p>
        These imported sources remain read only. Removing a placement keeps its
        source content.
      </p>
      {error && <Alert tone="warning">{error}</Alert>}
      {placements.map((record, index) => {
        const name = recordName(record, "Unnamed placement");
        const unique =
          records.filter(
            (r) =>
              r.resourceType === "world-placements" &&
              r.sourceId === record.sourceId,
          ).length === 1;
        return (
          <article
            key={`${record.sourceId}-${index}`}
            className="rounded-box border border-base-300 p-4 flex flex-wrap gap-3 justify-between"
          >
            <h3>
              {protectedComparisonText(name, ids) ? "Unnamed placement" : name}
            </h3>
            <Button
              className="min-h-11"
              type="button"
              tone="outline"
              disabled={!canEdit || busy || !unique || indexInvalid}
              onClick={async () => {
                if (
                  !draft ||
                  busy ||
                  !canEdit ||
                  !unique ||
                  indexInvalid ||
                  !window.confirm(
                    "Remove this placement while retaining its source content?",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const next = draftWithoutWorldPlacement(
                    draft,
                    record.sourceId,
                  );
                  const saved = await saveWorldDefinitionDraft(definition.id, {
                    storageRevision: draft.storageRevision,
                    revisionName: next.revisionName,
                    content: next.content,
                    records: next.records,
                  });
                  adoptDraft({
                    ...saved,
                    effectiveModels: draft.effectiveModels,
                  });
                } catch (e) {
                  setError(
                    e instanceof ApiRequestError && e.status === 409
                      ? "This draft changed elsewhere. Reload before removing this placement."
                      : "The placement could not be removed. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove placement
            </Button>
          </article>
        );
      })}
    </section>
  );
}
