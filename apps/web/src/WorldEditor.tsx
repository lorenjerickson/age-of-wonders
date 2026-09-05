import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  ActionCard,
  ActionSurface,
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  Disclosure,
  Field,
  FieldError,
  Fieldset,
  FileInput,
  FileInputTrigger,
  IconButton,
  Input,
  Legend,
  Select,
  StatusIndicator,
  Tab,
  Textarea,
  Toggle,
} from "@aow/ui";
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
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { visibilityPolygon } from "./mapGeometry";

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
      <Textarea
        autoFocus
        aria-label={label}
        className="min-h-28 w-full text-base leading-7"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
      />
    ) : (
      <Input
        autoFocus
        aria-label={label}
        controlSize={prominent ? "lg" : "md"}
        className={prominent ? "text-3xl font-semibold" : undefined}
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
    <Button
      type="button"
      tone="ghost"
      className={`h-auto min-h-0 w-full justify-start whitespace-normal px-2 py-1 text-left ${
        prominent ? "text-4xl font-semibold tracking-tight" : "text-base"
      }`}
      onClick={begin}
      title={`Edit ${label}`}
    >
      {value || <span className="text-base-content/40">{placeholder}</span>}
    </Button>
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
      <Textarea
        autoFocus
        aria-label={label}
        className="min-h-32 w-full text-sm leading-6"
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
      <Input
        autoFocus
        aria-label={label}

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
    <Button
      type="button"
      tone="ghost"
      className="min-h-12 w-full items-start justify-start whitespace-normal px-3 py-2 text-left"
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
              <Badge key={value} outline size="lg">
                {value}
              </Badge>
            ),
          )
        ) : (
          <span className="text-base-content/40">{placeholder}</span>
        )}
      </span>
    </Button>
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
            <Button
              type="button"
              tone="ghost"
              size="sm"
              className="min-w-0 max-w-48 px-2 font-normal"
              onClick={() => onSelect(record.id)}
            >
              <span className="truncate">
                {record.name ?? "Untitled location"}
              </span>
            </Button>
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
        <Button type="button" tone="primary" size="sm" onClick={onAdd}>
          + Add location
        </Button>
      </div>
      {children.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {children.map((child) => (
            <ActionCard
              key={child.id}
              type="button"
              className="border border-base-300 bg-base-200 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
              onClick={() => onSelect(child.id)}
            >
              <span className="card-body gap-2 p-4">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold">
                    {child.name ?? "Untitled location"}
                  </span>
                  <Badge size="sm" className="shrink-0">
                    {child.kind}
                  </Badge>
                </span>
                <span className="line-clamp-2 text-sm leading-5 text-base-content/60">
                  {stringAt(child.data, ["description"]) ||
                    "Open this location to add its description."}
                </span>
                <span className="mt-1 text-xs font-semibold text-primary">
                  Open location →
                </span>
              </span>
            </ActionCard>
          ))}
        </div>
      )}
    </section>
  );
}

interface MapPinPosition {
  kind: "normalized-map";
  x: number;
  y: number;
}

interface MapDisplayPin {
  id: string;
  label: string;
  position: MapPinPosition;
}

interface LocationWallBlocking {
  sight: boolean;
  sound: boolean;
  movement: boolean;
  environmentalEffects: boolean;
}

interface LocationWall {
  id: string;
  kind: "wall" | "door" | "invisible-wall";
  vertices: MapPinPosition[];
  blocks: LocationWallBlocking;
  doorState?: "open" | "closed";
}

interface LocationTransition {
  id: string;
  position: MapPinPosition;
  radius: number;
  destination: {
    locationId: string;
    position: MapPinPosition;
  };
}

const DEFAULT_WALL_BLOCKING: LocationWallBlocking = {
  sight: true,
  sound: true,
  movement: true,
  environmentalEffects: true,
};

const INVISIBLE_WALL_BLOCKING: LocationWallBlocking = {
  sight: false,
  sound: false,
  movement: true,
  environmentalEffects: false,
};

type LocationMapOrientation = "scenic" | "overhead" | "side-on";

function mapOrientationOf(record: DomainRecord): LocationMapOrientation {
  const orientation = stringAt(record.data, ["image", "orientation"]);
  return orientation === "overhead" || orientation === "side-on"
    ? orientation
    : orientation === "scenic"
      ? "scenic"
      : stringAt(record.data, ["kind"]) === "site"
        ? "overhead"
        : "scenic";
}

function wallsOf(record: DomainRecord): LocationWall[] {
  const walls = record.data.walls;
  if (!Array.isArray(walls)) return [];
  return walls.flatMap((candidate) => {
    const wall = asObject(candidate);
    const blocks = asObject(wall.blocks);
    const vertices = Array.isArray(wall.vertices)
      ? wall.vertices.flatMap((candidateVertex) => {
          const vertex = asObject(candidateVertex);
          return vertex.kind === "normalized-map" &&
            typeof vertex.x === "number" &&
            typeof vertex.y === "number" &&
            vertex.x >= 0 &&
            vertex.x <= 1 &&
            vertex.y >= 0 &&
            vertex.y <= 1
            ? [
                {
                  kind: "normalized-map" as const,
                  x: vertex.x,
                  y: vertex.y,
                },
              ]
            : [];
        })
      : [];
    const kind =
      wall.kind === "door" || wall.kind === "invisible-wall"
        ? wall.kind
        : "wall";
    return typeof wall.id === "string" && vertices.length >= 2
      ? [
          {
            id: wall.id,
            kind,
            vertices,
            blocks:
              kind === "invisible-wall"
                ? { ...INVISIBLE_WALL_BLOCKING }
                : {
                    sight: blocks.sight !== false,
                    sound: blocks.sound !== false,
                    movement: blocks.movement !== false,
                    environmentalEffects: blocks.environmentalEffects !== false,
                  },
            ...(kind === "door"
              ? { doorState: wall.doorState === "open" ? "open" : "closed" }
              : {}),
          },
        ]
      : [];
  });
}

function transitionsOf(record: DomainRecord): LocationTransition[] {
  const transitions = record.data.transitions;
  if (!Array.isArray(transitions)) return [];
  return transitions.flatMap((candidate) => {
    const transition = asObject(candidate);
    const position = normalizedPosition(transition.position);
    const destination = asObject(transition.destination);
    const destinationPosition = normalizedPosition(destination.position);
    return typeof transition.id === "string" &&
      position &&
      typeof transition.radius === "number" &&
      transition.radius > 0 &&
      transition.radius <= 1 &&
      typeof destination.locationId === "string" &&
      destinationPosition
      ? [
          {
            id: transition.id,
            position,
            radius: transition.radius,
            destination: {
              locationId: destination.locationId,
              position: destinationPosition,
            },
          },
        ]
      : [];
  });
}

