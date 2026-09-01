import {
  type Dispatch,
  FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createCampaignWithAi,
  createCreatureWithAi,
  createDomainRecord,
  type DomainRecord,
  getDomainRecord,
  getMediaDownloadUrl,
  listDomainRecords,
  replaceDomainRecord,
} from "./api";
import {
  creatureTokenArtworkView,
  SESSION_CANVAS_LAYERS,
  type SessionCanvasLayerKey,
} from "./sessionCanvasModel";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SessionCanvasWorkspace,
  type CanvasDrawing,
  type CanvasLight,
  type CanvasNote,
  type CanvasSound,
  type CanvasTemplate,
  type CanvasToken,
  type CanvasWall,
} from "./SessionCanvasHarness";

type JsonObject = Record<string, unknown>;
type KnowledgeGrantKind = "rumor" | "fact" | "general-knowledge";

type EditableGrant =
  | { id: string; kind: KnowledgeGrantKind; text: string }
  | { id: string; kind: "money"; amount: string; denomination: string }
  | { id: string; kind: "item"; itemDefinitionId: string };

interface EditableDiscovery {
  id: string;
  name: string;
  locationId: string;
  grants: EditableGrant[];
}

interface Placement {
  id: string;
  sourceId: string;
  locationId: string;
  x?: number;
  y?: number;
  scale?: number;
}

interface EditableCanvasLayer {
  key: SessionCanvasLayerKey;
  visible: boolean;
  opacity: number;
}

interface EditableLocationCanvas {
  locationId: string;
  layers: EditableCanvasLayer[];
  pixelsPerFiveFeet?: number;
  lights?: CanvasLight[];
  sounds?: CanvasSound[];
  drawings?: CanvasDrawing[];
  templates?: CanvasTemplate[];
  notes?: CanvasNote[];
}

interface EditableCanvasObjects {
  lights: readonly CanvasLight[];
  sounds: readonly CanvasSound[];
  drawings: readonly CanvasDrawing[];
  templates: readonly CanvasTemplate[];
  notes: readonly CanvasNote[];
}

interface CampaignDraft {
  name: string;
  gmPremise: string;
  playerIntroduction: string;
  worldId: string;
  locationIds: string[];
  partyStartingLocationId: string;
  creaturePlacements: Placement[];
  itemPlacements: Placement[];
  objectPlacements: JsonObject[];
  discoveries: EditableDiscovery[];
  locationCanvases: EditableLocationCanvas[];
}

function SessionContextControls({
  worldId,
  campaignId,
}: {
  worldId: string;
  campaignId: string;
}) {
  const [sessions, setSessions] = useState<DomainRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listDomainRecords("sessions", {
      worldId,
      limit: 100,
      sort: "createdAt",
      order: "asc",
    }).then(
      (result) =>
        setSessions(
          result.items.filter(
            (session) => session.data.campaignId === campaignId,
          ),
        ),
      () => setMessage("Session history is unavailable."),
    );
  }, [campaignId, worldId]);

  const active = sessions.find(
    (session) => session.data.status === "in-progress",
  );

  async function startSession() {
    setBusy(true);
    setMessage("");
    const now = new Date().toISOString();
    try {
      const session = await createDomainRecord("sessions", {
        identity: {
          id: `session:${crypto.randomUUID()}`,
          version: { revision: 1, updatedAt: now },
        },
        name: `Session ${sessions.length + 1}`,
        worldId,
        campaignId,
        status: "in-progress",
        startedAt: now,
        sceneIds: [],
        encounterIds: [],
        eventIds: [],
      });
      setSessions((current) => [...current, session]);
      setMessage(`${session.name ?? "Session"} started.`);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not start session.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (!active) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await replaceDomainRecord(active, {
        ...active.data,
        status: "completed",
        endedAt: new Date().toISOString(),
      });
      setSessions((current) =>
        current.map((session) =>
          session.id === updated.id ? updated : session,
        ),
      );
      setMessage(
        `${updated.name ?? "Session"} ended. World state is unchanged.`,
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not end session.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <span className="badge badge-ghost hidden sm:inline-flex">
        {active ? `${active.name ?? "Session"} in progress` : "Authoring"}
      </span>
      <button
        type="button"
        className={`btn btn-sm ${active ? "btn-error btn-outline" : "btn-primary"}`}
        disabled={busy}
        onClick={() => void (active ? endSession() : startSession())}
      >
        {busy ? "Working…" : active ? "End session" : "Start session"}
      </button>
      {message && (
        <span
          role="status"
          className="max-w-64 truncate text-xs text-base-content/55"
        >
          {message}
        </span>
      )}
    </div>
  );
}

function LocationDetailsInspector({
  location,
  onChange,
}: {
  location: DomainRecord;
  onChange: (location: DomainRecord) => void;
}) {
  const currentDescription = stringAt(location.data.description);
  const storedOrientation = stringAt(objectAt(location.data.image).orientation);
  const currentOrientation: "scenic" | "overhead" | "side-on" =
    storedOrientation === "overhead" || storedOrientation === "side-on"
      ? storedOrientation
      : storedOrientation === "scenic"
        ? "scenic"
        : location.kind === "site"
          ? "overhead"
          : "scenic";
  const [description, setDescription] = useState(currentDescription);
  const [orientation, setOrientation] = useState(currentOrientation);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDescription(currentDescription);
    setOrientation(currentOrientation);
  }, [currentDescription, currentOrientation]);

  async function saveLocation() {
    setSaving(true);
    setMessage("");
    try {
      const updated = await replaceDomainRecord(location, {
        ...location.data,
        description: description.trim(),
        image: {
          ...objectAt(location.data.image),
          orientation,
        },
      });
      onChange(updated);
      setMessage("Location saved.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not save location.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-3">
      <label className="text-xs font-semibold tracking-[0.12em] text-base-content/55 uppercase">
        Location description
        <textarea
          className="textarea textarea-bordered mt-2 min-h-28 w-full text-sm leading-6 normal-case"
          value={description}
          placeholder="Describe what the GM needs to know about this place."
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
      </label>
      <label className="mt-3 block text-xs font-semibold tracking-[0.12em] text-base-content/55 uppercase">
        Map perspective
        <select
          className="select select-bordered mt-2 w-full text-sm font-normal normal-case"
          value={orientation}
          onChange={(event) =>
            setOrientation(
              event.currentTarget.value as "scenic" | "overhead" | "side-on",
            )
          }
        >
          <option value="overhead">Overhead</option>
          <option value="side-on">Side-on</option>
          <option value="scenic">Scenic</option>
        </select>
      </label>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span role="status" className="truncate text-xs text-base-content/50">
          {message}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={
            saving ||
            (description.trim() === currentDescription &&
              orientation === currentOrientation)
          }
          onClick={() => void saveLocation()}
        >
          {saving ? "Saving…" : "Save location"}
        </button>
      </div>
    </section>
  );
}

const SESSION_CANVAS_LAYER_KEYS = new Set(
  SESSION_CANVAS_LAYERS.map(({ key }) => key),
);

function objectAt(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringAt(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function richTextValue(value: unknown): string {
  const text = stringAt(value).trim();
  if (!text) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return sanitizeRichText(text);
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}

function sanitizeRichText(value: string): string {
  if (typeof DOMParser === "undefined") return value;
  const document = new DOMParser().parseFromString(value, "text/html");
  const allowed = new Set([
    "P",
    "DIV",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "H2",
    "H3",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "A",
  ]);
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (element.tagName !== "A" || attribute.name !== "href") {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute("href");
    }
  }
  return document.body.innerHTML;
}

function richTextPlainText(value: string): string {
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]*>/g, " ");
  return (
    new DOMParser()
      .parseFromString(value, "text/html")
      .body.textContent?.trim() ?? ""
  );
}

function objectsAt(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectAt) : [];
}

const CANVAS_RANGE_SCALE = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT);

