import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  createDomainRecord,
  createLocationWithAi,
  deleteWorld,
  type DomainRecord,
  getDomainRecord,
  getMediaDownloadUrl,
  generateLocationMap,
  listDomainRecords,
  replaceDomainRecord,
  uploadMedia,
} from "./api";

type JsonObject = Record<string, unknown>;
type SaveState = "idle" | "saving" | "saved" | "error";

const LOCATION_KINDS = [
  "plane",
  "continent",
  "ocean",
  "region",
  "nation",
  "province",
  "territory",
  "wilderness",
  "settlement",
  "district",
  "site",
] as const;

const PHYSICAL_ENVIRONMENT_KINDS = [
  "planetary-region",
  "extradimensional-region",
  "artificial-habitat",
  "isolated-habitat",
  "simulation",
  "field-contained-region",
  "unknown",
] as const;

const UNDERSTANDING_STATES = [
  "understood",
  "empirical",
  "hypothesized",
  "unknown",
  "classified",
] as const;

const OPERATING_BASES = [
  "",
  "mechanical",
  "chemical",
  "electrical",
  "thermal",
  "optical",
  "acoustic",
  "biological",
  "neurological",
  "computational",
  "field-effect",
  "materials",
  "composite",
  "unknown",
] as const;

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringAt(data: JsonObject, path: string[]): string {
  const value = path.reduce<unknown>(
    (current, key) => asObject(current)[key],
    data,
  );
  return typeof value === "string" ? value : "";
}

function numberAt(data: JsonObject, path: string[]): number | undefined {
  const value = path.reduce<unknown>(
    (current, key) => asObject(current)[key],
    data,
  );
  return typeof value === "number" ? value : undefined;
}