function normalizedPosition(value: unknown): MapPinPosition | undefined {
  const position = asObject(value);
  return position.kind === "normalized-map" &&
    typeof position.x === "number" &&
    typeof position.y === "number" &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
    ? { kind: "normalized-map", x: position.x, y: position.y }
    : undefined;
}

function mapPositionOf(record: DomainRecord): MapPinPosition | undefined {
  const placement = asObject(record.data.placement);
  const position = asObject(placement.mapPosition);
  return position.kind === "normalized-map" &&
    typeof position.x === "number" &&
    typeof position.y === "number" &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
    ? { kind: "normalized-map", x: position.x, y: position.y }
    : undefined;
}

function ContainedMap({
  src,
  alt,
  pins,
  onMapClick,
  onPinSelect,
  mapActionLabel,
  interactionClassName = "cursor-crosshair",
}: {
  src: string;
  alt: string;
  pins: MapDisplayPin[];
  onMapClick?: (position: MapPinPosition) => void;
  onPinSelect?: (id: string) => void;
  mapActionLabel?: string;
  interactionClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;
    const update = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const imageWidth = image.naturalWidth || 16;
      const imageHeight = image.naturalHeight || 9;
      const scale = Math.min(width / imageWidth, height / imageHeight);
      const renderedWidth = imageWidth * scale;
      const renderedHeight = imageHeight * scale;
      setFrame({
        left: (width - renderedWidth) / 2,
        top: (height - renderedHeight) / 2,
        width: renderedWidth,
        height: renderedHeight,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    image.addEventListener("load", update);
    update();
    return () => {
      observer.disconnect();
      image.removeEventListener("load", update);
    };
  }, [src]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
      />
      {frame.width > 0 && onMapClick && (
        <ActionSurface
          type="button"
          className={`absolute z-10 ${interactionClassName}`}
          style={frame}
          aria-label={mapActionLabel ?? "Choose a position on the map"}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            onMapClick({
              kind: "normalized-map",
              x: Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left) / bounds.width),
              ),
              y: Math.max(
                0,
                Math.min(1, (event.clientY - bounds.top) / bounds.height),
              ),
            });
          }}
        />
      )}
      {frame.width > 0 &&
        pins.map((pin) => {
          const style = {
            left: frame.left + pin.position.x * frame.width,
            top: frame.top + pin.position.y * frame.height,
          };
          const content = (
            <>
              <span className="rounded-full border-2 border-white bg-primary p-1.5 shadow-lg" />
              <span className="max-w-48 truncate rounded-full border border-white/25 bg-black/80 px-3 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-xl">
                {pin.label}
              </span>
            </>
          );
          return onPinSelect ? (
            <ActionSurface
              key={pin.id}
              type="button"
              className="absolute z-20 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 pb-1 transition hover:scale-105"
              style={style}
              aria-label={`Open ${pin.label}`}
              onClick={() => onPinSelect(pin.id)}
            >
              {content}
            </ActionSurface>
          ) : (
            <span
              key={pin.id}
              className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 pb-1"
              style={style}
            >
              {content}
            </span>
          );
        })}
    </div>
  );
}