function normalizedCoordinate(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

function normalizedRadius(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function canvasPointAt(candidate: JsonObject) {
  const position = objectAt(candidate.position);
  const x = normalizedCoordinate(position.x ?? candidate.x);
  const y = normalizedCoordinate(position.y ?? candidate.y);
  return x === undefined || y === undefined
    ? undefined
    : { x: x * CANVAS_WIDTH, y: y * CANVAS_HEIGHT };
}

function canvasRadiusAt(candidate: JsonObject, fallback: number) {
  return (
    (normalizedRadius(candidate.radius) ?? fallback / CANVAS_RANGE_SCALE) *
    CANVAS_RANGE_SCALE
  );
}

function canvasLights(value: unknown): CanvasLight[] {
  return objectsAt(value).flatMap((candidate, index) => {
    const point = canvasPointAt(candidate);
    if (!point) return [];
    return [
      {
        key:
          stringAt(candidate.id) || stringAt(candidate.key) || `light-${index}`,
        name: stringAt(candidate.name).trim() || `Light ${index + 1}`,
        ...point,
        radius: canvasRadiusAt(candidate, 180),
        color: stringAt(candidate.color).trim() || "#f6c85f",
      },
    ];
  });
}

function canvasSounds(value: unknown): CanvasSound[] {
  return objectsAt(value).flatMap((candidate, index) => {
    const point = canvasPointAt(candidate);
    if (!point) return [];
    const volume =
      typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
        ? Math.max(0, Math.min(1, candidate.volume))
        : 0.75;
    return [
      {
        key:
          stringAt(candidate.id) || stringAt(candidate.key) || `sound-${index}`,
        name: stringAt(candidate.name).trim() || `Sound ${index + 1}`,
        ...point,
        radius: canvasRadiusAt(candidate, 220),
        volume,
        volumeMode:
          candidate.volumeMode === "constant" ? "constant" : "distance",
        loop: candidate.loop !== false,
      },
    ];
  });
}

function canvasDrawings(value: unknown): CanvasDrawing[] {
  return objectsAt(value).flatMap((candidate, index) => {
    const point = canvasPointAt(candidate);
    if (!point) return [];
    return [
      {
        key:
          stringAt(candidate.id) ||
          stringAt(candidate.key) ||
          `drawing-${index}`,
        name: stringAt(candidate.name).trim() || `Drawing ${index + 1}`,
        ...point,
        radius: canvasRadiusAt(candidate, 80),
      },
    ];
  });
}

function canvasTemplates(value: unknown): CanvasTemplate[] {
  return objectsAt(value).flatMap((candidate, index) => {
    const point = canvasPointAt(candidate);
    if (!point) return [];
    return [
      {
        key:
          stringAt(candidate.id) ||
          stringAt(candidate.key) ||
          `template-${index}`,
        name: stringAt(candidate.name).trim() || `Template ${index + 1}`,
        ...point,
        radius: canvasRadiusAt(candidate, 110),
      },
    ];
  });
}

function canvasNotes(value: unknown): CanvasNote[] {
  return objectsAt(value).flatMap((candidate, index) => {
    const point = canvasPointAt(candidate);
    if (!point) return [];
    return [
      {
        key:
          stringAt(candidate.id) || stringAt(candidate.key) || `note-${index}`,
        name: stringAt(candidate.name).trim() || `Note ${index + 1}`,
        text: stringAt(candidate.text),
        ...point,
      },
    ];
  });
}

function persistedCanvasPoint(point: { x: number; y: number }) {
  return {
    x: Math.max(0, Math.min(1, point.x / CANVAS_WIDTH)),
    y: Math.max(0, Math.min(1, point.y / CANVAS_HEIGHT)),
  };
}

function persistedCanvasRadius(radius: number) {
  return Math.max(0, radius / CANVAS_RANGE_SCALE);
}

function persistedMapPosition(point: { x: number; y: number }) {
  return {
    kind: "normalized-map",
    ...persistedCanvasPoint(point),
  };
}

function persistedCanvasObjects(objects: EditableCanvasObjects) {
  return {
    lightSources: objects.lights.map((light) => ({
      id: light.key,
      name: light.name,
      position: persistedMapPosition(light),
      radius: persistedCanvasRadius(light.radius),
      color: light.color,
    })),
    soundSources: objects.sounds.map((sound) => ({
      id: sound.key,
      name: sound.name,
      position: persistedMapPosition(sound),
      radius: persistedCanvasRadius(sound.radius),
      volume: sound.volume,
      volumeMode: sound.volumeMode,
      loop: sound.loop,
    })),
    drawings: objects.drawings.map((drawing) => ({
      id: drawing.key,
      name: drawing.name?.trim() || "Drawing",
      position: persistedMapPosition(drawing),
      radius: persistedCanvasRadius(drawing.radius),
    })),
    templates: objects.templates.map((template) => ({
      id: template.key,
      name: template.name?.trim() || "Template",
      position: persistedMapPosition(template),
      radius: persistedCanvasRadius(template.radius),
    })),
    notes: objects.notes.map((note) => ({
      id: note.key,
      name: note.name,
      text: note.text,
      position: persistedMapPosition(note),
    })),
  };
}

function canvasWalls(location: DomainRecord): CanvasWall[] {
  return objectsAt(location.data.walls).flatMap((candidate, wallIndex) => {
    const kind =
      candidate.kind === "door" || candidate.kind === "invisible-wall"
        ? candidate.kind
        : "wall";
    const vertices = objectsAt(candidate.vertices).flatMap((vertex) => {
      if (
        vertex.kind !== "normalized-map" ||
        typeof vertex.x !== "number" ||
        typeof vertex.y !== "number" ||
        vertex.x < 0 ||
        vertex.x > 1 ||
        vertex.y < 0 ||
        vertex.y > 1
      ) {
        return [];
      }
      return [{ x: vertex.x * CANVAS_WIDTH, y: vertex.y * CANVAS_HEIGHT }];
    });
    const blocks = objectAt(candidate.blocks);
    const open = kind === "door" && candidate.doorState === "open";
    return vertices.slice(1).map((end, segmentIndex) => ({
      key: `${stringAt(candidate.id) || `wall-${wallIndex}`}:${segmentIndex}`,
      start: vertices[segmentIndex]!,
      end,
      kind,
      open,
      blocksSight: !open && blocks.sight !== false,
      blocksMovement: !open && blocks.movement !== false,
    }));
  });
}

function persistedWalls(walls: readonly CanvasWall[]): JsonObject[] {
  return walls.map((wall) => ({
    id: wall.key,
    kind: wall.kind,
    vertices: [wall.start, wall.end].map((vertex) => ({
      kind: "normalized-map",
      x: vertex.x / CANVAS_WIDTH,
      y: vertex.y / CANVAS_HEIGHT,
    })),
    blocks: {
      sight: wall.blocksSight,
      sound: true,
      movement: wall.blocksMovement !== false,
      environmentalEffects: true,
    },
    ...(wall.kind === "door"
      ? { doorState: wall.open ? "open" : "closed" }
      : {}),
  }));
}

function canvasTokens(
  locationId: string,
  placements: Placement[],
  creatures: DomainRecord[],
  tokenArtUrls: ReadonlyMap<string, string>,
  artworkView: "overhead" | "side-on",
): CanvasToken[] {
  return placements
    .filter((placement) => placement.locationId === locationId)
    .map((placement, index) => {
      const creature = creatures.find(
        (candidate) => candidate.id === placement.sourceId,
      );
      const name = creature?.name ?? "Unavailable creature";
      const initials =
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.at(0)?.toUpperCase())
          .join("") || "?";
      return {
        key: placement.id,
        name,
        initials,
        x:
          (placement.x ?? (420 + (index % 5) * 120) / CANVAS_WIDTH) *
          CANVAS_WIDTH,
        y:
          (placement.y ?? (360 + Math.floor(index / 5) * 120) / CANVAS_HEIGHT) *
          CANVAS_HEIGHT,
        color: "#f3c85b",
        disposition: "friendly" as const,
        vision: 360,
        artworkUrl: creature ? tokenArtUrls.get(creature.id) : undefined,
        artworkView,
        scale: placement.scale,
      };
    });
}

function mapTokenArtworkView(location: DomainRecord): "overhead" | "side-on" {
  const orientation = mapOrientation(location);
  return creatureTokenArtworkView(orientation, location.kind);
}

function mapOrientation(
  location: DomainRecord,
): "overhead" | "side-on" | "scenic" {
  const orientation = stringAt(objectAt(location.data.image).orientation);
  return orientation === "overhead" ||
    orientation === "side-on" ||
    orientation === "scenic"
    ? orientation
    : location.kind === "site"
      ? "overhead"
      : "scenic";
}

function useCreatureTokenArt(
  creatures: DomainRecord[],
  artworkView: "overhead" | "side-on",
) {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    const role =
      artworkView === "overhead" ? "overheadToken" : "paperDollToken";
    void Promise.all(
      creatures.map(async (creature) => {
        const image = objectAt(objectAt(creature.data.images)[role]);
        const directUri = stringAt(image.uri);
        const assetId = stringAt(image.assetId);
        if (!assetId) return [creature.id, directUri] as const;
        try {
          const result = await getMediaDownloadUrl(assetId);
          return [creature.id, result.url] as const;
        } catch {
          return [creature.id, directUri] as const;
        }
      }),
    ).then((entries) => {
      if (active) setUrls(new Map(entries.filter(([, url]) => Boolean(url))));
    });
    return () => {
      active = false;
    };
  }, [artworkView, creatures]);

  return urls;
}

function parentLocationId(record: DomainRecord): string | undefined {
  const placement = objectAt(record.data.placement);
  return placement.kind === "within-parent" &&
    typeof placement.parentLocationId === "string"
    ? placement.parentLocationId
    : undefined;
}

function locationsInWorld(
  worldId: string,
  locations: DomainRecord[],
): DomainRecord[] {
  if (!worldId) return [];
  const included = new Set([worldId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const location of locations) {
      const parentId = parentLocationId(location);
      if (parentId && included.has(parentId) && !included.has(location.id)) {
        included.add(location.id);
        changed = true;
      }
    }
  }
  return locations.filter((location) => included.has(location.id));
}

function locationLabel(record: DomainRecord, locations: DomainRecord[]) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current: DomainRecord | undefined = record;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name ?? "Unnamed location");
    const parentId = parentLocationId(current);
    current = parentId ? byId.get(parentId) : undefined;
  }
  return names.join(" / ");
}