function stringsAt(data: JsonObject, path: string[]): string[] {
  const value = path.reduce<unknown>(
    (current, key) => asObject(current)[key],
    data,
  );
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function setAt(data: JsonObject, path: string[], value: unknown): JsonObject {
  const clone = structuredClone(data);
  let target = clone;
  for (const key of path.slice(0, -1)) {
    const child = asObject(target[key]);
    target[key] = child;
    target = child;
  }
  target[path.at(-1) ?? ""] = value;
  return clone;
}

function parentIdOf(record: DomainRecord): string | undefined {
  const placement = asObject(record.data.placement);
  return placement.kind === "within-parent" &&
    typeof placement.parentLocationId === "string"
    ? placement.parentLocationId
    : undefined;
}

function imageData(record: DomainRecord) {
  const image = asObject(record.data.image);
  return {
    assetId: typeof image.assetId === "string" ? image.assetId : "",
    uri: typeof image.uri === "string" ? image.uri : "",
    altText: typeof image.altText === "string" ? image.altText : "",
  };
}

function EditableText({
  value,
  onCommit,
  label,
  multiline = false,
  prominent = false,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  multiline?: boolean;
  prominent?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function begin() {
    setDraft(value);
    setEditing(true);
  }

  function finish() {
    setEditing(false);
    if (draft !== value) onCommit(draft.trim());
  }

  if (editing) {
    return multiline ? (
      <textarea
        autoFocus
        aria-label={label}
        className="textarea textarea-bordered min-h-28 w-full text-base leading-7"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
      />
    ) : (
      <input
        autoFocus
        aria-label={label}
        className={`input input-bordered w-full ${prominent ? "input-lg text-3xl font-semibold" : ""}`}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost h-auto min-h-0 w-full justify-start whitespace-normal px-2 py-1 text-left ${
        prominent ? "text-4xl font-semibold tracking-tight" : "text-base"
      }`}
      onClick={begin}
      title={`Edit ${label}`}
    >
      {value || <span className="text-base-content/40">{placeholder}</span>}
    </button>
  );
}

function EditableList({
  label,
  values,
  onCommit,
  placeholder,
  variant = "chips",
}: {
  label: string;
  values: string[];
  onCommit: (values: string[]) => void;
  placeholder: string;
  variant?: "chips" | "lines";
}) {
  const [editing, setEditing] = useState(false);
  const separator = variant === "lines" ? "\n" : ", ";
  const [draft, setDraft] = useState(values.join(separator));

  if (editing) {
    return variant === "lines" ? (
      <textarea
        autoFocus
        aria-label={label}
        className="textarea textarea-bordered min-h-32 w-full text-sm leading-6"
        value={draft}
        placeholder={`${placeholder}, one per line`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(
            draft
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          );
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
      />
    ) : (
      <input
        autoFocus
        aria-label={label}
        className="input input-bordered w-full"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(
            draft
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          );
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="btn btn-ghost min-h-12 w-full items-start justify-start whitespace-normal px-3 py-2 text-left"
      style={{ height: "auto" }}
      onClick={() => {
        setDraft(values.join(separator));
        setEditing(true);
      }}
    >
      <span
        className={
          variant === "lines" ? "list w-full gap-2" : "flex flex-wrap gap-2"
        }
      >
        {values.length ? (
          values.map((value) =>
            variant === "lines" ? (
              <span
                key={value}
                className="list-row min-h-0 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-sm leading-5 font-normal whitespace-normal"
              >
                {value}
              </span>
            ) : (
              <span key={value} className="badge badge-outline badge-lg">
                {value}
              </span>
            ),
          )
        ) : (
          <span className="text-base-content/40">{placeholder}</span>
        )}
      </span>
    </button>
  );
}

function locationPath(
  record: DomainRecord,
  records: DomainRecord[],
): DomainRecord[] {
  const byId = new Map(records.map((candidate) => [candidate.id, candidate]));
  const path: DomainRecord[] = [];
  const visited = new Set<string>();
  let current: DomainRecord | undefined = record;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    const parentId = parentIdOf(current);
    current = parentId ? byId.get(parentId) : undefined;
  }
  return path;
}

function LocationBreadcrumbs({
  path,
  onSelect,
}: {
  path: DomainRecord[];
  onSelect: (id: string) => void;
}) {
  const compressed = path.length > 4;
  const displayed = compressed ? [path[0], undefined, ...path.slice(-2)] : path;
  const hiddenNames = compressed
    ? path
        .slice(1, -2)
        .map((record) => record.name ?? "Untitled location")
        .join(" › ")
    : "";
  const mobileDisplayed =
    path.length > 2 ? [path[0], undefined, path.at(-1)] : path;
  const mobileHiddenNames = path
    .slice(1, -1)
    .map((record) => record.name ?? "Untitled location")
    .join(" › ");

  function crumbs(
    items: Array<DomainRecord | undefined>,
    keyPrefix: string,
    suppressedNames: string,
  ) {
    return items.map((record, index) =>
      record ? (
        <li
          key={`${keyPrefix}:${record.id}`}
          className="flex min-w-0 items-center gap-1"
        >
          {index > 0 && <span className="text-base-content/30">/</span>}
          {record.id === path.at(-1)?.id ? (
            <span
              className="max-w-56 truncate px-2 py-1 font-semibold text-base-content"
              aria-current="page"
            >
              {record.name ?? "Untitled location"}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm min-w-0 max-w-48 px-2 font-normal"
              onClick={() => onSelect(record.id)}
            >
              <span className="truncate">
                {record.name ?? "Untitled location"}
              </span>
            </button>
          )}
        </li>
      ) : (
        <li key={`${keyPrefix}:suppressed`} className="flex items-center gap-1">
          <span className="text-base-content/30">/</span>
          <span
            className="tooltip tooltip-bottom px-2 text-base-content/50"
            data-tip={suppressedNames}
            aria-label={`Suppressed locations: ${suppressedNames}`}
          >
            …
          </span>
        </li>
      ),
    );
  }

  return (
    <nav aria-label="Location hierarchy" className="min-w-0 overflow-hidden">
      <ol className="flex min-w-0 flex-nowrap items-center gap-1 text-sm sm:hidden">
        {crumbs(mobileDisplayed, "mobile", mobileHiddenNames)}
      </ol>
      <ol className="hidden min-w-0 flex-nowrap items-center gap-1 text-sm sm:flex">
        {crumbs(displayed, "desktop", hiddenNames)}
      </ol>
    </nav>
  );
}

function ChildLocations({
  parent,
  records,
  onSelect,
  onAdd,
}: {
  parent: DomainRecord;
  records: DomainRecord[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const children = records
    .filter((candidate) => parentIdOf(candidate) === parent.id)
    .sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));

  return (
    <section className="grid gap-4 border-y border-base-300 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Locations within</h2>
          <p className="text-sm text-base-content/50">
            {children.length
              ? `${children.length} direct ${children.length === 1 ? "child" : "children"}`
              : "No child locations yet"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAdd}
        >
          + Add location
        </button>
      </div>
      {children.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="card border border-base-300 bg-base-200 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
              onClick={() => onSelect(child.id)}
            >
              <span className="card-body gap-2 p-4">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold">
                    {child.name ?? "Untitled location"}
                  </span>
                  <span className="badge badge-ghost badge-sm shrink-0">
                    {child.kind}
                  </span>
                </span>
                <span className="line-clamp-2 text-sm leading-5 text-base-content/60">
                  {stringAt(child.data, ["description"]) ||
                    "Open this location to add its description."}
                </span>
                <span className="mt-1 text-xs font-semibold text-primary">
                  Open location →
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LocationMap({
  record,
  onReplace,
  onGenerate,
  onAltText,
}: {
  record: DomainRecord;
  onReplace: (file: File) => Promise<void>;
  onGenerate: () => Promise<void>;
  onAltText: (value: string) => void;
}) {
  const image = imageData(record);
  const [resolvedUrl, setResolvedUrl] = useState(image.uri);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!image.assetId) return;
    void getMediaDownloadUrl(image.assetId).then(
      ({ url }) => {
        if (active) setResolvedUrl(url);
      },
      () => {
        if (active) setResolvedUrl(image.uri);
      },
    );
    return () => {
      active = false;
    };
  }, [image.assetId, image.uri]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onReplace(file);
    setUploading(false);
    event.target.value = "";
  }

  return (
    <div className="card group overflow-hidden border border-base-300 bg-base-200 shadow-xl">
      <figure className="relative aspect-video min-h-80 max-h-[75vh] bg-base-300">
        {resolvedUrl ? (
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-in"
            onClick={() => setExpanded(true)}
            aria-label={`Expand map of ${record.name ?? "location"}`}
          >
            <img
              src={resolvedUrl}
              alt={image.altText || `Map of ${record.name ?? "location"}`}
              className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-base-content/40">
            <span className="text-5xl" aria-hidden>
              ◇
            </span>
            <span>No map uploaded</span>
          </div>
        )}
        {resolvedUrl && (
          <button
            type="button"
            className="btn btn-neutral btn-sm absolute top-4 right-4 z-10 shadow-lg"
            onClick={() => setExpanded(true)}
          >
            Expand map
          </button>
        )}
        <div className="absolute right-4 bottom-4 z-10 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm shadow-lg"
            disabled={generating || uploading}
            onClick={() => {
              setGenerating(true);
              void onGenerate().finally(() => setGenerating(false));
            }}
          >
            {generating && (
              <span className="loading loading-spinner loading-xs" />
            )}
            {resolvedUrl ? "Regenerate with AI" : "Generate map with AI"}
          </button>
          <label className="btn btn-primary btn-sm cursor-pointer shadow-lg">
            {uploading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Upload map"
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={choose}
              disabled={uploading || generating}
            />
          </label>
        </div>
      </figure>
      <div className="card-body p-4">
        <p className="text-xs font-semibold tracking-wider text-base-content/50 uppercase">
          Map description
        </p>
        <EditableText
          value={image.altText}
          label="map description"
          placeholder="Describe this map for accessibility"
          onCommit={onAltText}
        />
      </div>
      {expanded && resolvedUrl && (
        <dialog open className="modal modal-open z-50 p-0">
          <div className="fixed inset-0 flex flex-col bg-black/95 p-3 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-4 text-white">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {record.name ?? "Untitled location"}
                </p>
                <p className="text-xs text-white/60">Map preview</p>
              </div>
              <button
                type="button"
                className="btn btn-circle btn-sm"
                aria-label="Close expanded map"
                onClick={() => setExpanded(false)}
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              className="min-h-0 flex-1 cursor-zoom-out"
              aria-label="Close expanded map"
              onClick={() => setExpanded(false)}
            >
              <img
                src={resolvedUrl}
                alt={image.altText || `Map of ${record.name ?? "location"}`}
                className="h-full w-full object-contain"
              />
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

function ProfileEditor({
  record,
  patch,
}: {
  record: DomainRecord;
  patch: (path: string[], value: unknown) => void;
}) {
  const data = record.data;
  const groups = [
    {
      title: "Terrain",
      summaryPath: ["profile", "terrain", "aspect", "summary"],
      fields: [
        ["Terrain types", ["profile", "terrain", "terrainTypes"]],
        ["Climates", ["profile", "terrain", "climates"]],
        ["Waterways", ["profile", "terrain", "waterways"]],
        ["Natural resources", ["profile", "terrain", "naturalResourceTags"]],
      ] as const,
    },
    {
      title: "Culture",
      summaryPath: ["profile", "culture", "aspect", "summary"],
      fields: [
        ["Languages", ["profile", "culture", "languages"]],
        ["Customs", ["profile", "culture", "customs"]],
      ] as const,
    },
    {
      title: "Politics",
      summaryPath: ["profile", "politics", "aspect", "summary"],
      fields: [
        ["Government", ["profile", "politics", "governmentForms"]],
        ["Laws", ["profile", "politics", "laws"]],
      ] as const,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => (
        <section
          key={group.title}
          className="card border border-base-300 bg-base-200"
        >
          <div className="card-body gap-4 p-5">
            <h2 className="card-title text-base">{group.title}</h2>
            <EditableText
              value={stringAt(data, group.summaryPath)}
              label={`${group.title} summary`}
              multiline
              placeholder={`Add a ${group.title.toLowerCase()} summary`}
              onCommit={(value) => patch(group.summaryPath, value)}
            />
            <fieldset className="fieldset">
              <legend className="fieldset-legend text-base-content/60">
                Tags
              </legend>
              <EditableList
                label={`${group.title} tags`}
                values={stringsAt(data, [
                  "profile",
                  group.title.toLowerCase(),
                  "aspect",
                  "tags",
                ])}
                placeholder={`Add ${group.title.toLowerCase()} tags`}
                onCommit={(value) =>
                  patch(
                    ["profile", group.title.toLowerCase(), "aspect", "tags"],
                    value,
                  )
                }
              />
            </fieldset>
            {group.fields.map(([label, path]) => (
              <fieldset key={label} className="fieldset">
                <legend className="fieldset-legend text-base-content/60">
                  {label}
                </legend>
                <EditableList
                  label={label}
                  values={stringsAt(data, [...path])}
                  placeholder={`Add ${label.toLowerCase()}`}
                  variant={
                    label === "Customs" || label === "Laws" ? "lines" : "chips"
                  }
                  onCommit={(value) => patch([...path], value)}
                />
              </fieldset>
            ))}
            {group.title === "Culture" && (
              <fieldset className="fieldset">
                <legend className="fieldset-legend text-base-content/60">
                  Population
                </legend>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  key={`${record.id}:population:${numberAt(data, ["profile", "culture", "population"]) ?? ""}`}
                  defaultValue={numberAt(data, [
                    "profile",
                    "culture",
                    "population",
                  ])}
                  placeholder="Unknown"
                  onBlur={(event) =>
                    patch(
                      ["profile", "culture", "population"],
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : undefined,
                    )
                  }
                />
              </fieldset>
            )}
            {group.title === "Politics" && (
              <fieldset className="fieldset">
                <legend className="fieldset-legend text-base-content/60">
                  Stability (0–100)
                </legend>
                <input
                  type="number"
                  min="0"
                  max="100"
                  key={`${record.id}:stability:${numberAt(data, ["profile", "politics", "stability"]) ?? ""}`}
                  className="input input-bordered w-full"
                  defaultValue={numberAt(data, [
                    "profile",
                    "politics",
                    "stability",
                  ])}
                  placeholder="Unknown"
                  onBlur={(event) =>
                    patch(
                      ["profile", "politics", "stability"],
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : undefined,
                    )
                  }
                />
              </fieldset>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function PhysicalEnvironmentEditor({
  record,
  patch,
}: {
  record: DomainRecord;
  patch: (path: string[], value: unknown) => void;
}) {
  if (record.data.kind !== "plane") return null;
  const environment = asObject(record.data.physicalEnvironment);
  return (
    <section className="card border border-primary/25 bg-primary/[0.05]">
      <div className="card-body gap-5">
        <div>
          <h2 className="card-title">Physical environment</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Describe what makes this a distinct traversable environment without
            treating “plane” as a supernatural explanation.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Environment kind</legend>
            <select
              className="select select-bordered w-full"
              value={stringAt(record.data, ["physicalEnvironment", "kind"])}
              onChange={(event) =>
                patch(["physicalEnvironment", "kind"], event.target.value)
              }
            >
              {PHYSICAL_ENVIRONMENT_KINDS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Understanding</legend>
            <select
              className="select select-bordered w-full"
              value={stringAt(record.data, [
                "physicalEnvironment",
                "understanding",
              ])}
              onChange={(event) =>
                patch(
                  ["physicalEnvironment", "understanding"],
                  event.target.value,
                )
              }
            >
              {UNDERSTANDING_STATES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Operating basis</legend>
            <select
              className="select select-bordered w-full"
              value={stringAt(record.data, [
                "physicalEnvironment",
                "operatingBasis",
              ])}
              onChange={(event) =>
                patch(
                  ["physicalEnvironment", "operatingBasis"],
                  event.target.value || undefined,
                )
              }
            >
              {OPERATING_BASES.map((value) => (
                <option key={value || "none"} value={value}>
                  {value || "Not applicable"}
                </option>
              ))}
            </select>
          </fieldset>
        </div>
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Observed properties</legend>
          <p className="mb-2 text-xs text-base-content/60">
            At least one measurable or repeatably observed property is required.
          </p>
          <EditableList
            label="Observed properties"
            values={stringsAt(record.data, [
              "physicalEnvironment",
              "observedProperties",
            ])}
            placeholder="Add a measurable environmental property"
            variant="lines"
            onCommit={(value) => {
              if (value.length > 0) {
                patch(["physicalEnvironment", "observedProperties"], value);
              }
            }}
          />
        </fieldset>
        <EditableText
          value={
            typeof environment.mechanismDescription === "string"
              ? environment.mechanismDescription
              : ""
          }
          label="environment mechanism"
          multiline
          placeholder="Describe the known or hypothesized physical mechanism"
          onCommit={(value) =>
            patch(["physicalEnvironment", "mechanismDescription"], value)
          }
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ["Sustaining infrastructure", "sustainingInfrastructure"],
            ["Boundary conditions", "boundaryConditions"],
            ["Access constraints", "accessConstraints"],
          ].map(([label, field]) => (
            <fieldset key={field} className="fieldset">
              <legend className="fieldset-legend">{label}</legend>
              <EditableList
                label={label}
                values={stringsAt(record.data, ["physicalEnvironment", field])}
                placeholder={`Add ${label.toLowerCase()}`}
                variant="lines"
                onCommit={(value) =>
                  patch(["physicalEnvironment", field], value)
                }
              />
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExtensionEditor({
  record,
  patch,
}: {
  record: DomainRecord;
  patch: (path: string[], value: unknown) => void;
}) {
  const extensions = asObject(record.data.extensions);
  const entries = Object.entries(extensions);
  if (!entries.length) return null;

  return (
    <div className="collapse collapse-arrow border border-base-300 bg-base-200">
      <input type="checkbox" />
      <div className="collapse-title font-semibold">
        World notes and generated briefs
      </div>
      <div className="collapse-content grid gap-4">
        <p className="text-sm text-base-content/60">
          These namespaced fields contain authored world data, not relational
          dependencies. Changes are saved when a field loses focus.
        </p>
        {entries.map(([key, value]) => (
          <JsonExtensionField
            key={`${record.id}:${key}`}
            label={key}
            value={value}
            onCommit={(next) => patch(["extensions", key], next)}
          />
        ))}
      </div>
    </div>
  );
}

function JsonExtensionField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [error, setError] = useState("");
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{label}</legend>
      <textarea
        className={`textarea textarea-bordered min-h-36 w-full font-mono text-xs ${error ? "textarea-error" : ""}`}
        defaultValue={JSON.stringify(value, null, 2)}
        onBlur={(event) => {
          try {
            onCommit(JSON.parse(event.currentTarget.value) as unknown);
            setError("");
          } catch {
            setError("Enter valid JSON before leaving this field.");
          }
        }}
      />
      {error && <p className="label text-error">{error}</p>}
    </fieldset>
  );
}

function childLocationData(
  parent: DomainRecord,
  name: string,
  kind: string,
  physicalEnvironment?: JsonObject,
) {
  const now = new Date().toISOString();
  return {
    identity: {
      id: crypto.randomUUID(),
      version: { revision: 1, updatedAt: now },
    },
    name,
    description: "",
    kind,
    ...(kind === "plane" && physicalEnvironment ? { physicalEnvironment } : {}),
    placement: {
      kind: "within-parent",
      parentLocationId: parent.id,
      border: {
        coordinateSpace: { kind: "custom", key: "aow:unplaced" },
        geometry: {
          kind: "polygon",
          polygon: {
            exterior: [
              {
                kind: "custom",
                coordinateSystem: "aow:unplaced",
                value: { x: 0, y: 0 },
              },
              {
                kind: "custom",
                coordinateSystem: "aow:unplaced",
                value: { x: 1, y: 0 },
              },
              {
                kind: "custom",
                coordinateSystem: "aow:unplaced",
                value: { x: 0, y: 1 },
              },
            ],
          },
        },
      },
    },
    image: {
      assetId: crypto.randomUUID(),
      altText: "",
      width: 1600,
      height: 900,
      mimeType: "image/webp",
    },
    profile: {
      terrain: {
        aspect: { summary: "", tags: [], traitIds: [] },
        terrainTypes: [],
      },
      culture: {
        aspect: { summary: "", tags: [], traitIds: [] },
        cultures: [],
        heritageCandidateIds: [],
        languages: [],
      },
      politics: {
        aspect: { summary: "", tags: [], traitIds: [] },
        influences: [],
      },
    },
    sceneIds: [],
  };
}

function dimensionsFor(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function LocationCreator({
  parent,
  onCancel,
  onCreated,
  onError,
}: {
  parent: DomainRecord;
  onCancel: () => void;
  onCreated: (record: DomainRecord) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("region");
  const [environmentKind, setEnvironmentKind] = useState("unknown");
  const [understanding, setUnderstanding] = useState("unknown");
  const [observedProperty, setObservedProperty] = useState("");
  const [working, setWorking] = useState(false);

  async function createWithAi(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setWorking(true);
    onError("");
    try {
      const result = await createLocationWithAi(parent.id, prompt.trim());
      onCreated(result.location);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Could not generate location",
      );
    } finally {
      setWorking(false);
    }
  }

  async function createManually(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setWorking(true);
    onError("");
    try {
      const record = await createDomainRecord(
        "locations",
        childLocationData(
          parent,
          name.trim(),
          kind,
          kind === "plane"
            ? {
                kind: environmentKind,
                understanding,
                observedProperties: [observedProperty.trim()],
              }
            : undefined,
        ),
      );
      onCreated(record);
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not add location",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-7">
      <header className="flex flex-col gap-4 border-b border-base-300 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            New child location
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Create inside {parent.name ?? "Untitled location"}
          </h1>
          <p className="mt-2 max-w-2xl text-base-content/60">
            The parent’s complete record is supplied to the AI together with
            your context and the project’s create-location prompt.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <div role="tablist" className="tabs tabs-box w-fit">
        <button
          type="button"
          role="tab"
          className={`tab ${mode === "ai" ? "tab-active" : ""}`}
          onClick={() => setMode("ai")}
        >
          Create with AI
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${mode === "manual" ? "tab-active" : ""}`}
          onClick={() => setMode("manual")}
        >
          Create manually
        </button>
      </div>

      {mode === "ai" ? (
        <form
          onSubmit={(event) => void createWithAi(event)}
          className="card border border-base-300 bg-base-200 shadow-xl"
        >
          <div className="card-body gap-5">
            <div>
              <h2 className="card-title">What belongs here?</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Describe its role, tone, terrain, people, conflicts, or any
                facts that must be preserved. The AI will create the location
                and its map.
              </p>
            </div>
            <textarea
              autoFocus
              required
              className="textarea textarea-bordered min-h-56 w-full text-base leading-7"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A storm-battered port at the edge of the parent region, built around the ribs of a leviathan. Its lighthouse guild secretly controls passage through the reefs…"
            />
            <div className="card-actions items-center justify-between">
              <span className="text-xs text-base-content/50">
                Uses create-location.md + parent context
              </span>
              <button
                className="btn btn-primary"
                disabled={working || !prompt.trim()}
              >
                {working && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Generate location and map
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => void createManually(event)}
          className="card border border-base-300 bg-base-200 shadow-xl"
        >
          <div className="card-body gap-5">
            <h2 className="card-title">Start with the essentials</h2>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Name</legend>
              <input
                autoFocus
                required
                className="input input-bordered w-full"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="The Ember Coast"
              />
            </fieldset>
            {kind === "plane" && (
              <div className="grid gap-4 rounded-box border border-primary/25 bg-primary/[0.05] p-4 sm:grid-cols-2">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">
                    Physical environment
                  </legend>
                  <select
                    className="select select-bordered w-full"
                    value={environmentKind}
                    onChange={(event) => setEnvironmentKind(event.target.value)}
                  >
                    {PHYSICAL_ENVIRONMENT_KINDS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Understanding</legend>
                  <select
                    className="select select-bordered w-full"
                    value={understanding}
                    onChange={(event) => setUnderstanding(event.target.value)}
                  >
                    {UNDERSTANDING_STATES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </fieldset>
                <fieldset className="fieldset sm:col-span-2">
                  <legend className="fieldset-legend">Observed property</legend>
                  <textarea
                    required
                    className="textarea textarea-bordered min-h-24 w-full"
                    value={observedProperty}
                    onChange={(event) =>
                      setObservedProperty(event.target.value)
                    }
                    placeholder="Describe one measurable property that distinguishes this environment"
                  />
                </fieldset>
              </div>
            )}
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Location type</legend>
              <select
                className="select select-bordered w-full"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {LOCATION_KINDS.map((locationKind) => (
                  <option key={locationKind} value={locationKind}>
                    {locationKind.charAt(0).toUpperCase() +
                      locationKind.slice(1)}
                  </option>
                ))}
              </select>
            </fieldset>
            <div className="card-actions justify-end">
              <button
                className="btn btn-primary"
                disabled={
                  working ||
                  !name.trim() ||
                  (kind === "plane" && !observedProperty.trim())
                }
              >
                {working && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Add location
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export function WorldEditor({ id }: { id: string }) {
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [selectedId, setSelectedId] = useState(id);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [addParentId, setAddParentId] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const recordsRef = useRef<DomainRecord[]>([]);
  const serverRecords = useRef(new Map<string, DomainRecord>());
  const queues = useRef(new Map<string, Promise<void>>());

  function replaceLocal(record: DomainRecord) {
    recordsRef.current = recordsRef.current.map((item) =>
      item.id === record.id ? record : item,
    );
    setRecords(recordsRef.current);
  }

  useEffect(() => {
    let active = true;
    async function loadLocations() {
      const all: DomainRecord[] = [];
      let offset = 0;
      let total = 0;
      do {
        const result = await listDomainRecords("locations", {
          limit: 200,
          offset,
          sort: "name",
          order: "asc",
        });
        all.push(...result.items);
        total = result.total;
        if (result.items.length === 0) break;
        offset += result.items.length;
      } while (offset < total);
      if (!active) return;
      recordsRef.current = all;
      serverRecords.current = new Map(all.map((record) => [record.id, record]));
      setRecords(all);
      setSelectedId(id);
    }
    void loadLocations().catch((caught: unknown) => {
      if (!active) return;
      setMessage(
        caught instanceof Error ? caught.message : "Could not load world",
      );
    });
    return () => {
      active = false;
    };
  }, [id]);

  function updateLocation(
    locationId: string,
    transform: (data: JsonObject) => JsonObject,
  ) {
    const current = recordsRef.current.find(
      (record) => record.id === locationId,
    );
    if (!current) return;
    const nextData = transform(current.data);
    const optimistic: DomainRecord = {
      ...current,
      name: typeof nextData.name === "string" ? nextData.name : current.name,
      kind: typeof nextData.kind === "string" ? nextData.kind : current.kind,
      data: nextData,
    };
    replaceLocal(optimistic);
    setSaveState("saving");
    setMessage("");

    const previous = queues.current.get(locationId) ?? Promise.resolve();
    const job: Promise<void> = previous.then(async () => {
      const serverRecord = serverRecords.current.get(locationId) ?? current;
      try {
        const persisted = await replaceDomainRecord(serverRecord, nextData);
        serverRecords.current.set(locationId, persisted);
        const displayed = recordsRef.current.find(
          (record) => record.id === locationId,
        );
        if (displayed) {
          replaceLocal({
            ...displayed,
            revision: persisted.revision,
            updatedAt: persisted.updatedAt,
          });
        }
        if (queues.current.get(locationId) === job) setSaveState("saved");
      } catch (caught) {
        setSaveState("error");
        setMessage(
          caught instanceof Error ? caught.message : "Autosave failed",
        );
        const fresh = await getDomainRecord("locations", locationId).catch(
          () => undefined,
        );
        if (fresh) {
          serverRecords.current.set(locationId, fresh);
          replaceLocal(fresh);
        }
      }
    });
    queues.current.set(locationId, job);
  }

  function patch(path: string[], value: unknown) {
    updateLocation(selectedId, (data) => setAt(data, path, value));
  }

  function finishCreating(created: DomainRecord) {
    recordsRef.current = [...recordsRef.current, created];
    serverRecords.current.set(created.id, created);
    setRecords(recordsRef.current);
    setSelectedId(created.id);
    setAddParentId(undefined);
  }

  function selectLocation(locationId: string) {
    setSelectedId(locationId);
    setAddParentId(undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function replaceMap(file: File) {
    try {
      const [asset, dimensions] = await Promise.all([
        uploadMedia(file, "maps", ["location-map", `location:${selectedId}`]),
        dimensionsFor(file),
      ]);
      updateLocation(selectedId, (data) => {
        const previous = asObject(data.image);
        const nextImage: JsonObject = {
          ...previous,
          assetId: asset.id,
          altText:
            typeof previous.altText === "string" && previous.altText
              ? previous.altText
              : `Map of ${stringAt(data, ["name"])}`,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: asset.mimeType,
        };
        delete nextImage.uri;
        return setAt(data, ["image"], nextImage);
      });
    } catch (caught) {
      setSaveState("error");
      setMessage(
        caught instanceof Error ? caught.message : "Map upload failed",
      );
    }
  }

  async function createMap() {
    setSaveState("saving");
    setMessage("");
    try {
      const result = await generateLocationMap(selectedId);
      serverRecords.current.set(selectedId, result.location);
      replaceLocal(result.location);
      setSaveState("saved");
    } catch (caught) {
      setSaveState("error");
      setMessage(
        caught instanceof Error ? caught.message : "Map generation failed",
      );
    }
  }

  async function removeWorld() {
    setDeleting(true);
    setMessage("");
    try {
      await Promise.all(queues.current.values());
      await deleteWorld(id);
      window.location.assign("/worlds");
    } catch (caught) {
      setDeleting(false);
      setConfirmingDelete(false);
      setMessage(
        caught instanceof Error ? caught.message : "Could not delete world",
      );
    }
  }

  const root = records.find((record) => record.id === id);
  const selected = records.find((record) => record.id === selectedId) ?? root;
  const addParent = records.find((record) => record.id === addParentId);
  const activePath = addParent
    ? locationPath(addParent, records)
    : selected
      ? locationPath(selected, records)
      : [];

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="navbar sticky top-16 z-20 border-b border-base-300 bg-base-100/90 px-4 backdrop-blur lg:px-8">
        <div className="navbar-start gap-3">
          <a href="/worlds" className="btn btn-ghost btn-sm">
            ← Worlds
          </a>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold tracking-[0.22em] text-primary uppercase">
              World editor
            </p>
            <p className="truncate font-semibold">
              {root?.name ?? "Loading world…"}
            </p>
          </div>
        </div>
        <div className="navbar-end gap-2">
          <div
            className={`badge gap-2 ${
              saveState === "error"
                ? "badge-error"
                : saveState === "saving"
                  ? "badge-warning"
                  : "badge-ghost"
            }`}
          >
            {saveState === "saving" && (
              <span className="loading loading-spinner loading-xs" />
            )}
            {saveState === "error"
              ? "Not saved"
              : saveState === "saving"
                ? "Saving"
                : saveState === "saved"
                  ? "Saved"
                  : "Autosave on"}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-error hover:bg-error/10"
            disabled={!root || deleting}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete world
          </button>
        </div>
      </div>

      <div className="min-h-[calc(100vh-4rem)] min-w-0 p-4 sm:p-6 lg:p-10">
        <div className="mx-auto grid max-w-[100rem] gap-6">
          {activePath.length > 0 && (
            <LocationBreadcrumbs path={activePath} onSelect={selectLocation} />
          )}
          {message && (
            <div role="alert" className="alert alert-error">
              <span>{message}</span>
            </div>
          )}
          {addParent ? (
            <LocationCreator
              key={addParent.id}
              parent={addParent}
              onCancel={() => setAddParentId(undefined)}
              onCreated={finishCreating}
              onError={setMessage}
            />
          ) : selected ? (
            <div key={selected.id} className="grid gap-8">
              <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
                <div>
                  <EditableText
                    value={stringAt(selected.data, ["name"])}
                    label="location name"
                    prominent
                    placeholder="Untitled location"
                    onCommit={(value) => patch(["name"], value)}
                  />
                  <div className="mt-3">
                    <EditableText
                      value={stringAt(selected.data, ["description"])}
                      label="location description"
                      multiline
                      placeholder="Click to describe this location"
                      onCommit={(value) => patch(["description"], value)}
                    />
                  </div>
                </div>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Location type</legend>
                  <select
                    className="select select-bordered w-full"
                    value={stringAt(selected.data, ["kind"])}
                    disabled={selected.id === id}
                    onChange={(event) => patch(["kind"], event.target.value)}
                  >
                    {selected.id === id && <option value="world">World</option>}
                    {LOCATION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.charAt(0).toUpperCase() + kind.slice(1)}
                      </option>
                    ))}
                  </select>
                </fieldset>
              </header>

              <LocationMap
                key={`${selected.id}:${imageData(selected).assetId}`}
                record={selected}
                onReplace={replaceMap}
                onGenerate={createMap}
                onAltText={(value) => patch(["image", "altText"], value)}
              />

              <PhysicalEnvironmentEditor record={selected} patch={patch} />

              <ChildLocations
                parent={selected}
                records={records}
                onSelect={selectLocation}
                onAdd={() => setAddParentId(selected.id)}
              />

              <ProfileEditor record={selected} patch={patch} />
              <ExtensionEditor record={selected} patch={patch} />
            </div>
          ) : (
            <div className="skeleton h-96 w-full" />
          )}
        </div>
      </div>

      {confirmingDelete && root && (
        <dialog open className="modal modal-open">
          <div className="modal-box border border-error/30">
            <h2 className="text-xl font-bold">Delete {root.name}?</h2>
            <p className="mt-3 text-base-content/70">
              This permanently deletes the world, every nested location, every
              creature owned by it, and location connections involving them.
              This action cannot be undone.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={deleting}
                onClick={() => void removeWorld()}
              >
                {deleting && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Delete world permanently
              </button>
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Cancel world deletion"
            disabled={deleting}
            onClick={() => setConfirmingDelete(false)}
          />
        </dialog>
      )}
    </main>
  );
}