function LocationMap({
  record,
  childLocations,
  onSelectChild,
  onReplace,
  onGenerate,
  onAltText,
}: {
  record: DomainRecord;
  childLocations: DomainRecord[];
  onSelectChild: (id: string) => void;
  onReplace: (file: File) => Promise<void>;
  onGenerate: () => Promise<void>;
  onAltText: (value: string) => void;
}) {
  const image = imageData(record);
  const [resolvedUrl, setResolvedUrl] = useState(image.uri);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pins = childLocations.flatMap((child) => {
    const position = mapPositionOf(child);
    return position
      ? [
          {
            id: child.id,
            label: child.name ?? "Untitled location",
            position,
          },
        ]
      : [];
  });

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
          <ContainedMap
            src={resolvedUrl}
            alt={image.altText || `Map of ${record.name ?? "location"}`}
            pins={pins}
            onMapClick={() => setExpanded(true)}
            onPinSelect={onSelectChild}
            mapActionLabel={`Expand map of ${record.name ?? "location"}`}
            interactionClassName="cursor-zoom-in"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-base-content/40">
            <span className="text-5xl" aria-hidden>
              ◇
            </span>
            <span>No map uploaded</span>
          </div>
        )}
        {resolvedUrl && (
          <Button
            type="button"
            tone="neutral"
            size="sm"
            className="absolute top-4 right-4 z-10 shadow-lg"
            onClick={() => setExpanded(true)}
          >
            Expand map
          </Button>
        )}
        <div className="absolute right-4 bottom-4 z-10 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            tone="secondary"
            size="sm"
            loading={generating}
            className="shadow-lg"
            disabled={generating || uploading}
            onClick={() => {
              setGenerating(true);
              void onGenerate().finally(() => setGenerating(false));
            }}
          >
            {resolvedUrl ? "Regenerate with AI" : "Generate map with AI"}
          </Button>
          <FileInputTrigger tone="primary" size="sm" className="shadow-lg">
            {uploading ? "Uploading…" : "Upload map"}
            <FileInput
              accept="image/*"
              className="hidden"
              onChange={choose}
              disabled={uploading || generating}
            />
          </FileInputTrigger>
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
        <Dialog open className="modal-open z-50 p-0">
          <div className="fixed inset-0 flex flex-col bg-black/95 p-3 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-4 text-white">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {record.name ?? "Untitled location"}
                </p>
                <p className="text-xs text-white/60">Map preview</p>
              </div>
              <IconButton
                type="button"
                shape="circle"
                size="sm"
                aria-label="Close expanded map"
                onClick={() => setExpanded(false)}
              >
                ✕
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <ContainedMap
                src={resolvedUrl}
                alt={image.altText || `Map of ${record.name ?? "location"}`}
                pins={pins}
                onMapClick={() => setExpanded(false)}
                onPinSelect={(id) => {
                  setExpanded(false);
                  onSelectChild(id);
                }}
                mapActionLabel="Close expanded map"
                interactionClassName="cursor-zoom-out"
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SiteWallEditor({
  record,
  locations,
  onCancel,
  onSave,
}: {
  record: DomainRecord;
  locations: DomainRecord[];
  onCancel: () => void;
  onSave: (decorators: {
    walls: LocationWall[];
    transitions: LocationTransition[];
    orientation: LocationMapOrientation;
  }) => void;
}) {
  const image = imageData(record);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { pointerId: number; x: number; y: number; panX: number; panY: number }
    | undefined
  >(undefined);
  const observerDragRef = useRef<number | undefined>(undefined);
  const [resolvedUrl, setResolvedUrl] = useState(image.uri);
  const [imageSize, setImageSize] = useState({ width: 1600, height: 900 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [walls, setWalls] = useState<LocationWall[]>(() => wallsOf(record));
  const [transitions, setTransitions] = useState<LocationTransition[]>(() =>
    transitionsOf(record),
  );
  const [orientation, setOrientation] = useState<LocationMapOrientation>(() =>
    mapOrientationOf(record),
  );
  const [draft, setDraft] = useState<MapPinPosition[]>([]);
  const [hoverPosition, setHoverPosition] = useState<MapPinPosition>();
  const [draftBlocks, setDraftBlocks] = useState<LocationWallBlocking>({
    ...DEFAULT_WALL_BLOCKING,
  });
  const [draftKind, setDraftKind] = useState<LocationWall["kind"]>("wall");
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [selectedTransitionId, setSelectedTransitionId] = useState<string>();
  const [observer, setObserver] = useState<MapPinPosition>();
  const [visionPreview, setVisionPreview] = useState(false);
  const [tool, setTool] = useState<
    "select" | "wall" | "door" | "invisible-wall" | "transition" | "observer"
  >("select");
  const [panning, setPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const selectedWall = walls.find((wall) => wall.id === selectedWallId);
  const selectedTransition = transitions.find(
    (transition) => transition.id === selectedTransitionId,
  );
  const fit = (() => {
    if (!stageSize.width || !stageSize.height) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const scale = Math.min(
      stageSize.width / imageSize.width,
      stageSize.height / imageSize.height,
    );
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    return {
      left: (stageSize.width - width) / 2,
      top: (stageSize.height - height) / 2,
      width,
      height,
    };
  })();

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
    const stage = stageRef.current;
    if (!stage) return;
    const update = () =>
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const keyDown = (event: KeyboardEvent) => {
      const finishWallTool = () => {
        setWalls((current) =>
          draft.length >= 2
            ? [
                ...current,
                {
                  id: crypto.randomUUID(),
                  kind: draftKind,
                  vertices: draft,
                  blocks: draftBlocks,
                  ...(draftKind === "door"
                    ? { doorState: "closed" as const }
                    : {}),
                },
              ]
            : current,
        );
        setDraft([]);
        setHoverPosition(undefined);
        setTool("select");
      };
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      if (
        editing ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const drawingBoundary =
        tool === "wall" || tool === "door" || tool === "invisible-wall";
      const activateBoundary = (kind: LocationWall["kind"]) => {
        if (drawingBoundary) finishWallTool();
        setDraft([]);
        setHoverPosition(undefined);
        setDraftKind(kind);
        setDraftBlocks({
          ...(kind === "invisible-wall"
            ? INVISIBLE_WALL_BLOCKING
            : DEFAULT_WALL_BLOCKING),
        });
        setSelectedWallId(undefined);
        setSelectedTransitionId(undefined);
        setTool(kind);
      };
      if (key === "w" || key === "d" || key === "v") {
        event.preventDefault();
        activateBoundary(
          key === "d" ? "door" : key === "v" ? "invisible-wall" : "wall",
        );
      }
      if (key === "t") {
        event.preventDefault();
        if (drawingBoundary) finishWallTool();
        setSelectedWallId(undefined);
        setSelectedTransitionId(undefined);
        setTool("transition");
      }
      if (key === "o") {
        event.preventDefault();
        if (drawingBoundary) finishWallTool();
        if (tool === "observer") {
          setTool("select");
          setVisionPreview(false);
        } else {
          setSelectedWallId(undefined);
          setSelectedTransitionId(undefined);
          setTool("observer");
          setVisionPreview(true);
        }
      }
      if (
        event.key === "Escape" &&
        (tool === "wall" || tool === "door" || tool === "invisible-wall")
      ) {
        event.preventDefault();
        finishWallTool();
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", keyDown);
    };
  }, [draft, draftBlocks, draftKind, tool]);

  function finishDraft(currentWalls = walls) {
    const next =
      draft.length >= 2
        ? [
            ...currentWalls,
            {
              id: crypto.randomUUID(),
              kind: draftKind,
              vertices: draft,
              blocks: draftBlocks,
              ...(draftKind === "door" ? { doorState: "closed" as const } : {}),
            },
          ]
        : currentWalls;
    setWalls(next);
    setDraft([]);
    setHoverPosition(undefined);
    setTool("select");
    return next;
  }

  function beginWall(kind: LocationWall["kind"] = "wall") {
    const drawingBoundary =
      tool === "wall" || tool === "door" || tool === "invisible-wall";
    const next = drawingBoundary ? finishDraft() : walls;
    setWalls(next);
    setDraft([]);
    setHoverPosition(undefined);
    setDraftKind(kind);
    setDraftBlocks({
      ...(kind === "invisible-wall"
        ? INVISIBLE_WALL_BLOCKING
        : DEFAULT_WALL_BLOCKING),
    });
    setSelectedWallId(undefined);
    setSelectedTransitionId(undefined);
    setTool(kind);
  }

  function pointerPosition(clientX: number, clientY: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    if (
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      return;
    }
    return {
      kind: "normalized-map" as const,
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  }

  function updateBlocking(key: keyof LocationWallBlocking, checked: boolean) {
    if (tool === "wall" || tool === "door") {
      setDraftBlocks((current) => ({ ...current, [key]: checked }));
      return;
    }
    if (!selectedWallId) return;
    setWalls((current) =>
      current.map((wall) =>
        wall.id === selectedWallId
          ? { ...wall, blocks: { ...wall.blocks, [key]: checked } }
          : wall,
      ),
    );
  }

  const activeBlocks = draft.length > 0 ? draftBlocks : selectedWall?.blocks;
  const sightSegments = walls.flatMap((wall) =>
    wall.blocks.sight && !(wall.kind === "door" && wall.doorState === "open")
      ? wall.vertices.slice(1).map((end, index) => ({
          start: wall.vertices[index],
          end,
        }))
      : [],
  );
  const visiblePolygon =
    visionPreview && observer
      ? visibilityPolygon(observer, sightSegments)
      : undefined;
  const vertexWidth = fit.width ? (6 / (fit.width * zoom)) * 1000 : 6;
  const vertexHeight = fit.height ? (6 / (fit.height * zoom)) * 1000 : 6;

  return (
    <Dialog open className="modal-open z-50 p-0">
      <div className="fixed inset-0 flex min-h-0 flex-col bg-base-100">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 bg-base-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Site map decorators
            </p>
            <h2 className="truncate text-xl font-semibold">
              {record.name ?? "Untitled site"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="join">
              {(
                [
                  ["wall", "Wall"],
                  ["door", "Door"],
                  ["invisible-wall", "Invisible wall"],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  type="button"
                  tone={tool === kind ? "primary" : "outline"}
                  size="sm"
                  className="join-item"
                  onClick={() => beginWall(kind)}
                >
                  {label}
                  <kbd className="kbd kbd-xs">
                    {kind === "wall" ? "W" : kind === "door" ? "D" : "V"}
                  </kbd>
                </Button>
              ))}
            </div>
            <Button
              type="button"
              tone={tool === "transition" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                if (draft.length) finishDraft();
                setSelectedWallId(undefined);
                setSelectedTransitionId(undefined);
                setTool("transition");
              }}
            >
              Transition <kbd className="kbd kbd-xs">T</kbd>
            </Button>
            <Button
              type="button"
              tone={tool === "observer" ? "accent" : "outline"}
              size="sm"
              onClick={() => {
                if (draft.length) finishDraft();
                if (tool === "observer") {
                  setTool("select");
                  setVisionPreview(false);
                } else {
                  setTool("observer");
                  setVisionPreview(true);
                }
              }}
            >
              Observer <kbd className="kbd kbd-xs">O</kbd>
            </Button>
            <Select
              aria-label="Map orientation"
              controlSize="sm"
              value={orientation}
              onChange={(event) => {
                const next = event.currentTarget
                  .value as LocationMapOrientation;
                setOrientation(next);
              }}
            >
              <option value="scenic">Scenic</option>
              <option value="overhead">Overhead</option>
              <option value="side-on">Side-on · gravity</option>
            </Select>
            <div className="join">
              <Button
                type="button"
                size="sm"
                className="join-item"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((value) => Math.max(1, value / 1.25))}
              >
                −
              </Button>
              <Button
                type="button"
                size="sm"
                className="join-item min-w-20"
                disabled
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                type="button"
                size="sm"
                className="join-item"
                aria-label="Zoom in"
                disabled={zoom >= 6}
                onClick={() => setZoom((value) => Math.min(6, value * 1.25))}
              >
                +
              </Button>
            </div>
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Reset view
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div
            ref={stageRef}
            className={`relative min-h-80 overflow-hidden bg-black/90 ${
              panning
                ? "cursor-grabbing"
                : tool !== "select"
                  ? "cursor-crosshair"
                  : "cursor-default"
            }`}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={(event) => {
              event.preventDefault();
              const multiplier = event.deltaY < 0 ? 1.12 : 1 / 1.12;
              setZoom((value) => Math.max(1, Math.min(6, value * multiplier)));
            }}
            onPointerDown={(event) => {
              if (event.button === 2) {
                event.preventDefault();
                setHoverPosition(undefined);
                setPanning(true);
                dragRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  panX: pan.x,
                  panY: pan.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              if (
                (tool === "wall" ||
                  tool === "door" ||
                  tool === "invisible-wall") &&
                event.button === 0
              ) {
                event.preventDefault();
                const position = pointerPosition(event.clientX, event.clientY);
                if (position) setDraft((current) => [...current, position]);
                return;
              }
              if (tool === "transition" && event.button === 0) {
                const position = pointerPosition(event.clientX, event.clientY);
                if (!position) return;
                const transition: LocationTransition = {
                  id: crypto.randomUUID(),
                  position,
                  radius: 0.025,
                  destination: { locationId: record.id, position },
                };
                setTransitions((current) => [...current, transition]);
                setSelectedTransitionId(transition.id);
                setTool("select");
                return;
              }
              if (tool === "observer" && event.button === 0) {
                const position = pointerPosition(event.clientX, event.clientY);
                if (!position) return;
                setObserver(position);
                observerDragRef.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (drag?.pointerId === event.pointerId) {
                setPan({
                  x: drag.panX + event.clientX - drag.x,
                  y: drag.panY + event.clientY - drag.y,
                });
                return;
              }
              if (
                tool === "wall" ||
                tool === "door" ||
                tool === "invisible-wall"
              ) {
                setHoverPosition(pointerPosition(event.clientX, event.clientY));
              }
              if (observerDragRef.current === event.pointerId) {
                const position = pointerPosition(event.clientX, event.clientY);
                if (position) setObserver(position);
              }
            }}
            onPointerLeave={() => {
              if (!dragRef.current) setHoverPosition(undefined);
            }}
            onPointerUp={(event) => {
              if (observerDragRef.current === event.pointerId) {
                observerDragRef.current = undefined;
                event.currentTarget.releasePointerCapture(event.pointerId);
                return;
              }
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = undefined;
              setPanning(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (observerDragRef.current === event.pointerId) {
                observerDragRef.current = undefined;
                return;
              }
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = undefined;
              setPanning(false);
            }}
          >
            {resolvedUrl ? (
              <div
                ref={surfaceRef}
                className="absolute touch-none select-none"
                style={{
                  left: fit.left,
                  top: fit.top,
                  width: fit.width,
                  height: fit.height,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                }}
              >
                <img
                  src={resolvedUrl}
                  alt={image.altText || `Map of ${record.name ?? "site"}`}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  onLoad={(event) =>
                    setImageSize({
                      width: event.currentTarget.naturalWidth || 1600,
                      height: event.currentTarget.naturalHeight || 900,
                    })
                  }
                />
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  aria-label={`${walls.length} defined walls`}
                >
                  {[
                    ...walls,
                    ...(draft.length
                      ? [
                          {
                            id: "draft",
                            kind: draftKind,
                            vertices: draft,
                            blocks: draftBlocks,
                          },
                        ]
                      : []),
                  ].map((wall) => {
                    const selected =
                      wall.id === "draft" || wall.id === selectedWallId;
                    const points = wall.vertices
                      .map((vertex) => `${vertex.x * 1000},${vertex.y * 1000}`)
                      .join(" ");
                    const wallColor =
                      wall.kind === "door"
                        ? "#38bdf8"
                        : wall.kind === "invisible-wall"
                          ? "#c084fc"
                          : "#ef4444";
                    return (
                      <g key={wall.id}>
                        <polyline
                          points={points}
                          fill="none"
                          stroke={selected ? "#fbbf24" : wallColor}
                          strokeWidth={selected ? 4 : 3}
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                          strokeDasharray={
                            wall.kind === "door"
                              ? "10 5"
                              : wall.kind === "invisible-wall"
                                ? "3 6"
                                : undefined
                          }
                        />
                        {wall.vertices.map((vertex, index) => (
                          <rect
                            key={`${wall.id}:${index}`}
                            x={vertex.x * 1000 - vertexWidth / 2}
                            y={vertex.y * 1000 - vertexHeight / 2}
                            width={vertexWidth}
                            height={vertexHeight}
                            fill={selected ? "#fbbf24" : wallColor}
                            stroke="black"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    );
                  })}
                  {draft.length > 0 && hoverPosition && (
                    <line
                      x1={draft.at(-1)!.x * 1000}
                      y1={draft.at(-1)!.y * 1000}
                      x2={hoverPosition.x * 1000}
                      y2={hoverPosition.y * 1000}
                      stroke="#fbbf24"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="8 5"
                    />
                  )}
                  {transitions.map((transition, index) => (
                    <g key={transition.id}>
                      <circle
                        cx={transition.position.x * 1000}
                        cy={transition.position.y * 1000}
                        r={transition.radius * 1000}
                        fill="rgba(34,211,238,.18)"
                        stroke={
                          selectedTransitionId === transition.id
                            ? "#fbbf24"
                            : "#22d3ee"
                        }
                        strokeWidth={3}
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={transition.position.x * 1000}
                        y={transition.position.y * 1000 + 5}
                        textAnchor="middle"
                        fill="white"
                        fontSize={18}
                        fontWeight="bold"
                      >
                        {index + 1}
                      </text>
                    </g>
                  ))}
                  {visiblePolygon && visiblePolygon.length > 2 && (
                    <path
                      d={`M 0 0 H 1000 V 1000 H 0 Z ${visiblePolygon
                        .map(
                          (point, index) =>
                            `${index ? "L" : "M"} ${point.x * 1000} ${point.y * 1000}`,
                        )
                        .join(" ")} Z`}
                      fill="rgba(0,0,0,.78)"
                      fillRule="evenodd"
                    />
                  )}
                  {observer && (
                    <g>
                      <circle
                        cx={observer.x * 1000}
                        cy={observer.y * 1000}
                        r={12}
                        fill="#facc15"
                        stroke="#111827"
                        strokeWidth={3}
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={observer.x * 1000}
                        cy={observer.y * 1000}
                        r={24}
                        fill="none"
                        stroke="#facc15"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  )}
                </svg>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-white/60">
                Upload or generate a site map before drawing walls.
              </div>
            )}
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-xl">
              {tool === "wall" || tool === "door" || tool === "invisible-wall"
                ? `${draft.length} ${draft.length === 1 ? "vertex" : "vertices"} · Left-click to extend · Right-drag to pan · Scroll to zoom · Esc to finish`
                : tool === "transition"
                  ? "Click to place a transition trigger · T"
                  : tool === "observer"
                    ? "Click or drag the observer to preview line of sight · O to turn off"
                    : "W wall · D door · V invisible wall · T transition · O observer"}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-base-300 bg-base-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Walls</h3>
                <p className="text-sm text-base-content/60">
                  {walls.length} {walls.length === 1 ? "wall" : "walls"}
                </p>
              </div>
              {(tool === "wall" ||
                tool === "door" ||
                tool === "invisible-wall" ||
                draft.length > 0) && (
                <Button
                  type="button"
                  tone="primary"
                  size="sm"
                  onClick={() => finishDraft()}
                >
                  Finish wall
                </Button>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              {walls.map((wall, index) => (
                <ActionCard
                  key={wall.id}
                  type="button"
                  className={`border text-left transition ${
                    selectedWallId === wall.id
                      ? "border-primary bg-primary/10"
                      : "border-base-300 bg-base-100 hover:border-base-content/30"
                  }`}
                  onClick={() => {
                    if (
                      tool === "wall" ||
                      tool === "door" ||
                      tool === "invisible-wall"
                    )
                      finishDraft();
                    setSelectedWallId(wall.id);
                    setSelectedTransitionId(undefined);
                    setTool("select");
                  }}
                >
                  <span className="card-body gap-1 p-3">
                    <span className="font-semibold">
                      {wall.kind === "door"
                        ? "Door"
                        : wall.kind === "invisible-wall"
                          ? "Invisible wall"
                          : "Wall"}{" "}
                      {index + 1}
                    </span>
                    <span className="text-sm text-base-content/60">
                      {wall.vertices.length} vertices
                    </span>
                  </span>
                </ActionCard>
              ))}
              {!walls.length && tool === "select" && (
                <p className="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                  Choose the wall tool, then click across the map to place a
                  connected wall.
                </p>
              )}
            </div>

            {activeBlocks &&
              (draft.length
                ? draftKind !== "invisible-wall"
                : selectedWall?.kind !== "invisible-wall") && (
                <Fieldset className="mt-5 rounded-box border border-base-300 bg-base-100 p-3">
                  <Legend className="px-1">This wall blocks</Legend>
                  {(
                    [
                      ["sight", "Line of sight"],
                      ["sound", "Sound"],
                      ["movement", "Movement"],
                      ["environmentalEffects", "Environmental effects"],
                    ] as const
                  ).map(([key, label]) => (
                    <Checkbox
                      key={key}
                      label={label}
                      controlSize="sm"
                      wrapperClassName="py-2"
                      checked={activeBlocks[key]}
                      onChange={(event) =>
                        updateBlocking(key, event.currentTarget.checked)
                      }
                    />
                  ))}
                </Fieldset>
              )}

            {selectedWall && (
              <div className="mt-4 grid gap-2">
                {selectedWall.kind === "door" && (
                  <Toggle
                    label="Door starts open"
                    tone="info"
                    controlSize="sm"
                    wrapperClassName="rounded-box border border-base-300 bg-base-100 p-3"
                    checked={selectedWall.doorState === "open"}
                    onChange={(event) => {
                      const doorState = event.currentTarget.checked
                        ? "open"
                        : "closed";
                      setWalls((current) =>
                        current.map((wall) =>
                          wall.id === selectedWall.id
                            ? {
                                ...wall,
                                doorState,
                              }
                            : wall,
                        ),
                      );
                    }}
                  />
                )}
                <Button
                  type="button"
                  tone="danger"
                  fullWidth
                  onClick={() => {
                    setWalls((current) =>
                      current.filter((wall) => wall.id !== selectedWall.id),
                    );
                    setSelectedWallId(undefined);
                  }}
                >
                  Delete selected boundary
                </Button>
              </div>
            )}

            {walls.length > 0 && (
              <Button
                type="button"
                tone="danger"
                fullWidth
                className="mt-3"
                onClick={() => {
                  setWalls([]);
                  setDraft([]);
                  setSelectedWallId(undefined);
                  setTool("select");
                }}
              >
                Discard all walls and doors
              </Button>
            )}

            <div className="divider">Transitions</div>
            <div className="grid gap-2">
              {transitions.map((transition, index) => {
                const destination = locations.find(
                  (location) =>
                    location.id === transition.destination.locationId,
                );
                return (
                  <ActionCard
                    key={transition.id}
                    type="button"
                    className={`border text-left ${selectedTransitionId === transition.id ? "border-secondary bg-secondary/10" : "border-base-300 bg-base-100"}`}
                    onClick={() => {
                      setSelectedTransitionId(transition.id);
                      setSelectedWallId(undefined);
                      setTool("select");
                    }}
                  >
                    <span className="card-body gap-1 p-3">
                      <span className="font-semibold">
                        Transition {index + 1}
                      </span>
                      <span className="text-sm text-base-content/60">
                        To {destination?.name ?? "another map"}
                      </span>
                    </span>
                  </ActionCard>
                );
              })}
              {!transitions.length && (
                <p className="text-sm text-base-content/60">
                  Place a trigger point to move intersecting tokens to another
                  map position.
                </p>
              )}
            </div>

            {selectedTransition && (
              <Fieldset className="mt-4 rounded-box border border-base-300 bg-base-100 p-3">
                <Legend>Transition destination</Legend>
                <Field label="Map">
                  <Select
                    value={selectedTransition.destination.locationId}
                    onChange={(event) => {
                      const locationId = event.currentTarget.value;
                      setTransitions((current) =>
                        current.map((transition) =>
                          transition.id === selectedTransition.id
                            ? {
                                ...transition,
                                destination: {
                                  ...transition.destination,
                                  locationId,
                                },
                              }
                            : transition,
                        ),
                      );
                    }}
                  >
                    {locations
                      .filter(
                        (location) =>
                          stringAt(location.data, ["kind"]) === "site",
                      )
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name ?? "Untitled site"}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["x", "y"] as const).map((axis) => (
                    <Field
                      key={axis}
                      label={`Destination ${axis.toUpperCase()} (%)`}
                    >
                      <Input
                        type="number"
                        min="0"
                        max="100"

                        value={Math.round(
                          selectedTransition.destination.position[axis] * 100,
                        )}
                        onChange={(event) => {
                          const value = Math.max(
                            0,
                            Math.min(100, Number(event.currentTarget.value)),
                          );
                          setTransitions((current) =>
                            current.map((transition) =>
                              transition.id === selectedTransition.id
                                ? {
                                    ...transition,
                                    destination: {
                                      ...transition.destination,
                                      position: {
                                        ...transition.destination.position,
                                        [axis]: value / 100,
                                      },
                                    },
                                  }
                                : transition,
                            ),
                          );
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Trigger radius (%)" className="mt-2">
                  <Input
                    type="number"
                    min="0.5"
                    max="25"
                    step="0.5"

                    value={selectedTransition.radius * 100}
                    onChange={(event) => {
                      const radius = Math.max(
                        0.005,
                        Math.min(0.25, Number(event.currentTarget.value) / 100),
                      );
                      setTransitions((current) =>
                        current.map((transition) =>
                          transition.id === selectedTransition.id
                            ? { ...transition, radius }
                            : transition,
                        ),
                      );
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  tone="danger"
                  className="mt-3"
                  onClick={() => {
                    setTransitions((current) =>
                      current.filter(
                        (transition) => transition.id !== selectedTransition.id,
                      ),
                    );
                    setSelectedTransitionId(undefined);
                  }}
                >
                  Delete transition
                </Button>
              </Fieldset>
            )}

            <div className="divider">Line of sight</div>
            <Toggle
              label="Reveal observer visibility"
              tone="accent"
              checked={visionPreview}
              onChange={(event) =>
                setVisionPreview(event.currentTarget.checked)
              }
            />
            <p className="mt-2 text-sm text-base-content/60">
              Place and drag the observer. Closed doors and sight-blocking walls
              hide the map. The observer stays exactly where you place it and is
              never affected by token gravity.
            </p>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 bg-base-200 px-4 py-3 sm:px-6">
          <p className="text-sm text-base-content/60">
            Decorator coordinates remain aligned when the map is resized.
          </p>
          <div className="flex gap-2">
            <Button type="button" tone="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              tone="primary"
              onClick={() =>
                onSave({
                  walls: draft.length > 0 ? finishDraft() : walls,
                  transitions,
                  orientation,
                })
              }
            >
              Save decorators
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}

function SiteWallsPanel({
  record,
  onEdit,
}: {
  record: DomainRecord;
  onEdit: () => void;
}) {
  const walls = wallsOf(record);
  const transitions = transitionsOf(record);
  const orientation = mapOrientationOf(record);
  const vertices = walls.reduce(
    (total, wall) => total + wall.vertices.length,
    0,
  );
  return (
    <section className="card border border-base-300 bg-base-200 shadow-xl">
      <div className="card-body flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Runtime map geometry
          </p>
          <h2 className="card-title mt-1">Map decorators</h2>
          <p className="mt-1 text-sm text-base-content/60">
            {walls.length || transitions.length
              ? `${orientation} · ${walls.length} ${walls.length === 1 ? "boundary" : "boundaries"} across ${vertices} vertices · ${transitions.length} ${transitions.length === 1 ? "transition" : "transitions"}`
              : `${orientation} · Add walls, doors, transitions, gravity, and visibility preview.`}
          </p>
        </div>
        <Button type="button" tone="primary" onClick={onEdit}>
          {walls.length || transitions.length
            ? "Edit decorators"
            : "Add decorators"}
        </Button>
      </div>
    </section>
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
            <Fieldset>
              <Legend className="text-base-content/60">Tags</Legend>
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
            </Fieldset>
            {group.fields.map(([label, path]) => (
              <Fieldset key={label}>
                <Legend className="text-base-content/60">{label}</Legend>
                <EditableList
                  label={label}
                  values={stringsAt(data, [...path])}
                  placeholder={`Add ${label.toLowerCase()}`}
                  variant={
                    label === "Customs" || label === "Laws" ? "lines" : "chips"
                  }
                  onCommit={(value) => patch([...path], value)}
                />
              </Fieldset>
            ))}
            {group.title === "Culture" && (
              <Fieldset>
                <Legend className="text-base-content/60">Population</Legend>
                <Input
                  type="number"

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
              </Fieldset>
            )}
            {group.title === "Politics" && (
              <Fieldset>
                <Legend className="text-base-content/60">
                  Stability (0–100)
                </Legend>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  key={`${record.id}:stability:${numberAt(data, ["profile", "politics", "stability"]) ?? ""}`}

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
              </Fieldset>
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
          <Fieldset>
            <Legend>Environment kind</Legend>
            <Select
              value={stringAt(record.data, ["physicalEnvironment", "kind"])}
              onChange={(event) =>
                patch(["physicalEnvironment", "kind"], event.target.value)
              }
            >
              {PHYSICAL_ENVIRONMENT_KINDS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Fieldset>
          <Fieldset>
            <Legend>Understanding</Legend>
            <Select
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
            </Select>
          </Fieldset>
          <Fieldset>
            <Legend>Operating basis</Legend>
            <Select
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
            </Select>
          </Fieldset>
        </div>
        <Fieldset>
          <Legend>Observed properties</Legend>
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
        </Fieldset>
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
            <Fieldset key={field}>
              <Legend>{label}</Legend>
              <EditableList
                label={label}
                values={stringsAt(record.data, ["physicalEnvironment", field])}
                placeholder={`Add ${label.toLowerCase()}`}
                variant="lines"
                onCommit={(value) =>
                  patch(["physicalEnvironment", field], value)
                }
              />
            </Fieldset>
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
    <Disclosure
      summary="World notes and generated briefs"
      className="bg-base-200"
    >
      <div className="grid gap-4">
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
    </Disclosure>
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
    <Fieldset>
      <Legend>{label}</Legend>
      <Textarea
        className={`min-h-36 w-full font-mono text-xs ${error ? "border-error" : ""}`}
        aria-invalid={Boolean(error) || undefined}
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
      {error && <FieldError>{error}</FieldError>}
    </Fieldset>
  );
}

function ParentMapPinDialog({
  parent,
  existingChildren,
  label,
  value,
  onCancel,
  onConfirm,
}: {
  parent: DomainRecord;
  existingChildren: DomainRecord[];
  label: string;
  value?: MapPinPosition;
  onCancel: () => void;
  onConfirm: (position: MapPinPosition) => void;
}) {
  const image = imageData(parent);
  const [resolvedUrl, setResolvedUrl] = useState(image.uri);
  const [position, setPosition] = useState<MapPinPosition | undefined>(value);
  const existingPins = existingChildren.flatMap((child) => {
    const childPosition = mapPositionOf(child);
    return childPosition
      ? [
          {
            id: child.id,
            label: child.name ?? "Untitled location",
            position: childPosition,
          },
        ]
      : [];
  });

  useEffect(() => {
    let active = true;
    if (image.assetId) {
      void getMediaDownloadUrl(image.assetId).then(
        ({ url }) => {
          if (active) setResolvedUrl(url);
        },
        () => {
          if (active) setResolvedUrl(image.uri);
        },
      );
    }
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      active = false;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [image.assetId, image.uri, onCancel]);

  return (
    <Dialog open className="modal-open z-50 p-0">
      <div className="fixed inset-0 flex flex-col bg-base-100">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 bg-base-200 px-5 py-4 sm:px-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Place child location
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {parent.name ?? "Parent location"} map
            </h2>
            <p className="mt-1 text-sm text-base-content/60">
              Click the map to position {label || "the new location"}. Confirm
              when the pin is in the right place.
            </p>
          </div>
          <Button
            type="button"
            tone="ghost"
            aria-label="Cancel map placement"
            onClick={onCancel}
          >
            ✕
          </Button>
        </header>

        <div className="min-h-0 flex-1 bg-black/80 p-3 sm:p-6">
          {resolvedUrl ? (
            <ContainedMap
              src={resolvedUrl}
              alt={image.altText || `Map of ${parent.name ?? "location"}`}
              pins={
                position
                  ? [
                      ...existingPins,
                      {
                        id: "draft-location",
                        label: label || "New location",
                        position,
                      },
                    ]
                  : existingPins
              }
              onMapClick={setPosition}
              mapActionLabel="Place location pin"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-box border border-warning/30 bg-base-200 p-6 text-center">
                <h3 className="font-semibold">Parent map unavailable</h3>
                <p className="mt-2 text-sm text-base-content/60">
                  Upload or generate a map for the parent location before
                  placing a child pin.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-base-300 bg-base-200 px-5 py-4 sm:px-8">
          <p className="text-sm text-base-content/60">
            {position
              ? `Pin at ${Math.round(position.x * 100)}% across, ${Math.round(position.y * 100)}% down`
              : "Choose a point on the map to continue."}
          </p>
          <div className="flex gap-2">
            <Button type="button" tone="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              tone="primary"
              disabled={!position}
              onClick={() => {
                if (position) onConfirm(position);
              }}
            >
              Confirm pin
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}

function childLocationData(
  parent: DomainRecord,
  name: string,
  kind: string,
  mapPosition?: MapPinPosition,
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
      ...(mapPosition ? { mapPosition } : {}),
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
      orientation: kind === "site" ? "overhead" : "scenic",
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
  existingChildren,
  onCancel,
  onCreated,
  onError,
}: {
  parent: DomainRecord;
  existingChildren: DomainRecord[];
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
  const [mapPosition, setMapPosition] = useState<MapPinPosition>();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function createWithAi(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setWorking(true);
    onError("");
    try {
      const result = await createLocationWithAi(
        parent.id,
        prompt.trim(),
        mapPosition,
      );
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
          mapPosition,
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
        <Button type="button" tone="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </header>

      <div role="tablist" className="tabs tabs-box w-fit">
        <Tab type="button" active={mode === "ai"} onClick={() => setMode("ai")}>
          Create with AI
        </Tab>
        <Tab
          type="button"
          active={mode === "manual"}
          onClick={() => setMode("manual")}
        >
          Create manually
        </Tab>
      </div>

      <section className="card border border-base-300 bg-base-200 shadow-sm">
        <div className="card-body flex-row flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl text-primary">
              ●
            </span>
            <div>
              <h2 className="font-semibold">Position on parent map</h2>
              <p className="mt-1 text-sm text-base-content/60">
                {mapPosition
                  ? `Pinned ${Math.round(mapPosition.x * 100)}% across and ${Math.round(mapPosition.y * 100)}% down on ${parent.name ?? "the parent"}.`
                  : `Choose where this location appears on ${parent.name ?? "the parent"}.`}
              </p>
            </div>
          </div>
          <Button
            type="button"
            tone={mapPosition ? "outline" : "primary"}
            onClick={() => setPinDialogOpen(true)}
          >
            {mapPosition ? "Move map pin" : "Place on parent map"}
          </Button>
        </div>
      </section>

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
            <Textarea
              autoFocus
              required
              className="min-h-56 w-full text-base leading-7"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A storm-battered port at the edge of the parent region, built around the ribs of a leviathan. Its lighthouse guild secretly controls passage through the reefs…"
            />
            <div className="card-actions items-center justify-between">
              <span className="text-xs text-base-content/50">
                Uses create-location.md + parent context
              </span>
              <Button
                type="submit"
                tone="primary"
                disabled={working || !prompt.trim()}
              >
                {working && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Generate location and map
              </Button>
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
            <Fieldset>
              <Legend>Name</Legend>
              <Input
                autoFocus
                required

                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="The Ember Coast"
              />
            </Fieldset>
            {kind === "plane" && (
              <div className="grid gap-4 rounded-box border border-primary/25 bg-primary/[0.05] p-4 sm:grid-cols-2">
                <Fieldset>
                  <Legend>Physical environment</Legend>
                  <Select
                    value={environmentKind}
                    onChange={(event) => setEnvironmentKind(event.target.value)}
                  >
                    {PHYSICAL_ENVIRONMENT_KINDS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Fieldset>
                <Fieldset>
                  <Legend>Understanding</Legend>
                  <Select
                    value={understanding}
                    onChange={(event) => setUnderstanding(event.target.value)}
                  >
                    {UNDERSTANDING_STATES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Fieldset>
                <Fieldset className="sm:col-span-2">
                  <Legend>Observed property</Legend>
                  <Textarea
                    required
                    className="min-h-24 w-full"
                    value={observedProperty}
                    onChange={(event) =>
                      setObservedProperty(event.target.value)
                    }
                    placeholder="Describe one measurable property that distinguishes this environment"
                  />
                </Fieldset>
              </div>
            )}
            <Fieldset>
              <Legend>Location type</Legend>
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {LOCATION_KINDS.map((locationKind) => (
                  <option key={locationKind} value={locationKind}>
                    {locationKind.charAt(0).toUpperCase() +
                      locationKind.slice(1)}
                  </option>
                ))}
              </Select>
            </Fieldset>
            <div className="card-actions justify-end">
              <Button
                type="submit"
                tone="primary"
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
              </Button>
            </div>
          </div>
        </form>
      )}
      {pinDialogOpen && (
        <ParentMapPinDialog
          parent={parent}
          existingChildren={existingChildren}
          label={name.trim() || "New location"}
          value={mapPosition}
          onCancel={() => setPinDialogOpen(false)}
          onConfirm={(position) => {
            setMapPosition(position);
            setPinDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function WorldEditor({ id }: { id: string }) {
  const navigate = useInternalNavigate();
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [selectedId, setSelectedId] = useState(id);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [addParentId, setAddParentId] = useState<string>();
  const [placingLocationId, setPlacingLocationId] = useState<string>();
  const [wallEditorLocationId, setWallEditorLocationId] = useState<string>();
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
    setWallEditorLocationId(undefined);
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
      await navigate("/worlds");
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
  const placingLocation = records.find(
    (record) => record.id === placingLocationId,
  );
  const wallEditorLocation = records.find(
    (record) => record.id === wallEditorLocationId,
  );
  const placementParentId = placingLocation
    ? parentIdOf(placingLocation)
    : undefined;
  const placementParent = placementParentId
    ? records.find((record) => record.id === placementParentId)
    : undefined;
  const activePath = addParent
    ? locationPath(addParent, records)
    : selected
      ? locationPath(selected, records)
      : [];

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="navbar sticky top-16 z-20 border-b border-base-300 bg-base-100/90 px-4 backdrop-blur lg:px-8">
        <div className="navbar-start gap-3">
          <RouterButtonLink href="/worlds" tone="ghost" size="sm">
            ← Worlds
          </RouterButtonLink>
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
          <StatusIndicator
            tone={
              saveState === "error"
                ? "error"
                : saveState === "saving"
                  ? "warning"
                  : saveState === "saved"
                    ? "success"
                    : "neutral"
            }
            pulse={saveState === "saving"}
            label={
              saveState === "error"
                ? "Not saved"
                : saveState === "saving"
                  ? "Saving"
                  : saveState === "saved"
                    ? "Saved"
                    : "Autosave on"
            }
          />
          <Button
            type="button"
            tone="ghost"
            size="sm"
            className="text-error hover:bg-error/10"
            disabled={!root || deleting}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete world
          </Button>
        </div>
      </div>

      <div className="min-h-[calc(100vh-4rem)] min-w-0 p-4 sm:p-6 lg:p-10">
        <div className="mx-auto grid max-w-[100rem] gap-6">
          {activePath.length > 0 && (
            <LocationBreadcrumbs path={activePath} onSelect={selectLocation} />
          )}
          {message && <Alert tone="error">{message}</Alert>}
          {addParent ? (
            <LocationCreator
              key={addParent.id}
              parent={addParent}
              existingChildren={records.filter(
                (candidate) => parentIdOf(candidate) === addParent.id,
              )}
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
                <div className="grid gap-3">
                  <Fieldset>
                    <Legend>Location type</Legend>
                    <Select
                      value={stringAt(selected.data, ["kind"])}
                      disabled={selected.id === id}
                      onChange={(event) => patch(["kind"], event.target.value)}
                    >
                      {selected.id === id && (
                        <option value="world">World</option>
                      )}
                      {LOCATION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind.charAt(0).toUpperCase() + kind.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </Fieldset>
                  {selected.id !== id && parentIdOf(selected) && (
                    <Button
                      type="button"
                      tone={mapPositionOf(selected) ? "outline" : "primary"}
                      size="sm"
                      onClick={() => setPlacingLocationId(selected.id)}
                    >
                      <span aria-hidden>●</span>
                      {mapPositionOf(selected)
                        ? "Move map pin"
                        : "Place map pin"}
                    </Button>
                  )}
                </div>
              </header>

              <LocationMap
                key={`${selected.id}:${imageData(selected).assetId}`}
                record={selected}
                childLocations={records.filter(
                  (candidate) => parentIdOf(candidate) === selected.id,
                )}
                onSelectChild={selectLocation}
                onReplace={replaceMap}
                onGenerate={createMap}
                onAltText={(value) => patch(["image", "altText"], value)}
              />

              {stringAt(selected.data, ["kind"]) === "site" && (
                <SiteWallsPanel
                  record={selected}
                  onEdit={() => setWallEditorLocationId(selected.id)}
                />
              )}

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
        <Dialog open className="modal-open">
          <div className="modal-box border border-error/30">
            <h2 className="text-xl font-bold">Delete {root.name}?</h2>
            <p className="mt-3 text-base-content/70">
              This permanently deletes the world, every nested location, every
              creature owned by it, and location connections involving them.
              This action cannot be undone.
            </p>
            <div className="modal-action">
              <Button
                type="button"
                tone="ghost"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                tone="danger"
                disabled={deleting}
                onClick={() => void removeWorld()}
              >
                {deleting && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Delete world permanently
              </Button>
            </div>
          </div>
          <ActionSurface
            type="button"
            className="modal-backdrop"
            aria-label="Cancel world deletion"
            disabled={deleting}
            onClick={() => setConfirmingDelete(false)}
          />
        </Dialog>
      )}
      {placingLocation && placementParent && (
        <ParentMapPinDialog
          parent={placementParent}
          existingChildren={records.filter(
            (candidate) =>
              parentIdOf(candidate) === placementParent.id &&
              candidate.id !== placingLocation.id,
          )}
          label={placingLocation.name ?? "Untitled location"}
          value={mapPositionOf(placingLocation)}
          onCancel={() => setPlacingLocationId(undefined)}
          onConfirm={(position) => {
            updateLocation(placingLocation.id, (data) =>
              setAt(data, ["placement", "mapPosition"], position),
            );
            setPlacingLocationId(undefined);
          }}
        />
      )}
      {wallEditorLocation &&
        stringAt(wallEditorLocation.data, ["kind"]) === "site" && (
          <SiteWallEditor
            key={wallEditorLocation.id}
            record={wallEditorLocation}
            locations={records}
            onCancel={() => setWallEditorLocationId(undefined)}
            onSave={({ walls, transitions, orientation }) => {
              updateLocation(wallEditorLocation.id, (data) => {
                const withWalls = setAt(data, ["walls"], walls);
                const withTransitions = setAt(
                  withWalls,
                  ["transitions"],
                  transitions,
                );
                return setAt(
                  withTransitions,
                  ["image", "orientation"],
                  orientation,
                );
              });
              setWallEditorLocationId(undefined);
            }}
          />
        )}
    </main>
  );
}