function locationPath(
  record: DomainRecord,
  locations: DomainRecord[],
): DomainRecord[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const path: DomainRecord[] = [];
  const visited = new Set<string>();
  let current: DomainRecord | undefined = record;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    const parentId = parentLocationId(current);
    current = parentId ? byId.get(parentId) : undefined;
  }
  return path;
}

function parseGrant(value: JsonObject): EditableGrant | undefined {
  const id = stringAt(value.id) || crypto.randomUUID();
  if (
    value.kind === "rumor" ||
    value.kind === "fact" ||
    value.kind === "general-knowledge"
  ) {
    return { id, kind: value.kind, text: stringAt(value.text) };
  }
  if (value.kind === "money") {
    const money = objectAt(value.value);
    return {
      id,
      kind: "money",
      amount: typeof money.amount === "number" ? String(money.amount) : "",
      denomination: stringAt(money.denomination),
    };
  }
  if (value.kind === "item") {
    return {
      id,
      kind: "item",
      itemDefinitionId: stringAt(value.itemDefinitionId),
    };
  }
  return undefined;
}

function draftFrom(record: DomainRecord): CampaignDraft {
  const partyStartingLocationId = stringAt(record.data.partyStartingLocationId);
  const creaturePlacements = objectsAt(record.data.creaturePlacements).map(
    (placement) => {
      const mapPosition = objectAt(placement.mapPosition);
      const x = normalizedCoordinate(mapPosition.x ?? placement.x);
      const y = normalizedCoordinate(mapPosition.y ?? placement.y);
      const scale =
        typeof placement.scale === "number" &&
        Number.isFinite(placement.scale) &&
        placement.scale > 0
          ? placement.scale
          : undefined;
      return {
        id: stringAt(placement.id) || crypto.randomUUID(),
        sourceId: stringAt(placement.creatureId),
        locationId: stringAt(placement.locationId),
        ...(x === undefined ? {} : { x }),
        ...(y === undefined ? {} : { y }),
        ...(scale === undefined ? {} : { scale }),
      };
    },
  );
  const itemPlacements = objectsAt(record.data.itemPlacements).map(
    (placement) => ({
      id: stringAt(placement.id) || crypto.randomUUID(),
      sourceId: stringAt(placement.itemDefinitionId),
      locationId: stringAt(placement.locationId),
    }),
  );
  const objectPlacements = objectsAt(record.data.objectPlacements);
  const discoveries = objectsAt(record.data.discoveries).map((discovery) => ({
    id: stringAt(discovery.id) || crypto.randomUUID(),
    name: stringAt(discovery.name),
    locationId: stringAt(discovery.locationId),
    grants: objectsAt(discovery.grants)
      .map(parseGrant)
      .filter((grant): grant is EditableGrant => grant !== undefined),
  }));
  const explicitLocationIds = Array.isArray(record.data.locationIds)
    ? record.data.locationIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const locationCanvases = objectsAt(record.data.locationCanvases).flatMap(
    (canvas): EditableLocationCanvas[] => {
      const locationId = stringAt(canvas.locationId);
      if (!locationId) return [];
      const layers = objectsAt(canvas.layers).flatMap(
        (layer): EditableCanvasLayer[] => {
          const key = stringAt(layer.key) as SessionCanvasLayerKey;
          if (!SESSION_CANVAS_LAYER_KEYS.has(key)) return [];
          const opacity =
            typeof layer.opacity === "number" && Number.isFinite(layer.opacity)
              ? Math.max(0, Math.min(1, layer.opacity))
              : 1;
          return [
            {
              key,
              visible: layer.visible !== false,
              opacity,
            },
          ];
        },
      );
      return [
        {
          locationId,
          layers: [
            ...new Map(layers.map((layer) => [layer.key, layer])).values(),
          ],
          pixelsPerFiveFeet:
            typeof canvas.pixelsPerFiveFeet === "number" &&
            Number.isFinite(canvas.pixelsPerFiveFeet) &&
            canvas.pixelsPerFiveFeet > 0
              ? canvas.pixelsPerFiveFeet
              : undefined,
          lights: canvasLights(canvas.lightSources ?? canvas.lights),
          sounds: canvasSounds(canvas.soundSources ?? canvas.sounds),
          drawings: canvasDrawings(canvas.drawings),
          templates: canvasTemplates(canvas.templates),
          notes: canvasNotes(canvas.notes),
        },
      ];
    },
  );
  const locationIds = [
    ...new Set(
      [
        ...explicitLocationIds,
        partyStartingLocationId,
        ...creaturePlacements.map((placement) => placement.locationId),
        ...itemPlacements.map((placement) => placement.locationId),
        ...objectPlacements.map((placement) => stringAt(placement.locationId)),
        ...discoveries.map((discovery) => discovery.locationId),
      ].filter(Boolean),
    ),
  ];
  const locationCanvasesByLocation = new Map(
    locationCanvases
      .filter((canvas) => locationIds.includes(canvas.locationId))
      .map((canvas) => [canvas.locationId, canvas]),
  );

  return {
    name: stringAt(record.data.name),
    gmPremise: richTextValue(record.data.gmPremise),
    playerIntroduction: richTextValue(record.data.playerIntroduction),
    worldId: stringAt(record.data.worldId),
    locationIds,
    partyStartingLocationId,
    creaturePlacements,
    itemPlacements,
    objectPlacements,
    discoveries,
    locationCanvases: [...locationCanvasesByLocation.values()],
  };
}

function dataFrom(record: DomainRecord, draft: CampaignDraft): JsonObject {
  const identity = objectAt(record.data.identity);
  return {
    ...record.data,
    identity: {
      ...identity,
      version: {
        revision: record.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    },
    name: draft.name.trim(),
    worldId: draft.worldId,
    gmPremise: sanitizeRichText(draft.gmPremise),
    playerIntroduction: sanitizeRichText(draft.playerIntroduction),
    locationIds: draft.locationIds,
    partyStartingLocationId: draft.partyStartingLocationId,
    creaturePlacements: draft.creaturePlacements.map((placement) => ({
      id: placement.id,
      creatureId: placement.sourceId,
      locationId: placement.locationId,
      ...(placement.x === undefined || placement.y === undefined
        ? {}
        : {
            mapPosition: {
              kind: "normalized-map",
              x: placement.x,
              y: placement.y,
            },
          }),
      ...(placement.scale === undefined ? {} : { scale: placement.scale }),
    })),
    itemPlacements: draft.itemPlacements.map((placement) => ({
      id: placement.id,
      itemDefinitionId: placement.sourceId,
      locationId: placement.locationId,
    })),
    objectPlacements: draft.objectPlacements,
    locationCanvases: draft.locationCanvases.map((canvas) => ({
      locationId: canvas.locationId,
      layers: canvas.layers.map((layer) => ({ ...layer })),
      ...(canvas.pixelsPerFiveFeet === undefined
        ? {}
        : { pixelsPerFiveFeet: canvas.pixelsPerFiveFeet }),
      ...persistedCanvasObjects({
        lights: canvas.lights ?? [],
        sounds: canvas.sounds ?? [],
        drawings: canvas.drawings ?? [],
        templates: canvas.templates ?? [],
        notes: canvas.notes ?? [],
      }),
    })),
    discoveries: draft.discoveries.map((discovery) => ({
      id: discovery.id,
      name: discovery.name.trim(),
      locationId: discovery.locationId,
      grants: discovery.grants.map((grant) => {
        if (grant.kind === "money") {
          return {
            kind: grant.kind,
            value: {
              amount: Number(grant.amount),
              denomination: grant.denomination.trim(),
            },
          };
        }
        if (grant.kind === "item") {
          return {
            kind: grant.kind,
            itemDefinitionId: grant.itemDefinitionId,
          };
        }
        return { kind: grant.kind, text: grant.text.trim() };
      }),
    })),
  };
}

function FieldLabel({ children }: { children: string }) {
  return <span className="block text-sm font-medium">{children}</span>;
}

function RichTextEditor({
  label,
  help,
  value,
  placeholder,
  onChange,
  tone = "default",
}: {
  label: string;
  help: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  tone?: "default" | "protected";
}) {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor.current || document.activeElement === editor.current) return;
    const sanitized = sanitizeRichText(value);
    if (editor.current.innerHTML !== sanitized) {
      editor.current.innerHTML = sanitized;
    }
  }, [value]);

  function command(name: string, argument?: string) {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    if (editor.current) onChange(editor.current.innerHTML);
  }

  const toolbar = [
    { label: "Bold", icon: "B", command: "bold" },
    { label: "Italic", icon: "I", command: "italic" },
    { label: "Heading", icon: "H2", command: "formatBlock", value: "h2" },
    {
      label: "Bulleted list",
      icon: "• List",
      command: "insertUnorderedList",
    },
    {
      label: "Numbered list",
      icon: "1. List",
      command: "insertOrderedList",
    },
    { label: "Quote", icon: "❝", command: "formatBlock", value: "blockquote" },
  ] as const;

  return (
    <div className="form-control">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <FieldLabel>{label}</FieldLabel>
          <p className="mt-1 text-xs leading-5 text-base-content/50">{help}</p>
        </div>
        {tone === "protected" && (
          <span className="badge badge-warning badge-outline gap-1.5">
            <span aria-hidden>◉</span> GM only
          </span>
        )}
      </div>
      <div className="mt-3 overflow-hidden rounded-box border border-base-300 bg-base-100 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex flex-wrap gap-1 border-b border-base-300 bg-base-200/70 p-2"
        >
          {toolbar.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`btn btn-ghost btn-xs ${item.command === "italic" ? "italic" : ""}`}
              aria-label={item.label}
              title={item.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                command(item.command, "value" in item ? item.value : undefined)
              }
            >
              {item.icon}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-base-300" aria-hidden />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command("removeFormat")}
          >
            Clear style
          </button>
        </div>
        <div className="relative">
          {!richTextPlainText(value) && (
            <p className="pointer-events-none absolute top-4 left-5 text-sm text-base-content/35">
              {placeholder}
            </p>
          )}
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={label}
            aria-multiline="true"
            className="campaign-rich-text min-h-52 px-5 py-4 text-[1.143333rem] leading-7 outline-none"
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            onBlur={(event) =>
              onChange(sanitizeRichText(event.currentTarget.innerHTML))
            }
          />
        </div>
      </div>
    </div>
  );
}

