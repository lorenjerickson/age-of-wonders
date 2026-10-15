import { LocationPresentationSummary } from "./LocationPresentationSummary";
import { LocationPresentationFields } from "./LocationPresentationFields";
import { presentationFields } from "./locationPresentationModel";
import { visibleRecordName, visibleRecordDescription } from "./recordDisplay";
import { protectedComparisonText } from "./protectedAuthoringText";
import { RuleTextField } from "./RuleValueFields";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import {
  ActionSurface,
  Button,
  Checkbox,
  Fieldset,
  FileInput,
  Input,
  Label,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import type {
  CreateWorldLocationDraftRequest,
  DiscoveryClaim,
  LocationImage,
  LocationMapOrientation,
} from "@aow/common";
import {
  generateLocationMap,
  getMediaDownloadUrl,
  listMapMedia,
  saveWorldLocation,
  uploadWorldMedia,
  type JsonValue,
  type MediaAsset,
  type WorldDefinitionDraft,
  type WorldDraftRecord,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { recordName, recordPayload } from "./worldAuthoringModel";
import {
  locationAncestry,
  locationGmNotes,
  locationParentOptions,
  locationMapForSave,
} from "./locationWorkspaceModel";
import { InternalLink, useInternalNavigate } from "./navigation";
import { MediaImage } from "./MediaImage";
import { WorldMapPage } from "./WorldMapPage";
import { LocationImageGrid } from "./LocationImageGrid";
import "./AstraAtlas.css";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const mapLabels: Record<LocationMapOrientation, string> = {
  overhead: "Overhead",
  scenic: "Scenic",
  "side-on": "Profile",
  isometric: "Isometric",
};
const mapDescriptions: Record<LocationMapOrientation, string> = {
  overhead:
    "A top-down tactical view with a grid. Designed for walls, windows, doors, and lights.",
  scenic: "An atmospheric view that sets the scene for your location.",
  "side-on": "A side-on view of your location and its vertical spaces.",
  isometric: "An angled view that gives your location depth.",
};
function orientationOf(record?: WorldDraftRecord): LocationMapOrientation {
  const payload = record ? recordPayload(record) : {};
  const value =
    object(payload.mapScene).orientation ??
    object(payload.image).orientation ??
    "scenic";
  return value === "overhead" || value === "side-on" || value === "isometric"
    ? value
    : "scenic";
}
async function atlasRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "This change could not be saved. Please try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
function AtlasFooter() {
  return (
    <footer className="astra-footer">
      <span>Made for the stories only you can tell.</span>
      <span>ASTRA / WORLD BUILDER</span>
    </footer>
  );
}

export function AstraAtlas() {
  const { definition, draft } = useWorldAuthoring();
  const route = useLocation();
  const query = new URLSearchParams(route.searchStr);
  const legacy = route.pathname.split("/atlas/locations/")[1]?.split("/");
  const entry = query.get("entry") ?? legacy?.[0];
  const editing = query.get("edit") === "1" || legacy?.[1] === "edit";
  const base = `/worlds/${encodeURIComponent(definition.id)}?view=atlas`;
  const locations =
    draft?.records.filter((record) => record.resourceType === "locations") ??
    [];
  const record = locations.find((item) => item.sourceId === entry);
  if (!draft)
    return (
      <main className="astra-page">
        <h1 className="astra-heading">World atlas</h1>
        <p>A world draft is required to author locations.</p>
      </main>
    );
  if (record && query.get("map") === "1")
    return (
      <>
        <InternalLink
          className="astra-atlas-back"
          href={`${base}&entry=${encodeURIComponent(record.sourceId)}`}
        >
          ← Back to location
        </InternalLink>
        <WorldMapPage
          key={record.sourceId}
          locationId={record.sourceId}
          inlineTools
        />
      </>
    );
  if (entry === "new" || (record && editing))
    return (
      <AtlasForm
        key={entry}
        record={record}
        base={base}
        locations={locations}
      />
    );
  if (record)
    return (
      <AtlasDetail
        key={record.sourceId}
        record={record}
        base={base}
        locations={locations}
      />
    );
  if (entry)
    return (
      <main className="astra-page">
        <h1 className="astra-heading">Location unavailable</h1>
        <InternalLink href={base}>← Back to atlas</InternalLink>
      </main>
    );
  return <AtlasList base={base} locations={locations} />;
}
function AtlasList({
  base,
  locations,
}: {
  base: string;
  locations: WorldDraftRecord[];
}) {
  const { definition, canEdit } = useWorldAuthoring();
  const [search, setSearch] = useState("");
  const filtered = locations.filter((record) =>
    `${visibleRecordName(record, "")} ${text(recordPayload(record).description)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <main className="astra-page astra-atlas">
      <div className="astra-atlas-heading">
        <div>
          <p className="astra-eyebrow">THE WORLD ATLAS</p>
          <h1 className="astra-heading">Places with a story.</h1>
          <p>Build a connected world, one location at a time.</p>
        </div>
        {canEdit && (
          <InternalLink
            className="astra-atlas-primary"
            href={`${base}&entry=new`}
          >
            ＋ Add location
          </InternalLink>
        )}
      </div>
      <div className="astra-atlas-search">
        <Input
          aria-label="Search locations"
          placeholder="Search locations…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span>
          {filtered.length} {filtered.length === 1 ? "location" : "locations"}
        </span>
      </div>
      <div className="astra-atlas-cards">
        {filtered.map((record) => {
          const payload = recordPayload(record);
          const ancestry =
            locationAncestry(locations, record.sourceId)
              .slice(0, -1)
              .map((item) => visibleRecordName(item, "Unnamed location"))
              .join(" / ") || definition.name;
          const discoveries = Array.isArray(payload.discoveries)
            ? payload.discoveries.length
            : 0;
          return (
            <InternalLink
              className="astra-atlas-card"
              href={`${base}&entry=${encodeURIComponent(record.sourceId)}`}
              key={record.sourceId}
            >
              <MediaImage
                image={payload.image}
                name={visibleRecordName(record, "Location")}
                className="astra-atlas-cover"
              />
              <div className="astra-atlas-card-body">
                <p className="astra-atlas-ancestry">{ancestry}</p>
                <h2>{visibleRecordName(record, "Unnamed location")}</h2>
                <p className="astra-atlas-summary">
                  {visibleRecordDescription(record) ||
                    "An unwritten corner of your world."}
                </p>
                <div className="astra-atlas-tags">
                  <span>{mapLabels[orientationOf(record)]} map</span>
                  <span>
                    {discoveries}{" "}
                    {discoveries === 1 ? "discovery" : "discoveries"}
                  </span>
                </div>
              </div>
            </InternalLink>
          );
        })}
      </div>
      {!filtered.length && (
        <p className="astra-atlas-empty">
          {search
            ? "No locations match your search."
            : "Your atlas is waiting for its first location."}
        </p>
      )}
      <AtlasFooter />
    </main>
  );
}
function AtlasDetail({
  record,
  base,
  locations,
}: {
  record: WorldDraftRecord;
  base: string;
  locations: WorldDraftRecord[];
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const navigate = useInternalNavigate();
  const [grid, setGrid] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = new Set(draft?.records.map((entry) => entry.sourceId) ?? []);
  const payload = recordPayload(record);
  const orientation = orientationOf(record);
  const discoveries = Array.isArray(payload.discoveries)
    ? (payload.discoveries as unknown as DiscoveryClaim[])
    : [];
  const children = locations.filter(
    (item) =>
      object(recordPayload(item).placement).parentLocationId ===
      record.sourceId,
  );
  async function remove() {
    if (!draft) return;
    setBusy(true);
    try {
      const next = await atlasRequest<WorldDefinitionDraft>(
        `/worlds/${encodeURIComponent(definition.id)}/atlas/locations/${encodeURIComponent(record.sourceId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDraftId: draft.id,
            expectedStorageRevision: draft.storageRevision,
          }),
        },
      );
      adoptDraft({ ...next, effectiveModels: draft.effectiveModels });
      await navigate(base);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Location could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="astra-page astra-atlas">
      <InternalLink className="astra-atlas-back" href={base}>
        ← Back to atlas
      </InternalLink>
      <div className="astra-atlas-heading">
        <div>
          <p className="astra-eyebrow">
            {locationAncestry(locations, record.sourceId)
              .slice(0, -1)
              .map((item) => visibleRecordName(item, "Unnamed location"))
              .join(" / ") || definition.name}
          </p>
          <h1 className="astra-heading">
            {visibleRecordName(record, "Unnamed location")}
          </h1>
          <p>Your location, the places within it, and the secrets it keeps.</p>
        </div>
        {canEdit && (
          <div className="astra-actions">
            <InternalLink
              className="min-h-11"
              href={`/worlds/${encodeURIComponent(definition.id)}/atlas/locations/${encodeURIComponent(record.sourceId)}`}
            >
              Manage location collections
            </InternalLink>
            <Button onClick={() => setConfirmDelete(true)} tone="outline">
              Delete
            </Button>
            <InternalLink
              href={`${base}&entry=${encodeURIComponent(record.sourceId)}&map=1`}
            >
              Edit map / terrain
            </InternalLink>
            <InternalLink
              className="astra-atlas-primary"
              href={`${base}&entry=${encodeURIComponent(record.sourceId)}&edit=1`}
            >
              Edit location
            </InternalLink>
          </div>
        )}
      </div>
      {confirmDelete && (
        <section
          className="astra-panel astra-atlas-delete"
          aria-label="Delete location confirmation"
        >
          <p>
            Delete {visibleRecordName(record, "this location")}? This removes it
            from the current draft.
          </p>
          <Button tone="danger" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete location"}
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="astra-atlas-detail">
        <div>
          <section className="astra-panel astra-atlas-map-panel">
            <div className="astra-atlas-map">
              <MediaImage
                image={payload.image}
                name={`Map of ${visibleRecordName(record, "this location")}`}
                className="astra-atlas-map-image"
              />
              {grid && (
                <LocationImageGrid
                  image={payload.image}
                  scene={payload.mapScene}
                  map={payload.map}
                />
              )}
            </div>
            <div className="astra-atlas-map-caption">
              <div>
                <p className="astra-eyebrow">{mapLabels[orientation]} MAP</p>
                <p>{mapDescriptions[orientation]}</p>
              </div>
              {orientation !== "scenic" &&
                object(payload.map).kind !== "isometric" &&
                !!object(payload.mapScene).grid && (
                  <Button tone="outline" onClick={() => setGrid(!grid)}>
                    {grid ? "Hide" : "Show"} grid ⊞
                  </Button>
                )}
            </div>
          </section>
          <LocationPresentationSummary
            weather={payload.weather}
            audiovisualEffects={payload.audiovisualEffects}
          />
          <section className="astra-atlas-description">
            <h2>Player-facing description</h2>
            <p>
              {visibleRecordDescription(record) ||
                "An unwritten corner of your world."}
            </p>
          </section>
          <section className="astra-panel astra-atlas-notes">
            <h2>▣ GM-only notes</h2>
            <p>
              {protectedComparisonText(locationGmNotes(record), ids)
                ? "Existing GM notes preserved."
                : locationGmNotes(record) || "Your secrets are safe here."}
            </p>
          </section>
        </div>
        <aside className="astra-atlas-aside">
          <section className="astra-panel">
            <h2>
              Discoveries <small>GM ONLY</small>
            </h2>
            {discoveries.length ? (
              discoveries.map((claim) => (
                <div key={claim.id} className="astra-atlas-discovery">
                  <h3>{claim.kind}</h3>
                  <p>
                    {protectedComparisonText(
                      claim.statement,
                      new Set([...ids, claim.id]),
                    )
                      ? "Existing claim preserved."
                      : claim.statement}
                  </p>
                </div>
              ))
            ) : (
              <p>No discoveries yet.</p>
            )}
          </section>
          <section className="astra-panel">
            <h2>Within this place</h2>
            {children.length ? (
              children.map((item) => (
                <InternalLink
                  key={item.sourceId}
                  href={`${base}&entry=${encodeURIComponent(item.sourceId)}`}
                >
                  {visibleRecordName(item, "Unnamed location")} <span>↗</span>
                </InternalLink>
              ))
            ) : (
              <p>No locations within this place yet.</p>
            )}
          </section>
        </aside>
      </div>
      <AtlasFooter />
    </main>
  );
}
function AtlasForm({
  record,
  base,
  locations,
}: {
  record?: WorldDraftRecord;
  base: string;
  locations: WorldDraftRecord[];
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const navigate = useInternalNavigate();
  const payload = record ? recordPayload(record) : {};
  const ids = new Set(draft?.records.map((entry) => entry.sourceId) ?? []);
  const [name, setName] = useState(record ? recordName(record, "") : "");
  const rootLocationId = text(draft?.content.rootLocationId);
  const isRoot = record?.sourceId === rootLocationId;
  const [parentId, setParentId] = useState(
    text(object(payload.placement).parentLocationId) ||
      (isRoot ? "" : rootLocationId),
  );
  const [description, setDescription] = useState(text(payload.description));
  const [gmDescription, setGmDescription] = useState(
    record ? locationGmNotes(record) : "",
  );
  const [orientation, setOrientation] = useState<LocationMapOrientation>(
    record ? orientationOf(record) : "overhead",
  );
  const [image, setImage] = useState<LocationImage | undefined>(
    payload.image as unknown as LocationImage | undefined,
  );
  const [discoveries, setDiscoveries] = useState<DiscoveryClaim[]>(
    Array.isArray(payload.discoveries)
      ? (payload.discoveries as unknown as DiscoveryClaim[])
      : [],
  );
  const [sceneGrid, setSceneGrid] = useState<
    CreateWorldLocationDraftRequest["mapSceneGrid"]
  >(
    object(payload.mapScene)
      .grid as CreateWorldLocationDraftRequest["mapSceneGrid"],
  );
  const [grants, setGrants] = useState<string[]>(
    Array.isArray(payload.grantedConditions)
      ? payload.grantedConditions.map((item) => text(object(item).conditionId))
      : [],
  );
  const [conditions, setConditions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [conditionError, setConditionError] = useState("");
  const [weather, setWeather] = useState<JsonValue | undefined>(
    payload.weather as JsonValue | undefined,
  );
  const [audiovisualEffects, setAudiovisualEffects] = useState<
    JsonValue | undefined
  >(payload.audiovisualEffects as JsonValue | undefined);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [source, setSource] = useState(image?.assetId ? "current" : "none");
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaOffset, setMediaOffset] = useState(0);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [direction, setDirection] = useState("");
  const generationKey = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const mayLeave = useRef(false);
  const [errorRegion, setErrorRegion] = useState<"map" | "save">("map");
  const fingerprint = JSON.stringify({
    name,
    parentId,
    description,
    gmDescription,
    orientation,
    image,
    discoveries,
    sceneGrid,
    grants,
    weather,
    audiovisualEffects,
  });
  const baseline = useRef(fingerprint);
  const dirty = fingerprint !== baseline.current;
  useBlocker({
    shouldBlockFn: () =>
      !mayLeave.current &&
      (!!busy ||
        presentationBusy ||
        (dirty && !window.confirm("Leave without saving this location?"))),
    enableBeforeUnload:
      !mayLeave.current && (dirty || !!busy || presentationBusy),
  });
  useEffect(() => {
    let active = true;
    void atlasRequest<{ items: { id: string; name: string }[] }>(
      `/worlds/${encodeURIComponent(definition.id)}/codex/conditions`,
    ).then(
      (result) => {
        if (active) setConditions(result.items);
      },
      () => {
        if (active)
          setConditionError(
            "Conditions could not be loaded. Existing selections will be preserved.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [definition.id]);
  const back = record
    ? `${base}&entry=${encodeURIComponent(record.sourceId)}`
    : base;
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  async function chooseAsset(asset: Pick<MediaAsset, "id" | "mimeType">) {
    const { url } = await getMediaDownloadUrl(asset.id);
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = (err) =>
          reject(new Error("The image could not be opened.", { cause: err }));
        img.src = url;
      },
    );
    setImage({
      assetId: asset.id as LocationImage["assetId"],
      mimeType: asset.mimeType as LocationImage["mimeType"],
      ...dimensions,
      altText: `Map of ${name || "this location"}`,
      orientation: orientation === "isometric" ? "scenic" : orientation,
    });
  }
  async function run(action: () => Promise<void>, label: string) {
    setBusy(label);
    setError("");
    setErrorRegion(label === "Saving…" ? "save" : "map");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The request failed. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  async function loadMedia(offset = 0) {
    await run(async () => {
      const result = await listMapMedia(mediaSearch, offset);
      setMedia(result.items);
      setMediaTotal(result.total);
      setMediaOffset(offset);
    }, "Loading images…");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !canEdit || busy || presentationBusy) return;
    await run(async () => {
      const map = locationMapForSave(payload.map, image, orientation);
      const input: CreateWorldLocationDraftRequest = {
        expectedStorageRevision: draft.storageRevision,
        name: name.trim(),
        description,
        gmDescription,
        kind: text(payload.kind) || "region",
        parentLocationId:
          (parentId as CreateWorldLocationDraftRequest["parentLocationId"]) ||
          undefined,
        profileSummary: text(object(payload.profile).summary),
        profileTags: (object(payload.profile).tags as string[]) ?? [],
        mapSceneNotes: text(object(payload.mapScene).notes),
        mapOrientation: orientation,
        discoveries,
        image: image
          ? {
              ...image,
              orientation: orientation === "isometric" ? "scenic" : orientation,
            }
          : undefined,
        mapSceneGrid: sceneGrid,
        map,
        grantedConditions: grants.map((conditionId) => ({ conditionId })),
        ...presentationFields(weather, audiovisualEffects, payload),
      };
      const saved = await saveWorldLocation(
        definition.id,
        input,
        record?.sourceId,
      );
      adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
      const savedRecord =
        record ??
        saved.records.find(
          (item) =>
            item.resourceType === "locations" &&
            !locations.some((old) => old.sourceId === item.sourceId),
        );
      mayLeave.current = true;
      await navigate(
        savedRecord
          ? `${base}&entry=${encodeURIComponent(savedRecord.sourceId)}`
          : base,
      );
    }, "Saving…");
  }
  return (
    <main className="astra-page astra-atlas astra-atlas-form-page">
      <InternalLink href={back} className="astra-atlas-back">
        ← Back
      </InternalLink>
      <p className="astra-eyebrow">WORKSPACE / AUTHORING</p>
      <h1 className="astra-heading">
        {record ? "Edit location" : "Add a location"}
      </h1>
      <form
        className="astra-panel astra-atlas-form"
        onSubmit={(event) => void save(event)}
      >
        <Fieldset
          disabled={!!busy || presentationBusy || !canEdit}
          className="astra-atlas-fields"
        >
          {protectedComparisonText(name, ids) ? (
            <RuleTextField
              label="Location name"
              value={name}
              recordIds={ids}
              onChange={setName}
            />
          ) : (
            <Label>
              Location name
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Label>
          )}
          <Label>
            Within location
            <Select
              value={parentId}
              required={!isRoot}
              disabled={isRoot}
              onChange={(event) => setParentId(event.target.value)}
            >
              {isRoot && <option value="">World level</option>}
              {locationParentOptions(locations, record?.sourceId ?? "").map(
                (option) => (
                  <option key={option.id} value={option.id}>
                    {protectedComparisonText(option.name, ids)
                      ? "Location"
                      : option.name}
                  </option>
                ),
              )}
            </Select>
          </Label>
          {protectedComparisonText(description, ids) ? (
            <RuleTextField
              label="Player-facing description"
              value={description}
              recordIds={ids}
              onChange={setDescription}
            />
          ) : (
            <Label>
              Player-facing description
              <Textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Label>
          )}
          {protectedComparisonText(gmDescription, ids) ? (
            <RuleTextField
              label="GM-only description"
              value={gmDescription}
              recordIds={ids}
              onChange={setGmDescription}
            />
          ) : (
            <Label>
              GM-only description
              <Textarea
                rows={4}
                value={gmDescription}
                onChange={(event) => setGmDescription(event.target.value)}
              />
            </Label>
          )}
          <Fieldset className="astra-atlas-group">
            <Legend>Location map</Legend>
            <Label>
              Map type
              <Select
                value={orientation}
                onChange={(event) =>
                  setOrientation(event.target.value as LocationMapOrientation)
                }
              >
                {Object.entries(mapLabels).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={
                      value === "isometric" &&
                      object(payload.map).kind !== "isometric"
                    }
                  >
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <p className="astra-atlas-help">{mapDescriptions[orientation]}</p>
            {orientation !== "scenic" && orientation !== "isometric" && (
              <>
                <Label>
                  Image grid
                  <Select
                    value={sceneGrid?.kind ?? "none"}
                    onChange={(event) =>
                      setSceneGrid(
                        event.target.value === "none"
                          ? null
                          : {
                              kind: event.target.value as "square" | "hex",
                              cellSizePixels: sceneGrid?.cellSizePixels ?? 40,
                            },
                      )
                    }
                  >
                    <option value="none">No grid</option>
                    <option value="square">Square</option>
                    <option value="hex">Hex</option>
                  </Select>
                </Label>
                {sceneGrid && (
                  <Label>
                    Cell size (image pixels)
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={sceneGrid.cellSizePixels}
                      onChange={(event) =>
                        setSceneGrid({
                          ...sceneGrid,
                          cellSizePixels: Number(event.target.value),
                        })
                      }
                    />
                  </Label>
                )}
              </>
            )}
            {orientation === "scenic" && sceneGrid && (
              <p className="astra-atlas-help">
                The saved grid is inactive on scenic maps.
              </p>
            )}
            <p className="astra-atlas-help">
              Map types guide the image and its display. Interactive walls,
              lighting, movement, and gravity are planned for gameplay.
            </p>
            <Label>
              Choose a map source
              <Select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  if (event.target.value === "library") void loadMedia();
                }}
              >
                {!image && <option value="none">No map yet</option>}
                {image && <option value="current">Current map</option>}
                <option value="library">Choose from library</option>
                <option value="upload">Upload an image</option>
                <option value="generate">Generate an image</option>
              </Select>
            </Label>
            {source === "upload" && (
              <Label className="astra-atlas-upload">
                Upload map image
                <FileInput
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Allow selecting the same file again after an upload or
                    // image-opening failure.
                    event.target.value = "";
                    if (file)
                      void run(async () => {
                        if (file.size === 0)
                          throw new Error(
                            "This image file is empty. Choose a non-empty image file.",
                          );
                        if (
                          !file.type.startsWith("image/") ||
                          file.size > 20 * 1024 * 1024
                        )
                          throw new Error(
                            "Choose an image smaller than 20 MB.",
                          );
                        await chooseAsset(
                          await uploadWorldMedia(definition.id, file, "maps", [
                            "location-map",
                          ]),
                        );
                      }, "Uploading…");
                  }}
                />
              </Label>
            )}
            {error && errorRegion === "map" && (
              <p role="alert" className="astra-atlas-error">
                {error}
              </p>
            )}
            {source === "library" && (
              <div className="astra-atlas-library">
                <div className="astra-actions">
                  <Input
                    aria-label="Search map images"
                    value={mediaSearch}
                    onChange={(event) => setMediaSearch(event.target.value)}
                    placeholder="Search map images…"
                  />
                  <Button type="button" onClick={() => void loadMedia()}>
                    Search
                  </Button>
                </div>
                <div className="astra-atlas-media-grid">
                  {media.map((asset) => (
                    <ActionSurface
                      type="button"
                      key={asset.id}
                      onClick={() =>
                        void run(() => chooseAsset(asset), "Selecting…")
                      }
                    >
                      <MediaImage
                        image={{ assetId: asset.id }}
                        name={asset.originalName}
                      />
                      <span>{asset.originalName}</span>
                    </ActionSurface>
                  ))}
                </div>
                {!media.length && <p>No matching map images.</p>}
                <div className="astra-actions">
                  <Button
                    type="button"
                    disabled={mediaOffset === 0}
                    onClick={() =>
                      void loadMedia(Math.max(0, mediaOffset - 24))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    disabled={mediaOffset + media.length >= mediaTotal}
                    onClick={() => void loadMedia(mediaOffset + 24)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            {source === "generate" && (
              <div>
                <Label>
                  Describe the map
                  <Textarea
                    value={direction}
                    onChange={(event) => setDirection(event.target.value)}
                  />
                </Label>
                <Button
                  type="button"
                  disabled={
                    !direction.trim() ||
                    !name.trim() ||
                    orientation === "isometric"
                  }
                  onClick={() =>
                    void run(async () => {
                      if (!draft || orientation === "isometric") return;
                      const input = {
                        expectedStorageRevision: draft.storageRevision,
                        direction: direction.trim(),
                        orientation,
                      };
                      const proposalInput = {
                        ...input,
                        name: name.trim(),
                        description,
                        kind: text(payload.kind) || "region",
                      };
                      const fingerprint = JSON.stringify(
                        record ? input : proposalInput,
                      );
                      if (generationKey.current?.fingerprint !== fingerprint)
                        generationKey.current = {
                          fingerprint,
                          key: crypto.randomUUID(),
                        };
                      const result = record
                        ? await generateLocationMap(
                            definition.id,
                            record.sourceId,
                            input,
                            generationKey.current.key,
                          )
                        : await atlasRequest<{ image: LocationImage }>(
                            `/ai/worlds/${encodeURIComponent(definition.id)}/atlas/location-map-proposals`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                "Idempotency-Key": generationKey.current.key,
                              },
                              body: JSON.stringify(proposalInput),
                            },
                          );
                      setImage(result.image as unknown as LocationImage);
                      generationKey.current = null;
                    }, "Generating map…")
                  }
                >
                  Generate map
                </Button>
                {orientation === "isometric" && (
                  <p className="astra-atlas-help">
                    Use an uploaded or library image for an isometric map.
                  </p>
                )}
              </div>
            )}
            {image && (
              <MediaImage
                image={image}
                name={`Map of ${name || "this location"}`}
                className="astra-atlas-preview"
              />
            )}
          </Fieldset>
          <LocationPresentationFields
            worldId={definition.id}
            weather={weather}
            audiovisualEffects={audiovisualEffects}
            onWeather={setWeather}
            onEffects={setAudiovisualEffects}
            onBusyChange={setPresentationBusy}
          />
          <Fieldset className="astra-atlas-group">
            <Legend>Granted conditions</Legend>
            <p className="astra-atlas-help">
              Choose conditions this source can grant to an affected entity.
              Each condition keeps its references to reusable effects. Automatic
              application and duration countdowns will be part of gameplay.
            </p>
            {conditionError && <p role="alert">{conditionError}</p>}
            <div className="astra-atlas-choices">
              {conditions.map((condition) => (
                <Label key={condition.id}>
                  <Checkbox
                    checked={grants.includes(condition.id)}
                    onChange={() => setGrants(toggle(grants, condition.id))}
                  />
                  {condition.name}
                </Label>
              ))}
            </div>
            {!conditionError && !conditions.length && (
              <p className="astra-atlas-help">
                Create conditions in the Codex to grant them here.
              </p>
            )}
          </Fieldset>
          <section className="astra-atlas-discovery-editor">
            <h2>
              Discoveries <small>GM ONLY</small>
            </h2>
            {discoveries.map((claim, index) => (
              <div className="astra-atlas-discovery-row" key={claim.id}>
                <Label>
                  Kind
                  <Select
                    value={claim.kind}
                    onChange={(event) =>
                      setDiscoveries(
                        discoveries.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                kind: event.target
                                  .value as DiscoveryClaim["kind"],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="truth">Truth</option>
                    <option value="rumor">Rumor</option>
                    <option value="belief">Belief</option>
                  </Select>
                </Label>
                <Label>
                  Statement
                  <Textarea
                    required
                    value={
                      protectedComparisonText(
                        claim.statement,
                        new Set([...ids, claim.id]),
                      )
                        ? "Existing claim preserved."
                        : claim.statement
                    }
                    onChange={(event) =>
                      setDiscoveries(
                        discoveries.map((item, i) =>
                          i === index
                            ? { ...item, statement: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Label>
                <Button
                  type="button"
                  tone="outline"
                  onClick={() =>
                    setDiscoveries(discoveries.filter((_, i) => i !== index))
                  }
                >
                  Remove discovery
                </Button>
              </div>
            ))}
            <Button
              type="button"
              tone="outline"
              onClick={() =>
                setDiscoveries([
                  ...discoveries,
                  { id: crypto.randomUUID(), kind: "truth", statement: "" },
                ])
              }
            >
              ＋ Add discovery
            </Button>
          </section>
        </Fieldset>
        {error && errorRegion === "save" && (
          <p role="alert" className="astra-atlas-error">
            {error}
          </p>
        )}
        {busy && <p role="status">{busy}</p>}
        <div className="astra-actions astra-atlas-form-actions">
          <InternalLink href={back}>Cancel</InternalLink>
          <Button
            type="submit"
            tone="primary"
            disabled={!!busy || presentationBusy || !canEdit}
          >
            {busy === "Saving…" ? busy : "Save location"}
          </Button>
        </div>
      </form>
    </main>
  );
}