function useLocationMapUrl(location?: DomainRecord) {
  const image = objectAt(location?.data.image);
  const assetId = stringAt(image.assetId);
  const directUri = stringAt(image.uri);
  const [url, setUrl] = useState(directUri);

  useEffect(() => {
    setUrl(directUri);
    if (!assetId) return;
    let active = true;
    void getMediaDownloadUrl(assetId).then(
      (result) => {
        if (active) setUrl(result.url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [assetId, directUri]);

  return url;
}

function CampaignHeader({
  name,
  saving,
  compact = false,
}: {
  name: string;
  saving: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-4">
        <div className="min-w-0">
          <a href="/campaigns" className="text-sm text-primary">
            ← Campaigns
          </a>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Campaign studio
            </p>
            <span className="text-base-content/25">·</span>
            <h1 className="truncate text-xl font-semibold">
              {name || "New campaign"}
            </h1>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-sm">
          {saving ? "Saving…" : "Save campaign"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-base-300 pb-8">
      <div className="max-w-3xl">
        <a href="/campaigns" className="text-sm text-amber-300">
          ← Back to campaigns
        </a>
        <div className="mt-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            ✦
          </span>
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Campaign studio
          </p>
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {name || "New campaign"}
        </h1>
        <p className="mt-3 text-base leading-7 text-base-content/55">
          Review the generated foundation, refine the details, and make it yours
          before the first session.
        </p>
      </div>
      <button className="btn btn-primary btn-lg" disabled={saving}>
        {saving ? "Saving…" : "Save campaign"}
      </button>
    </div>
  );
}

function OverviewFields({
  draft,
  setDraft,
}: {
  draft: CampaignDraft;
  setDraft: Dispatch<SetStateAction<CampaignDraft>>;
}) {
  return (
    <section className="card overflow-hidden border border-base-300 bg-base-200 shadow-xl">
      <div className="h-1 bg-gradient-to-r from-primary via-secondary to-transparent" />
      <div className="card-body grid gap-7 p-6 md:p-8 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Narrative foundation
          </p>
          <h2 className="card-title mt-2 text-2xl">Campaign overview</h2>
          <p className="mt-1 text-sm leading-6 text-base-content/60">
            Polish the generated starting point. The protected premise and
            player introduction remain separate by design.
          </p>
        </div>
        <label className="form-control xl:col-span-2">
          <FieldLabel>Campaign name</FieldLabel>
          <input
            className="input input-bordered mt-2"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            placeholder="The Hound of Greybridge"
          />
        </label>
        <RichTextEditor
          label="GM premise"
          help="Protected context, tensions, people, and circumstances for the GM."
          value={draft.gmPremise}
          tone="protected"
          onChange={(gmPremise) => setDraft({ ...draft, gmPremise })}
          placeholder="Describe the starting situation, important tensions, and protected context."
        />
        <RichTextEditor
          label="Player introduction"
          help="A polished, spoiler-safe introduction the GM can share at session zero."
          value={draft.playerIntroduction}
          onChange={(playerIntroduction) =>
            setDraft({ ...draft, playerIntroduction })
          }
          placeholder="Write the safe introduction the GM can share at session zero."
        />
      </div>
    </section>
  );
}

type VisualRecordKind = "creature" | "item";

function visualRecordDetails(record: DomainRecord, kind: VisualRecordKind) {
  const identity = objectAt(record.data.identity);
  const image =
    kind === "creature"
      ? objectAt(objectAt(record.data.images).portrait)
      : objectAt(record.data.image);
  return {
    name:
      stringAt(identity.name) ||
      record.name ||
      (kind === "creature" ? "Unnamed creature" : "Unnamed item"),
    description:
      stringAt(identity.description) ||
      stringAt(record.data.description) ||
      `No ${kind} description available.`,
    image,
  };
}

function VisualRecordThumbnail({
  record,
  kind,
}: {
  record: DomainRecord;
  kind: VisualRecordKind;
}) {
  const { name, image } = visualRecordDetails(record, kind);
  const assetId = stringAt(image.assetId);
  const directUri = stringAt(image.uri);
  const [url, setUrl] = useState(directUri);

  useEffect(() => {
    let active = true;
    if (!assetId) {
      setUrl(directUri);
      return () => {
        active = false;
      };
    }
    void getMediaDownloadUrl(assetId).then(
      (result) => {
        if (active) setUrl(result.url);
      },
      () => {
        if (active) setUrl(directUri);
      },
    );
    return () => {
      active = false;
    };
  }, [assetId, directUri]);

  return url ? (
    <img
      src={url}
      alt={stringAt(image.altText) || `${kind} view of ${name}`}
      className={`h-full w-full ${
        kind === "creature" ? "object-cover object-top" : "object-contain p-1"
      }`}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-base-300 text-2xl text-base-content/30">
      {kind === "creature" ? "◈" : "◇"}
    </span>
  );
}

function VisualRecordCard({
  record,
  kind,
}: {
  record: DomainRecord;
  kind: VisualRecordKind;
}) {
  const details = visualRecordDetails(record, kind);
  return (
    <span className="flex min-w-0 items-stretch overflow-hidden rounded-box border border-base-300 bg-base-100 text-left shadow-sm">
      <span className="h-24 w-24 shrink-0 overflow-hidden bg-base-300">
        <VisualRecordThumbnail record={record} kind={kind} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
        <span className="truncate font-semibold">{details.name}</span>
        <span className="mt-1 line-clamp-2 text-sm leading-5 text-base-content/55">
          {richTextPlainText(details.description)}
        </span>
      </span>
    </span>
  );
}

function VisualRecordPicker({
  records,
  value,
  kind,
  onChange,
  placeholder,
}: {
  records: DomainRecord[];
  value: string;
  kind: VisualRecordKind;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = records.find((record) => record.id === value);
  return (
    <details ref={detailsRef} className="dropdown w-full">
      <summary className="block cursor-pointer list-none rounded-box outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {selected ? (
          <VisualRecordCard record={selected} kind={kind} />
        ) : (
          <span className="flex min-h-24 items-center rounded-box border border-dashed border-base-300 bg-base-100 px-4 text-base-content/55">
            {placeholder}
          </span>
        )}
      </summary>
      <div
        role="listbox"
        className="dropdown-content z-30 mt-2 grid max-h-96 w-full min-w-80 gap-2 overflow-y-auto rounded-box border border-base-300 bg-base-200 p-2 shadow-2xl"
      >
        {records.map((record) => (
          <button
            key={record.id}
            type="button"
            role="option"
            aria-selected={record.id === value}
            className={`rounded-box transition hover:ring-2 hover:ring-primary/40 ${record.id === value ? "ring-2 ring-primary" : ""}`}
            onClick={() => {
              onChange(record.id);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <VisualRecordCard record={record} kind={kind} />
          </button>
        ))}
      </div>
    </details>
  );
}

function PlacementSection({
  title,
  help,
  sourceLabel,
  sources,
  locationId,
  placements,
  onChange,
  onCreateWithAi,
}: {
  title: string;
  help: string;
  sourceLabel: string;
  sources: DomainRecord[];
  locationId: string;
  placements: Placement[];
  onChange: (placements: Placement[]) => void;
  onCreateWithAi?: (prompt: string) => Promise<DomainRecord>;
}) {
  const [editingPlacementId, setEditingPlacementId] = useState<
    string | "new"
  >();
  const [aiPrompt, setAiPrompt] = useState("");
  const [creatingWithAi, setCreatingWithAi] = useState(false);
  const [creationMessage, setCreationMessage] = useState("");
  const kind: VisualRecordKind = sourceLabel.startsWith("Creature")
    ? "creature"
    : "item";
  const locationPlacements = placements.filter(
    (placement) => placement.locationId === locationId,
  );

  async function createAndPlace() {
    if (!onCreateWithAi || creatingWithAi || aiPrompt.trim().length < 3) return;
    setCreatingWithAi(true);
    setCreationMessage("");
    try {
      const created = await onCreateWithAi(aiPrompt.trim());
      onChange([
        ...placements,
        {
          id: crypto.randomUUID(),
          sourceId: created.id,
          locationId,
        },
      ]);
      setAiPrompt("");
      setEditingPlacementId(undefined);
    } catch (caught) {
      setCreationMessage(
        caught instanceof Error
          ? caught.message
          : `Could not create ${sourceLabel.toLowerCase()}`,
      );
    } finally {
      setCreatingWithAi(false);
    }
  }

  return (
    <section className="card border border-base-300 bg-base-200 shadow-sm">
      <div className="card-body gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="card-title">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/60">
              {help}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onCreateWithAi && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEditingPlacementId("ai")}
              >
                ✦ Create with AI
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={sources.length === 0}
              onClick={() => setEditingPlacementId("new")}
            >
              + Add existing
            </button>
          </div>
        </div>
        {sources.length === 0 && (
          <p className="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/55">
            This world has no available {sourceLabel.toLowerCase()} records yet.
          </p>
        )}
        <div className="grid gap-3 xl:grid-cols-2">
          {editingPlacementId === "ai" && onCreateWithAi && (
            <div className="rounded-box border border-primary/30 bg-primary/[0.06] p-3 xl:col-span-2">
              <label
                className="text-sm font-semibold"
                htmlFor="ai-creature-prompt"
              >
                Create and place a new {sourceLabel.toLowerCase()}
              </label>
              <p className="mt-1 text-xs leading-5 text-base-content/55">
                The current location is included as context. The new creature is
                added here without leaving the workspace.
              </p>
              <textarea
                id="ai-creature-prompt"
                className="textarea textarea-bordered mt-3 min-h-24 w-full"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.currentTarget.value)}
                placeholder="A wary tunnel scavenger adapted to this location…"
              />
              {creationMessage && (
                <p role="alert" className="mt-2 text-xs text-error">
                  {creationMessage}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingPlacementId(undefined)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={creatingWithAi || aiPrompt.trim().length < 3}
                  onClick={() => void createAndPlace()}
                >
                  {creatingWithAi ? "Creating…" : "Create and place"}
                </button>
              </div>
            </div>
          )}
          {editingPlacementId === "new" && (
            <div className="rounded-box border border-primary/30 bg-primary/[0.06] p-3">
              <p className="mb-2 text-sm font-semibold">
                Choose {sourceLabel.toLowerCase()}
              </p>
              <VisualRecordPicker
                records={sources}
                value=""
                kind={kind}
                placeholder={`Choose ${sourceLabel.toLowerCase()}`}
                onChange={(sourceId) => {
                  onChange([
                    ...placements,
                    { id: crypto.randomUUID(), sourceId, locationId },
                  ]);
                  setEditingPlacementId(undefined);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-2"
                onClick={() => setEditingPlacementId(undefined)}
              >
                Cancel
              </button>
            </div>
          )}
          {locationPlacements.map((placement) => {
            const source = sources.find(
              (candidate) => candidate.id === placement.sourceId,
            );
            const editing = editingPlacementId === placement.id;
            return editing ? (
              <div
                key={placement.id}
                className="rounded-box border border-primary/30 bg-primary/[0.06] p-3"
              >
                <VisualRecordPicker
                  records={sources}
                  value={placement.sourceId}
                  kind={kind}
                  placeholder={`Choose ${sourceLabel.toLowerCase()}`}
                  onChange={(sourceId) =>
                    onChange(
                      placements.map((candidate) =>
                        candidate.id === placement.id
                          ? { ...candidate, sourceId }
                          : candidate,
                      ),
                    )
                  }
                />
                <div className="mt-2 flex justify-between gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => {
                      onChange(
                        placements.filter(
                          (candidate) => candidate.id !== placement.id,
                        ),
                      );
                      setEditingPlacementId(undefined);
                    }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setEditingPlacementId(undefined)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <button
                key={placement.id}
                type="button"
                className="rounded-box text-left transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40"
                onClick={() => setEditingPlacementId(placement.id)}
              >
                {source ? (
                  <VisualRecordCard record={source} kind={kind} />
                ) : (
                  <span className="flex min-h-24 items-center rounded-box border border-base-300 bg-base-100 px-4 text-base-content/55">
                    Unavailable {sourceLabel.toLowerCase()}
                  </span>
                )}
              </button>
            );
          })}
          {locationPlacements.length === 0 && sources.length > 0 && (
            <p className="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/55">
              No {sourceLabel.toLowerCase()} placements at this location.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const GRANT_PRESENTATION: Record<
  EditableGrant["kind"],
  { icon: string; label: string }
> = {
  rumor: { icon: "◌", label: "Rumor" },
  fact: { icon: "◆", label: "Fact" },
  "general-knowledge": { icon: "◎", label: "General knowledge" },
  money: { icon: "¤", label: "Money" },
  item: { icon: "◇", label: "Item" },
};

function DiscoverySection({
  discoveries,
  locationId,
  items,
  onChange,
}: {
  discoveries: EditableDiscovery[];
  locationId: string;
  items: DomainRecord[];
  onChange: (discoveries: EditableDiscovery[]) => void;
}) {
  const [editingDiscoveryId, setEditingDiscoveryId] = useState<string>();
  const locationDiscoveries = discoveries.filter(
    (discovery) => discovery.locationId === locationId,
  );

  function updateDiscovery(
    id: string,
    transform: (discovery: EditableDiscovery) => EditableDiscovery,
  ) {
    onChange(
      discoveries.map((discovery) =>
        discovery.id === id ? transform(discovery) : discovery,
      ),
    );
  }

  function addDiscovery() {
    const id = crypto.randomUUID();
    onChange([...discoveries, { id, name: "", locationId, grants: [] }]);
    setEditingDiscoveryId(id);
  }

  function addGrant(discovery: EditableDiscovery, kind: EditableGrant["kind"]) {
    const id = crypto.randomUUID();
    const grant: EditableGrant =
      kind === "money"
        ? { id, kind, amount: "", denomination: "" }
        : kind === "item"
          ? { id, kind, itemDefinitionId: "" }
          : { id, kind, text: "" };
    updateDiscovery(discovery.id, (current) => ({
      ...current,
      grants: [...current.grants, grant],
    }));
  }

  function grantSummary(grant: EditableGrant) {
    if (grant.kind === "money") {
      return (
        [grant.amount, grant.denomination].filter(Boolean).join(" ") ||
        "Not configured"
      );
    }
    if (grant.kind === "item") {
      return (
        items.find((item) => item.id === grant.itemDefinitionId)?.name ??
        "Choose an item"
      );
    }
    return grant.text || "No text yet";
  }

  return (
    <section className="card border border-base-300 bg-base-200 shadow-sm">
      <div className="card-body gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="card-title">Location discoveries</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/60">
              Author what the GM may reveal or award. Reaching a location does
              not reveal anything automatically.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={addDiscovery}
          >
            + Add discovery
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {locationDiscoveries.map((discovery) => {
            const editing = editingDiscoveryId === discovery.id;
            if (!editing) {
              return (
                <button
                  key={discovery.id}
                  type="button"
                  className="card border border-base-300 bg-base-100 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                  onClick={() => setEditingDiscoveryId(discovery.id)}
                >
                  <span className="card-body gap-4 p-5">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold">
                        {discovery.name || "Untitled discovery"}
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        Edit →
                      </span>
                    </span>
                    <span className="grid gap-2">
                      {discovery.grants.map((grant) => (
                        <span
                          key={grant.id}
                          className="flex min-w-0 gap-3 rounded-box border border-base-300 bg-base-200/70 p-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-lg text-primary">
                            {GRANT_PRESENTATION[grant.kind].icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold tracking-wide text-base-content/50 uppercase">
                              {GRANT_PRESENTATION[grant.kind].label}
                            </span>
                            <span className="mt-1 block text-sm leading-6 whitespace-pre-wrap text-base-content/75">
                              {grantSummary(grant)}
                            </span>
                          </span>
                        </span>
                      ))}
                      {discovery.grants.length === 0 && (
                        <span className="text-sm text-base-content/45">
                          No discovery elements yet.
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            }

            return (
              <article
                key={discovery.id}
                className="card border border-primary/30 bg-primary/[0.06] shadow-lg xl:col-span-2"
              >
                <div className="card-body gap-5 p-5">
                  <label className="block">
                    <span className="block text-sm font-semibold">
                      Discovery name
                    </span>
                    <input
                      autoFocus
                      className="input input-bordered mt-2 w-full bg-base-100"
                      value={discovery.name}
                      placeholder="The constable's ledger"
                      onChange={(event) =>
                        updateDiscovery(discovery.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="grid gap-3">
                    {discovery.grants.map((grant) => (
                      <div
                        key={grant.id}
                        className="rounded-box border border-base-300 bg-base-100 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-3 font-semibold">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-lg text-primary">
                              {GRANT_PRESENTATION[grant.kind].icon}
                            </span>
                            {GRANT_PRESENTATION[grant.kind].label}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() =>
                              updateDiscovery(discovery.id, (current) => ({
                                ...current,
                                grants: current.grants.filter(
                                  (candidate) => candidate.id !== grant.id,
                                ),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        {grant.kind === "money" ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="block text-sm font-medium">
                                Amount
                              </span>
                              <input
                                type="number"
                                min="0"
                                className="input input-bordered mt-2 w-full"
                                value={grant.amount}
                                onChange={(event) =>
                                  updateDiscovery(discovery.id, (current) => ({
                                    ...current,
                                    grants: current.grants.map((candidate) =>
                                      candidate.id === grant.id &&
                                      candidate.kind === "money"
                                        ? {
                                            ...candidate,
                                            amount: event.target.value,
                                          }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="block text-sm font-medium">
                                World currency
                              </span>
                              <input
                                className="input input-bordered mt-2 w-full"
                                value={grant.denomination}
                                onChange={(event) =>
                                  updateDiscovery(discovery.id, (current) => ({
                                    ...current,
                                    grants: current.grants.map((candidate) =>
                                      candidate.id === grant.id &&
                                      candidate.kind === "money"
                                        ? {
                                            ...candidate,
                                            denomination: event.target.value,
                                          }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        ) : grant.kind === "item" ? (
                          <VisualRecordPicker
                            records={items}
                            value={grant.itemDefinitionId}
                            kind="item"
                            placeholder="Choose item reward"
                            onChange={(itemDefinitionId) =>
                              updateDiscovery(discovery.id, (current) => ({
                                ...current,
                                grants: current.grants.map((candidate) =>
                                  candidate.id === grant.id &&
                                  candidate.kind === "item"
                                    ? { ...candidate, itemDefinitionId }
                                    : candidate,
                                ),
                              }))
                            }
                          />
                        ) : (
                          <label className="block">
                            <span className="block text-sm font-medium">
                              {GRANT_PRESENTATION[grant.kind].label} text
                            </span>
                            <textarea
                              className="textarea textarea-bordered mt-2 min-h-24 w-full resize-y leading-6"
                              placeholder={`Write the ${GRANT_PRESENTATION[grant.kind].label.toLowerCase()}`}
                              value={grant.text}
                              onChange={(event) =>
                                updateDiscovery(discovery.id, (current) => ({
                                  ...current,
                                  grants: current.grants.map((candidate) =>
                                    candidate.id === grant.id &&
                                    candidate.kind === grant.kind
                                      ? {
                                          ...candidate,
                                          text: event.target.value,
                                        }
                                      : candidate,
                                  ),
                                }))
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        "rumor",
                        "fact",
                        "general-knowledge",
                        "money",
                        "item",
                      ] as const
                    ).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => addGrant(discovery, kind)}
                      >
                        <span aria-hidden>{GRANT_PRESENTATION[kind].icon}</span>
                        Add {GRANT_PRESENTATION[kind].label.toLowerCase()}
                      </button>
                    ))}
                  </div>

                  <div className="card-actions justify-between">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => {
                        onChange(
                          discoveries.filter(
                            (candidate) => candidate.id !== discovery.id,
                          ),
                        );
                        setEditingDiscoveryId(undefined);
                      }}
                    >
                      Remove discovery
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setEditingDiscoveryId(undefined)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {locationDiscoveries.length === 0 && (
          <p className="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/55">
            No discoveries at this location.
          </p>
        )}
      </div>
    </section>
  );
}

function CampaignLocationsWorkspace({
  campaignRecord,
  campaignId,
  draft,
  setDraft,
  locations,
  allLocations,
  onLocationsChange,
  creatures,
  onCreaturesChange,
  onCampaignRecordChange,
  items,
  saving,
  saveMessage,
}: {
  campaignRecord: DomainRecord;
  campaignId: string;
  draft: CampaignDraft;
  setDraft: Dispatch<SetStateAction<CampaignDraft>>;
  locations: DomainRecord[];
  allLocations: DomainRecord[];
  onLocationsChange: (locations: DomainRecord[]) => void;
  creatures: DomainRecord[];
  onCreaturesChange: (creatures: DomainRecord[]) => void;
  onCampaignRecordChange: (record: DomainRecord) => void;
  items: DomainRecord[];
  saving: boolean;
  saveMessage: string;
}) {
  const campaignRecordRef = useRef(campaignRecord);
  campaignRecordRef.current = campaignRecord;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | undefined
  >(draft.partyStartingLocationId);
  const [locationSaveMessage, setLocationSaveMessage] = useState("");
  // A campaign now operates across its whole world. Locations are not copied
  // into a second campaign-specific silo; the campaign only stores contextual
  // state attached to the authoritative world locations.
  const includedLocations = locations
    .filter((location) => location.id !== draft.worldId)
    .sort((left, right) =>
      locationLabel(left, allLocations).localeCompare(
        locationLabel(right, allLocations),
      ),
    );
  const selectedLocation = includedLocations.find(
    (location) => location.id === selectedLocationId,
  );
  const selectedMapUrl = useLocationMapUrl(selectedLocation);
  const tokenArtworkView = selectedLocation
    ? mapTokenArtworkView(selectedLocation)
    : "overhead";
  const creatureTokenArt = useCreatureTokenArt(creatures, tokenArtworkView);

  function openLocation(locationId: string) {
    setSelectedLocationId(locationId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!selectedLocation) {
    return (
      <section className="grid gap-6">
        <div className="border-b border-base-300 pb-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Campaign locations
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              World locations
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/60">
              Every location belongs to the same persistent world. Open one to
              inspect, author, or run play there.
            </p>
          </div>
        </div>

        {includedLocations.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {includedLocations.map((location) => {
              const discoveryCount = draft.discoveries.filter(
                (discovery) => discovery.locationId === location.id,
              ).length;
              const placementCount =
                draft.creaturePlacements.filter(
                  (placement) => placement.locationId === location.id,
                ).length +
                draft.itemPlacements.filter(
                  (placement) => placement.locationId === location.id,
                ).length +
                draft.objectPlacements.filter(
                  (placement) => stringAt(placement.locationId) === location.id,
                ).length;
              return (
                <button
                  key={location.id}
                  type="button"
                  className="card border border-base-300 bg-base-200 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                  onClick={() => openLocation(location.id)}
                >
                  <span className="card-body gap-3 p-5">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">
                        {location.name ?? "Untitled location"}
                      </span>
                      {location.id === draft.partyStartingLocationId && (
                        <span className="badge badge-primary badge-sm shrink-0">
                          Party start
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-1 text-xs text-base-content/50">
                      {locationLabel(location, allLocations)}
                    </span>
                    <span className="flex flex-wrap gap-2 text-xs text-base-content/60">
                      <span>{discoveryCount} discoveries</span>
                      <span aria-hidden="true">·</span>
                      <span>{placementCount} placements</span>
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      Manage location →
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-box border border-dashed border-base-300 bg-base-200/50 px-6 py-14 text-center">
            <h3 className="font-semibold">No campaign locations yet</h3>
            <p className="mt-2 text-sm text-base-content/55">
              Add a location from the world definition to begin planning it.
            </p>
          </div>
        )}
      </section>
    );
  }

  const selectedPath = locationPath(selectedLocation, allLocations);
  const currentLocation = selectedLocation;
  const activeLocationId = selectedLocation.id;
  const selectedObjectCount = draft.objectPlacements.filter(
    (placement) => stringAt(placement.locationId) === selectedLocation.id,
  ).length;
  const selectedCanvas = draft.locationCanvases.find(
    (canvas) => canvas.locationId === selectedLocation.id,
  );
  const selectedCreatureCount = draft.creaturePlacements.filter(
    (placement) => placement.locationId === selectedLocation.id,
  ).length;
  const selectedItemCount = draft.itemPlacements.filter(
    (placement) => placement.locationId === selectedLocation.id,
  ).length;
  const selectedDiscoveryCount = draft.discoveries.filter(
    (discovery) => discovery.locationId === selectedLocation.id,
  ).length;
  const selectedWalls = canvasWalls(selectedLocation);
  const selectedTokens = canvasTokens(
    activeLocationId,
    draft.creaturePlacements,
    creatures,
    creatureTokenArt,
    tokenArtworkView,
  );

  function updateSelectedCanvas(configuration: EditableLocationCanvas) {
    setDraft((current) => {
      const existing = current.locationCanvases.find(
        (canvas) => canvas.locationId === activeLocationId,
      );
      return {
        ...current,
        locationCanvases: [
          ...current.locationCanvases.filter(
            (canvas) => canvas.locationId !== activeLocationId,
          ),
          { ...existing, ...configuration, locationId: activeLocationId },
        ],
      };
    });
  }

  function updateSelectedTokens(tokens: readonly CanvasToken[]) {
    const positions = new Map(
      tokens.map((token) => [
        token.key,
        { ...persistedCanvasPoint(token), scale: token.scale },
      ]),
    );
    setDraft((current) => ({
      ...current,
      creaturePlacements: current.creaturePlacements.flatMap((placement) => {
        if (placement.locationId !== activeLocationId) return [placement];
        const position = positions.get(placement.id);
        return position ? [{ ...placement, ...position }] : [];
      }),
    }));
  }

  function updateSelectedCanvasObjects(objects: EditableCanvasObjects) {
    setDraft((current) => {
      const existing = current.locationCanvases.find(
        (canvas) => canvas.locationId === activeLocationId,
      );
      const updated: EditableLocationCanvas = {
        locationId: activeLocationId,
        layers: existing?.layers ?? [],
        pixelsPerFiveFeet: existing?.pixelsPerFiveFeet,
        lights: [...objects.lights],
        sounds: [...objects.sounds],
        drawings: [...objects.drawings],
        templates: [...objects.templates],
        notes: [...objects.notes],
      };
      return {
        ...current,
        locationCanvases: [
          ...current.locationCanvases.filter(
            (canvas) => canvas.locationId !== activeLocationId,
          ),
          { ...existing, ...updated },
        ],
      };
    });
  }

  async function applyTokenFall(fall: {
    tokenKey: string;
    feet: number;
    dice: number;
    position: { x: number; y: number };
  }) {
    const placement = draft.creaturePlacements.find(
      ({ id }) => id === fall.tokenKey,
    );
    const creature = placement
      ? creaturesRef.current.find(({ id }) => id === placement.sourceId)
      : undefined;
    const hitPoints = objectAt(creature?.data.hitPoints);
    if (!creature || typeof hitPoints.current !== "number") {
      setLocationSaveMessage(
        `${creature?.name ?? "The creature"} fell ${Math.round(fall.feet)} feet; record ${fall.dice}d4 fall damage manually.`,
      );
      return;
    }
    const rolls = Array.from({ length: fall.dice }, () => {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      return (value[0]! % 4) + 1;
    });
    const damage = rolls.reduce((total, roll) => total + roll, 0);
    const position = persistedCanvasPoint(fall.position);
    const currentDraft = draftRef.current;
    const fallDraft: CampaignDraft = {
      ...currentDraft,
      creaturePlacements: currentDraft.creaturePlacements.map((candidate) =>
        candidate.id === fall.tokenKey
          ? { ...candidate, ...position }
          : candidate,
      ),
    };
    setLocationSaveMessage(`Saving the fall and applying ${damage} damage…`);
    try {
      const currentCampaign = campaignRecordRef.current;
      const updatedCampaign = await replaceDomainRecord(
        currentCampaign,
        dataFrom(currentCampaign, fallDraft),
      );
      campaignRecordRef.current = updatedCampaign;
      onCampaignRecordChange(updatedCampaign);
      const persistedDraft = draftFrom(updatedCampaign);
      draftRef.current = persistedDraft;
      setDraft(persistedDraft);
      const updated = await replaceDomainRecord(creature, {
        ...creature.data,
        hitPoints: {
          ...hitPoints,
          current: Math.max(0, hitPoints.current - damage),
        },
      });
      const nextCreatures = creaturesRef.current.map((candidate) =>
        candidate.id === updated.id ? updated : candidate,
      );
      creaturesRef.current = nextCreatures;
      onCreaturesChange(nextCreatures);
      setLocationSaveMessage(
        `${updated.name ?? "Creature"} fell ${Math.round(fall.feet)} feet and took ${damage} damage (${rolls.join(" + ")}).`,
      );
    } catch (caught) {
      setLocationSaveMessage(
        caught instanceof Error
          ? caught.message
          : "Fall damage could not be saved.",
      );
    }
  }

  async function updateLocationWalls(walls: readonly CanvasWall[]) {
    setLocationSaveMessage("Saving boundaries…");
    try {
      const updated = await replaceDomainRecord(currentLocation, {
        ...currentLocation.data,
        walls: persistedWalls(walls),
      });
      onLocationsChange(
        allLocations.map((location) =>
          location.id === updated.id ? updated : location,
        ),
      );
      setLocationSaveMessage("Boundaries saved.");
    } catch (caught) {
      setLocationSaveMessage(
        caught instanceof Error ? caught.message : "Could not save boundaries.",
      );
    }
  }

  return (
    <div className="relative h-dvh min-h-0 overflow-hidden">
      <div className="location-breadcrumb-overlay pointer-events-none absolute top-3 right-[23rem] left-14 z-30 flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/55 px-2 shadow-[0_8px_28px_rgba(0,0,0,.5)] backdrop-blur-md">
        <button
          type="button"
          className="btn btn-ghost btn-square btn-sm pointer-events-auto"
          aria-label="Browse world locations"
          title="Browse world locations"
          onClick={() => setSelectedLocationId(undefined)}
        >
          ←
        </button>
        <nav aria-label="Location hierarchy" className="min-w-0 flex-1">
          <ol className="pointer-events-auto flex flex-wrap items-center gap-1 text-sm">
            {selectedPath.map((location) => (
              <li key={location.id} className="flex min-w-0 items-center gap-1">
                <span className="text-base-content/30">/</span>
                {includedLocations.some(
                  (included) => included.id === location.id,
                ) && location.id !== selectedLocation.id ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm max-w-48 px-2 font-normal"
                    onClick={() => openLocation(location.id)}
                  >
                    <span className="truncate">
                      {location.name ?? "Untitled location"}
                    </span>
                  </button>
                ) : (
                  <span
                    className={`max-w-56 truncate px-2 py-1 ${
                      location.id === selectedLocation.id
                        ? "font-semibold"
                        : "text-base-content/45"
                    }`}
                  >
                    {location.name ?? "Untitled location"}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="pointer-events-auto flex items-center gap-2">
          <SessionContextControls
            worldId={draft.worldId}
            campaignId={campaignId}
          />
          <button type="submit" className="btn btn-ghost btn-sm">
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMessage && (
            <span className="badge badge-ghost max-w-48 truncate">
              {saveMessage}
            </span>
          )}
          {locationSaveMessage && (
            <span className="badge badge-ghost max-w-48 truncate">
              {locationSaveMessage}
            </span>
          )}
        </div>
      </div>

      <div className="campaign-session-canvas h-full min-h-0 min-w-0 w-full overflow-hidden">
        <SessionCanvasWorkspace
          key={selectedLocation.id}
          locationId={selectedLocation.id}
          locationName={selectedLocation.name ?? "Untitled location"}
          locationKind={selectedLocation.kind ?? undefined}
          locationOrientation={mapOrientation(selectedLocation)}
          backgroundUrl={selectedMapUrl}
          initialWalls={selectedWalls}
          onWallsChange={(walls) => void updateLocationWalls(walls)}
          initialTokens={selectedTokens}
          initialLights={selectedCanvas?.lights ?? []}
          initialSounds={selectedCanvas?.sounds ?? []}
          initialDrawings={selectedCanvas?.drawings ?? []}
          initialTemplates={selectedCanvas?.templates ?? []}
          initialNotes={selectedCanvas?.notes ?? []}
          onTokensChange={updateSelectedTokens}
          onTokenFall={(fall) => void applyTokenFall(fall)}
          onCanvasObjectsChange={updateSelectedCanvasObjects}
          initialConfiguration={selectedCanvas}
          onConfigurationChange={updateSelectedCanvas}
          onBack={() => setSelectedLocationId(undefined)}
          contentSummary={`${selectedCreatureCount} creatures · ${selectedItemCount} items · ${selectedDiscoveryCount} discoveries`}
          content={
            <>
              <div className="grid gap-3">
                <LocationDetailsInspector
                  location={selectedLocation}
                  onChange={(updated) =>
                    onLocationsChange(
                      allLocations.map((location) =>
                        location.id === updated.id ? updated : location,
                      ),
                    )
                  }
                />
                {selectedLocation.id !== draft.partyStartingLocationId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mt-2"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        partyStartingLocationId: selectedLocation.id,
                      })
                    }
                  >
                    Set as party starting location
                  </button>
                )}
              </div>
              <PlacementSection
                key={`creatures:${selectedLocation.id}`}
                title="Creature instances"
                help="Each placement is an instance of a world creature type and persists across sessions."
                sourceLabel="Creature type"
                sources={creatures}
                locationId={selectedLocation.id}
                placements={draft.creaturePlacements}
                onCreateWithAi={async (prompt) => {
                  const result = await createCreatureWithAi(
                    draft.worldId,
                    `${prompt}\n\nThe creature will first appear in ${selectedLocation.name ?? "the current location"}.`,
                  );
                  onCreaturesChange([...creatures, result.creature]);
                  return result.creature;
                }}
                onChange={(creaturePlacements) =>
                  setDraft({ ...draft, creaturePlacements })
                }
              />
              <PlacementSection
                key={`items:${selectedLocation.id}`}
                title="World item placements"
                help="World-defined items initially present here. Placement does not award them."
                sourceLabel="Item"
                sources={items}
                locationId={selectedLocation.id}
                placements={draft.itemPlacements}
                onChange={(itemPlacements) =>
                  setDraft({ ...draft, itemPlacements })
                }
              />
              {selectedObjectCount > 0 && (
                <p className="alert alert-warning text-sm">
                  This location has {selectedObjectCount} environmental object
                  {selectedObjectCount === 1 ? " placement" : " placements"}.
                  They remain preserved and use human-readable editing when the
                  world object library supports it.
                </p>
              )}
              <DiscoverySection
                discoveries={draft.discoveries}
                locationId={selectedLocation.id}
                items={items}
                onChange={(discoveries) => setDraft({ ...draft, discoveries })}
              />
            </>
          }
        />
      </div>
    </div>
  );
}

function validationMessage(draft: CampaignDraft): string | undefined {
  if (!draft.name.trim()) return "Give the campaign a name.";
  if (!richTextPlainText(draft.gmPremise)) return "Write the GM premise.";
  if (!richTextPlainText(draft.playerIntroduction))
    return "Write the player introduction.";
  if (!draft.worldId) return "Choose a world.";
  if (!draft.partyStartingLocationId)
    return "Choose the party's starting location.";
  if (!draft.locationIds.includes(draft.partyStartingLocationId))
    return "The party's starting location must be included in the campaign.";
  const canvasLocationIds = new Set<string>();
  for (const canvas of draft.locationCanvases) {
    if (!draft.locationIds.includes(canvas.locationId))
      return "Every prepared canvas must belong to an included campaign location.";
    if (canvasLocationIds.has(canvas.locationId))
      return "Each campaign location can have only one prepared canvas.";
    canvasLocationIds.add(canvas.locationId);
    const layerKeys = new Set<SessionCanvasLayerKey>();
    for (const layer of canvas.layers) {
      if (layerKeys.has(layer.key))
        return "Each canvas layer can be configured only once.";
      layerKeys.add(layer.key);
      if (
        !Number.isFinite(layer.opacity) ||
        layer.opacity < 0 ||
        layer.opacity > 1
      ) {
        return "Canvas layer opacity must be between zero and one.";
      }
    }
  }
  for (const discovery of draft.discoveries) {
    if (!discovery.name.trim() || !discovery.locationId) {
      return "Every discovery needs a GM-facing name and location.";
    }
    for (const grant of discovery.grants) {
      if (grant.kind === "money") {
        if (
          !grant.denomination.trim() ||
          !Number.isFinite(Number(grant.amount)) ||
          Number(grant.amount) < 0
        ) {
          return "Every monetary grant needs a non-negative amount and world currency.";
        }
      } else if (grant.kind === "item") {
        if (!grant.itemDefinitionId)
          return "Choose an item for every item grant.";
      } else if (!grant.text.trim()) {
        return "Every knowledge grant needs text.";
      }
    }
  }
  return undefined;
}

export function CampaignCreatePage() {
  const [worlds, setWorlds] = useState<DomainRecord[]>([]);
  const [worldId, setWorldId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listDomainRecords("locations", { kind: "world", limit: 200 }).then(
      (worldResult) => {
        setWorlds(worldResult.items);
        if (worldResult.items.length === 1) {
          setWorldId(worldResult.items[0]?.id ?? "");
        }
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load available worlds",
        ),
    );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!worldId) {
      setMessage("Choose the world where this campaign belongs.");
      return;
    }
    if (prompt.trim().length < 3) {
      setMessage("Give the AI a campaign idea to develop.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await createCampaignWithAi(worldId, prompt.trim());
      window.location.assign(
        `/campaigns/${encodeURIComponent(result.campaign.id)}`,
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "The campaign could not be created",
      );
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <header className="border-b border-base-300 pb-8">
          <a href="/campaigns" className="text-sm text-primary">
            ← Campaigns
          </a>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Create campaign
          </h1>
          <p className="mt-3 text-base-content/55">
            Describe a starting point and let AI build a campaign grounded in
            the selected world.
          </p>
        </header>

        {message && (
          <p role="alert" className="alert alert-error mt-6 text-sm">
            {message}
          </p>
        )}

        <div role="tablist" className="tabs tabs-box mt-8 w-fit">
          <span role="tab" aria-selected="true" className="tab tab-active">
            Create with AI
          </span>
        </div>

        <form
          onSubmit={create}
          className="card mt-6 border border-primary/20 bg-primary/[0.06] shadow-xl"
        >
          <div className="card-body gap-5">
            <div>
              <h2 className="card-title">Describe the campaign</h2>
              <p className="mt-2 text-sm leading-6 text-base-content/60">
                Your direction is combined with the selected world. You can
                review and edit every generated detail on the next screen.
              </p>
            </div>

            <label className="block max-w-sm">
              <span className="block text-sm font-medium">World</span>
              <select
                required
                className="select select-bordered mt-2 w-full"
                value={worldId}
                onChange={(event) => setWorldId(event.target.value)}
              >
                <option value="">Choose a world</option>
                {worlds.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.name ?? "Unnamed world"}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-base-content/50">
                Uses this world’s existing locations, creatures, and items.
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-medium">Campaign idea</span>
              <textarea
                required
                minLength={3}
                className="textarea textarea-bordered mt-2 min-h-56 w-full resize-y text-base leading-7"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A celebrated detective vanished beneath a flooded city. The party arrives as old alliances fracture, strange bells ring below the streets, and every witness remembers a different version of the night…"
              />
            </label>

            <div className="card-actions items-center justify-between gap-4">
              <span className="max-w-xl text-xs leading-5 text-base-content/50">
                Keeps GM-only details private and leaves party decisions to the
                players.
              </span>
              <button
                className="btn btn-primary"
                disabled={saving || !worldId || prompt.trim().length < 3}
              >
                {saving && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Generate campaign
              </button>
            </div>

            {worlds.length === 0 && (
              <p className="text-sm text-warning">
                Create a world before starting a campaign.
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

export function CampaignEditorPage({
  id,
  view = "definition",
}: {
  id: string;
  view?: "definition" | "locations";
}) {
  const [record, setRecord] = useState<DomainRecord>();
  const [draft, setDraft] = useState<CampaignDraft>();
  const [allLocations, setAllLocations] = useState<DomainRecord[]>([]);
  const [creatures, setCreatures] = useState<DomainRecord[]>([]);
  const [items, setItems] = useState<DomainRecord[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      getDomainRecord("campaigns", id),
      listDomainRecords("locations", { limit: 200 }),
    ]).then(
      ([campaign, locationResult]) => {
        setRecord(campaign);
        setDraft(draftFrom(campaign));
        setAllLocations(locationResult.items);
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error ? caught.message : "Could not load campaign",
        ),
    );
  }, [id]);

  const worldId = draft?.worldId ?? "";
  useEffect(() => {
    if (!worldId) return;
    void Promise.all([
      listDomainRecords("creatures", { worldId, limit: 200 }),
      listDomainRecords("definitions", {
        worldId,
        kind: "item",
        limit: 200,
      }),
    ]).then(
      ([creatureResult, itemResult]) => {
        setCreatures(creatureResult.items);
        setItems(itemResult.items);
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load world content",
        ),
    );
  }, [worldId]);

  const locations = useMemo(
    () => locationsInWorld(worldId, allLocations),
    [allLocations, worldId],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || !draft) return;
    const currentWorldLocationIds = locations
      .filter((location) => location.id !== draft.worldId)
      .map((location) => location.id);
    const normalizedDraft = {
      ...draft,
      locationIds: currentWorldLocationIds,
    };
    const validation = validationMessage(normalizedDraft);
    if (validation) {
      setMessage(validation);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const updated = await replaceDomainRecord(
        record,
        dataFrom(record, normalizedDraft),
      );
      setRecord(updated);
      setDraft(draftFrom(updated));
      setMessage("Campaign saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!draft || !record) {
    return (
      <main className="min-h-screen bg-base-100 px-6 py-12 text-base-content">
        <div className="w-full">
          <a href="/campaigns" className="text-sm text-amber-300">
            ← Back to campaigns
          </a>
          <p className="mt-8">{message || "Loading campaign…"}</p>
        </div>
      </main>
    );
  }

  const setCampaignDraft: Dispatch<SetStateAction<CampaignDraft>> = (next) =>
    setDraft((current) => {
      if (!current) return current;
      return typeof next === "function" ? next(current) : next;
    });

  return (
    <main
      className={`relative overflow-hidden bg-base-100 text-base-content ${view === "locations" ? "h-full min-h-0" : "min-h-screen"}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_80%_0%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_42%)]" />
      <form
        onSubmit={save}
        className={`relative w-full ${view === "locations" ? "h-full min-h-0 p-0" : "px-6 py-8 lg:px-10 lg:py-10"}`}
      >
        {view === "definition" && (
          <CampaignHeader name={draft.name} saving={saving} />
        )}
        <div
          className={`${view === "locations" ? "h-full min-h-0" : "mt-8"} grid gap-6`}
        >
          {view === "definition" ? (
            <OverviewFields draft={draft} setDraft={setCampaignDraft} />
          ) : (
            <CampaignLocationsWorkspace
              campaignRecord={record}
              campaignId={id}
              draft={draft}
              setDraft={setCampaignDraft}
              locations={locations}
              allLocations={allLocations}
              onLocationsChange={setAllLocations}
              creatures={creatures}
              onCreaturesChange={setCreatures}
              onCampaignRecordChange={setRecord}
              items={items}
              saving={saving}
              saveMessage={message}
            />
          )}
        </div>
        {message && (
          <p
            role={view === "definition" ? "status" : undefined}
            className={`alert mt-6 text-sm ${message === "Campaign saved." ? "alert-success" : "alert-error"}`}
          >
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
