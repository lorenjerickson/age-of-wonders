import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Badge,
  Button,
  Details,
  FileInput,
  FileInputTrigger,
  IconButton,
  Label,
  Range,
  Select,
  StatusIndicator,
  Summary,
  Tab,
  Tabs,
  Toggle,
} from "@aow/ui";
import { visibilityPolygon } from "./mapGeometry";
import { RouterButtonLink } from "./navigation";
import {
  canStartTokenDrag,
  canvasObjectKindForLayer,
  defaultSessionCanvasLayerVisibility,
  defaultSessionCanvasLayerOpacity,
  groundSideOnPoint,
  SESSION_CANVAS_LAYERS,
  sessionCanvasLayerOpacity,
  sessionCanvasLayerVisibility,
  spatialAudioGain,
  sessionCanvasLayerForSelection,
  sideOnFallDamageDice,
  tokenKeyForKeyboardMove,
  tokenScaleFromResize,
  tokenSelectionGeometry,
  transitionSessionCanvasSelection,
  withoutSessionCanvasPlayback,
  zoomViewportAtPoint,
  type SessionCanvasLayerGroup,
  type SessionCanvasLayerKey,
} from "./sessionCanvasModel";

export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 900;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasToken extends CanvasPoint {
  key: string;
  name: string;
  initials: string;
  color: string;
  disposition: "party" | "friendly" | "hostile";
  vision: number;
  artworkUrl?: string;
  artworkView?: "overhead" | "side-on";
  scale?: number;
}

export interface CanvasWall {
  key: string;
  start: CanvasPoint;
  end: CanvasPoint;
  kind: "wall" | "door" | "invisible-wall";
  open?: boolean;
  blocksSight: boolean;
  blocksMovement?: boolean;
}

export interface CanvasLight extends CanvasPoint {
  key: string;
  name: string;
  radius: number;
  color: string;
}

export interface CanvasSound extends CanvasPoint {
  key: string;
  name: string;
  radius: number;
  volume: number;
  volumeMode: "distance" | "constant";
  loop: boolean;
}

interface CanvasSoundPlayback {
  url: string;
  fileName: string;
  armed: boolean;
  playing: boolean;
  error: string;
}

interface PanelSelectOption<Value extends string> {
  value: Value;
  label: string;
}

export interface CanvasNote extends CanvasPoint {
  key: string;
  name: string;
  text: string;
}

export interface CanvasDrawing extends CanvasPoint {
  key: string;
  name?: string;
  radius: number;
}

export interface CanvasTemplate extends CanvasPoint {
  key: string;
  name?: string;
  radius: number;
}

type CanvasTool =
  | "select"
  | "pan"
  | "token"
  | "wall"
  | "door"
  | "drawing"
  | "template"
  | "light"
  | "sound"
  | "note";

type InspectorTab = "layers" | "content" | "scene" | "selection";
type WeatherKind = "none" | "rain" | "snow" | "embers";

export interface CanvasAuthoredObjects {
  lights: readonly CanvasLight[];
  sounds: readonly CanvasSound[];
  drawings: readonly CanvasDrawing[];
  templates: readonly CanvasTemplate[];
  notes: readonly CanvasNote[];
}

type CanvasSelection =
  | { kind: "layer"; key: SessionCanvasLayerKey }
  | { kind: "token"; key: string }
  | { kind: "wall"; key: string }
  | { kind: "vertex"; key: string; point: CanvasPoint }
  | { kind: "light"; key: string }
  | { kind: "sound"; key: string }
  | { kind: "drawing"; key: string }
  | { kind: "template"; key: string }
  | { kind: "note"; key: string };

const INITIAL_TOKENS: CanvasToken[] = [
  {
    key: "token-kael",
    name: "Kael",
    initials: "K",
    x: 665,
    y: 478,
    color: "#f7c95c",
    disposition: "party",
    vision: 430,
  },
  {
    key: "token-mira",
    name: "Mira",
    initials: "M",
    x: 748,
    y: 520,
    color: "#74d3c4",
    disposition: "party",
    vision: 390,
  },
  {
    key: "token-warden",
    name: "Vault Warden",
    initials: "W",
    x: 1115,
    y: 350,
    color: "#d96c62",
    disposition: "hostile",
    vision: 320,
  },
];

const INITIAL_WALLS: CanvasWall[] = [
  {
    key: "north-1",
    start: { x: 250, y: 185 },
    end: { x: 760, y: 185 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "north-2",
    start: { x: 840, y: 185 },
    end: { x: 1370, y: 185 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "west",
    start: { x: 250, y: 185 },
    end: { x: 250, y: 720 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "east",
    start: { x: 1370, y: 185 },
    end: { x: 1370, y: 720 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "south-1",
    start: { x: 250, y: 720 },
    end: { x: 765, y: 720 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "south-door",
    start: { x: 765, y: 720 },
    end: { x: 855, y: 720 },
    kind: "door",
    open: false,
    blocksSight: true,
  },
  {
    key: "south-2",
    start: { x: 855, y: 720 },
    end: { x: 1370, y: 720 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "divider-left",
    start: { x: 250, y: 420 },
    end: { x: 545, y: 420 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "divider-door",
    start: { x: 545, y: 420 },
    end: { x: 625, y: 420 },
    kind: "door",
    open: true,
    blocksSight: true,
  },
  {
    key: "divider-right",
    start: { x: 625, y: 420 },
    end: { x: 1010, y: 420 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "vault-west",
    start: { x: 1010, y: 185 },
    end: { x: 1010, y: 420 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "vault-south",
    start: { x: 1010, y: 420 },
    end: { x: 1370, y: 420 },
    kind: "wall",
    blocksSight: true,
  },
  {
    key: "threshold",
    start: { x: 785, y: 185 },
    end: { x: 815, y: 185 },
    kind: "invisible-wall",
    blocksSight: false,
  },
];

const INITIAL_LIGHTS: CanvasLight[] = [
  {
    key: "light-brazier",
    name: "Brazier",
    x: 500,
    y: 295,
    radius: 250,
    color: "#ffb45e",
  },
  {
    key: "light-crystal",
    name: "Aether crystal",
    x: 1125,
    y: 300,
    radius: 210,
    color: "#66c7ff",
  },
  {
    key: "light-lantern",
    name: "Dropped lantern",
    x: 735,
    y: 540,
    radius: 185,
    color: "#ffd98a",
  },
];

const INITIAL_SOUNDS: CanvasSound[] = [
  {
    key: "sound-water",
    name: "Running water",
    x: 390,
    y: 610,
    radius: 260,
    volume: 0.65,
    volumeMode: "distance",
    loop: true,
  },
  {
    key: "sound-hum",
    name: "Arcane hum",
    x: 1135,
    y: 300,
    radius: 230,
    volume: 0.45,
    volumeMode: "constant",
    loop: true,
  },
];

const INITIAL_NOTES: CanvasNote[] = [
  {
    key: "note-mural",
    name: "Weathered mural",
    text: "The constellations point beneath the vault.",
    x: 440,
    y: 230,
  },
  {
    key: "note-lock",
    name: "Resonant seal",
    text: "Three tones open the lower gate.",
    x: 1290,
    y: 365,
  },
];

const INITIAL_DRAWINGS: CanvasDrawing[] = [
  { key: "drawing-route", x: 965, y: 628, radius: 72 },
];

const INITIAL_TEMPLATES: CanvasTemplate[] = [
  { key: "template-warden", x: 1115, y: 350, radius: 118 },
];

const TOOL_DEFINITIONS: readonly {
  key: CanvasTool;
  label: string;
  glyph: string;
  shortcut: string;
}[] = [
  { key: "select", label: "Select & move", glyph: "↖", shortcut: "1" },
  { key: "pan", label: "Pan canvas", glyph: "✥", shortcut: "2" },
  { key: "token", label: "Place token", glyph: "●", shortcut: "3" },
  { key: "wall", label: "Draw wall", glyph: "╱", shortcut: "4" },
  { key: "door", label: "Place door", glyph: "▯", shortcut: "d" },
  { key: "drawing", label: "Drawing", glyph: "✎", shortcut: "5" },
  { key: "template", label: "Template", glyph: "◌", shortcut: "6" },
  { key: "light", label: "Light source", glyph: "☀", shortcut: "7" },
  { key: "sound", label: "Ambient sound", glyph: "♫", shortcut: "8" },
  { key: "note", label: "Map note", glyph: "◆", shortcut: "9" },
];

const GROUP_LABELS: Record<SessionCanvasLayerGroup, string> = {
  scene: "Scene placeables",
  effects: "Effects canvas group",
  visibility: "Visibility canvas group",
  interface: "Interface canvas group",
};

const RAIN = Array.from({ length: 42 }, (_, index) => ({
  x: (index * 193 + 71) % CANVAS_WIDTH,
  y: (index * 97 + 31) % CANVAS_HEIGHT,
  length: 16 + (index % 5) * 5,
  delay: (index % 11) * -0.17,
}));

const PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  x: (index * 251 + 93) % CANVAS_WIDTH,
  y: (index * 137 + 57) % CANVAS_HEIGHT,
  radius: 1.5 + (index % 4),
  delay: (index % 9) * -0.31,
}));

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectiveSoundVolume(sound: CanvasSound, listener: CanvasPoint) {
  return spatialAudioGain({
    source: sound,
    listener,
    range: sound.radius,
    baseVolume: sound.volume,
    mode: sound.volumeMode,
  });
}

function PanelSelect<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: Value;
  options: readonly PanelSelectOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ??
    options[0]?.label;

  return (
    <Details ref={detailsRef} className="group min-w-0">
      <Summary
        aria-label={ariaLabel}
        className="flex h-8 w-full min-w-0 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100/80 px-3 text-xs text-base-content/75 outline-none hover:border-base-300 focus-visible:ring-2 focus-visible:ring-violet-200 [&::-webkit-details-marker]:hidden"
      >
        <span className="truncate">{selectedLabel}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-[9px] text-base-content/55 transition-transform group-open:rotate-180"
        >
          ▼
        </span>
      </Summary>
      <div className="mt-1 grid min-w-0 overflow-hidden rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            tone="ghost"
            size="xs"
            fullWidth
            className={`min-w-0 justify-start text-left ${option.value === value ? "bg-primary/15 text-primary" : "text-base-content/65"}`}
            onClick={() => {
              onChange(option.value);
              detailsRef.current?.removeAttribute("open");
            }}
          >
            <span className="block truncate">{option.label}</span>
          </Button>
        ))}
      </div>
    </Details>
  );
}

function pointPath(points: readonly CanvasPoint[]) {
  return points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
}

function updateCanvasItem<Item extends { key: string }>(
  items: readonly Item[],
  key: string,
  transform: (item: Item) => Item,
): Item[] {
  return items.map((item) => (item.key === key ? transform(item) : item));
}

function ToolButton({
  active,
  compact = false,
  definition,
  onSelect,
}: {
  active: boolean;
  compact?: boolean;
  definition: (typeof TOOL_DEFINITIONS)[number];
  onSelect: () => void;
}) {
  return (
    <IconButton
      type="button"
      tone={active ? "primary" : undefined}
      className={`group relative grid place-items-center border transition ${compact ? "h-9 w-9 rounded-lg text-base" : "h-11 w-11 rounded-xl text-lg"} ${
        active
          ? "shadow-[0_0_24px_rgba(244,195,76,.22)]"
          : "border-base-300/70 bg-base-100/65 text-base-content/70 backdrop-blur hover:border-primary/40 hover:bg-base-100/85 hover:text-base-content"
      }`}
      aria-label={`${definition.label} (${definition.shortcut})`}
      title={`${definition.label} (${definition.shortcut})`}
      onClick={onSelect}
    >
      <span aria-hidden>{definition.glyph}</span>
      {!compact && (
        <span className="absolute -right-1 -bottom-1 grid h-4 min-w-4 place-items-center rounded bg-base-300 px-1 text-xs font-bold text-base-content/55">
          {definition.shortcut}
        </span>
      )}
    </IconButton>
  );
}

export interface SessionCanvasWorkspaceProps {
  locationId?: string;
  locationName?: string;
  locationKind?: string;
  locationOrientation?: "scenic" | "overhead" | "side-on";
  backgroundUrl?: string;
  initialTokens?: readonly CanvasToken[];
  initialWalls?: readonly CanvasWall[];
  initialLights?: readonly CanvasLight[];
  initialSounds?: readonly CanvasSound[];
  initialDrawings?: readonly CanvasDrawing[];
  initialTemplates?: readonly CanvasTemplate[];
  initialNotes?: readonly CanvasNote[];
  initialConfiguration?: {
    pixelsPerFiveFeet?: number;
    layers: readonly {
      key: SessionCanvasLayerKey;
      visible: boolean;
      opacity: number;
    }[];
  };
  onConfigurationChange?: (configuration: {
    locationId: string;
    pixelsPerFiveFeet: number;
    layers: {
      key: SessionCanvasLayerKey;
      visible: boolean;
      opacity: number;
    }[];
  }) => void;
  onWallsChange?: (walls: readonly CanvasWall[]) => void;
  onTokensChange?: (tokens: readonly CanvasToken[]) => void;
  onCanvasObjectsChange?: (objects: CanvasAuthoredObjects) => void;
  onTokenFall?: (fall: {
    tokenKey: string;
    feet: number;
    dice: number;
    position: CanvasPoint;
  }) => void | Promise<void>;
  onBack?: () => void;
  content?: ReactNode;
  contentSummary?: string;
  saveControls?: ReactNode;
  saveStatus?: string;
  sessionControls?: ReactNode;
}

export function SessionCanvasWorkspace({
  locationId,
  locationName = "The Sunken Archive",
  locationKind,
  locationOrientation = "scenic",
  backgroundUrl,
  initialTokens = [],
  initialWalls = [],
  initialLights = [],
  initialSounds = [],
  initialDrawings = [],
  initialTemplates = [],
  initialNotes = [],
  initialConfiguration,
  onConfigurationChange,
  onWallsChange,
  onTokensChange,
  onCanvasObjectsChange,
  onTokenFall,
  onBack,
  content,
  contentSummary,
  sessionControls,
}: SessionCanvasWorkspaceProps) {
  const fixtureMode = !locationId;
  const svgRef = useRef<SVGSVGElement>(null);
  const configurationChangeRef = useRef(onConfigurationChange);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const soundPlaybackRef = useRef<Record<string, CanvasSoundPlayback>>({});
  const fallCommitRef = useRef(Promise.resolve());
  const pendingInitialGroundingRef = useRef(
    !fixtureMode &&
      locationOrientation === "side-on" &&
      initialTokens.length > 0,
  );
  const previousOrientationRef = useRef(locationOrientation);
  const dragRef = useRef<
    | {
        kind: "pan";
        pointerId: number;
        clientX: number;
        clientY: number;
        pan: CanvasPoint;
      }
    | {
        kind: "token";
        pointerId: number;
        tokenKey: string;
        offset: CanvasPoint;
        startY: number;
      }
    | {
        kind: "object";
        pointerId: number;
        selection: Exclude<CanvasSelection, { kind: "vertex" | "layer" }>;
        offset: CanvasPoint;
        wall?: { start: CanvasPoint; end: CanvasPoint };
      }
    | {
        kind: "radius";
        pointerId: number;
        selection: Extract<
          CanvasSelection,
          { kind: "token" | "light" | "sound" | "drawing" | "template" }
        >;
        center: CanvasPoint;
        initialPointerDistance?: number;
        initialTokenScale?: number;
      }
    | {
        kind: "vertex";
        pointerId: number;
        point: CanvasPoint;
      }
    | undefined
  >(undefined);
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("layers");
  const [layerVisibility, setLayerVisibility] = useState(() =>
    initialConfiguration
      ? sessionCanvasLayerVisibility(initialConfiguration)
      : defaultSessionCanvasLayerVisibility(),
  );
  const [layerOpacity, setLayerOpacity] = useState(() =>
    initialConfiguration
      ? sessionCanvasLayerOpacity(initialConfiguration)
      : defaultSessionCanvasLayerOpacity(),
  );
  const [tokens, setTokens] = useState(() => {
    const source = fixtureMode ? INITIAL_TOKENS : [...initialTokens];
    if (locationOrientation !== "side-on") return source;
    return source.map((token) => ({
      ...token,
      y: groundSideOnPoint({
        point: token,
        segments: initialWalls.map((wall) => ({
          start: wall.start,
          end: wall.end,
          blocksMovement: wall.blocksMovement !== false,
          open: wall.kind === "door" && wall.open,
        })),
        canvasBottom: CANVAS_HEIGHT,
      }).groundedY,
    }));
  });
  const [walls, setWalls] = useState(
    fixtureMode ? INITIAL_WALLS : [...initialWalls],
  );
  const [lights, setLights] = useState(
    fixtureMode ? INITIAL_LIGHTS : [...initialLights],
  );
  const [sounds, setSounds] = useState(
    fixtureMode ? INITIAL_SOUNDS : [...initialSounds],
  );
  const [selectedSoundKey, setSelectedSoundKey] = useState("sound-water");
  const [listenerTokenKey, setListenerTokenKey] = useState("token-kael");
  const [soundPlayback, setSoundPlayback] = useState<
    Record<string, CanvasSoundPlayback>
  >({});
  const [notes, setNotes] = useState(
    fixtureMode ? INITIAL_NOTES : [...initialNotes],
  );
  const [drawings, setDrawings] = useState(
    fixtureMode ? INITIAL_DRAWINGS : [...initialDrawings],
  );
  const [templates, setTemplates] = useState(
    fixtureMode ? INITIAL_TEMPLATES : [...initialTemplates],
  );
  const [selectedTokenKey, setSelectedTokenKey] = useState(
    fixtureMode ? "token-kael" : "",
  );
  const [selection, setSelection] = useState<CanvasSelection | null>(
    fixtureMode ? { kind: "token", key: "token-kael" } : null,
  );
  const [fallNotice, setFallNotice] = useState("");
  const [wallStart, setWallStart] = useState<CanvasPoint>();
  const [cursorPoint, setCursorPoint] = useState<CanvasPoint>();
  const [viewport, setViewport] = useState({ pan: { x: 0, y: 0 }, zoom: 1 });
  const [gridSize, setGridSize] = useState(
    initialConfiguration?.pixelsPerFiveFeet ?? 64,
  );
  const [darkness, setDarkness] = useState(fixtureMode ? 0.34 : 0);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [weather, setWeather] = useState<WeatherKind>(
    fixtureMode ? "rain" : "none",
  );
  const [effectsPlaying, setEffectsPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [debugOverlays, setDebugOverlays] = useState(true);
  const [round, setRound] = useState(fixtureMode ? 3 : 1);
  const tokensRef = useRef(tokens);
  const wallsRef = useRef(walls);
  const lightsRef = useRef(lights);
  const soundsRef = useRef(sounds);
  const drawingsRef = useRef(drawings);
  const templatesRef = useRef(templates);
  const notesRef = useRef(notes);
  tokensRef.current = tokens;
  wallsRef.current = walls;
  lightsRef.current = lights;
  soundsRef.current = sounds;
  drawingsRef.current = drawings;
  templatesRef.current = templates;
  notesRef.current = notes;
  const availableTools = useMemo(
    () =>
      TOOL_DEFINITIONS.filter(
        (definition) => fixtureMode || definition.key !== "token",
      ).map((definition) =>
        !fixtureMode && definition.key === "select"
          ? { ...definition, label: "Inspect canvas" }
          : definition,
      ),
    [fixtureMode],
  );

  configurationChangeRef.current = onConfigurationChange;
  useEffect(() => {
    if (fixtureMode) return;
    setTokens((current) =>
      initialTokens.map((token) => {
        const existing = current.find(({ key }) => key === token.key);
        if (existing) {
          return {
            ...token,
            x: existing.x,
            y: existing.y,
            scale: existing.scale,
          };
        }
        if (locationOrientation !== "side-on") return token;
        pendingInitialGroundingRef.current = true;
        return {
          ...token,
          y: groundSideOnPoint({
            point: token,
            segments: walls.map((wall) => ({
              start: wall.start,
              end: wall.end,
              blocksMovement: wall.blocksMovement !== false,
              open: wall.kind === "door" && wall.open,
            })),
            canvasBottom: CANVAS_HEIGHT,
          }).groundedY,
        };
      }),
    );
  }, [fixtureMode, initialTokens, locationOrientation, walls]);

  useEffect(() => {
    if (!pendingInitialGroundingRef.current) return;
    pendingInitialGroundingRef.current = false;
    onTokensChange?.(tokens);
  }, [onTokensChange, tokens]);

  useEffect(() => {
    const previous = previousOrientationRef.current;
    previousOrientationRef.current = locationOrientation;
    if (previous !== "side-on" && locationOrientation === "side-on") {
      settleSideOnTokens(wallsRef.current, false);
    }
  }, [locationOrientation]);

  useEffect(() => {
    if (fixtureMode) return;
    setWalls([...initialWalls]);
  }, [fixtureMode, initialWalls]);

  useEffect(() => {
    if (!locationId || !configurationChangeRef.current) return;
    configurationChangeRef.current({
      locationId,
      pixelsPerFiveFeet: gridSize,
      layers: SESSION_CANVAS_LAYERS.map(({ key }) => ({
        key,
        visible: layerVisibility[key],
        opacity: layerOpacity[key],
      })),
    });
  }, [gridSize, layerOpacity, layerVisibility, locationId]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target !== svgRef.current) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.tagName === "INPUT" ||
            target.tagName === "SELECT" ||
            target.tagName === "TEXTAREA"))
      ) {
        return;
      }
      if (event.key === "Escape") {
        setWallStart(undefined);
        setActiveTool("select");
        return;
      }
      if (
        activeTool === "select" &&
        selection &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const delta = {
          ArrowLeft: { x: -gridSize, y: 0 },
          ArrowRight: { x: gridSize, y: 0 },
          ArrowUp: { x: 0, y: -gridSize },
          ArrowDown: { x: 0, y: gridSize },
        }[event.key];
        if (!delta) return;
        const keyboardTokenKey = tokenKeyForKeyboardMove(activeTool, selection);
        if (keyboardTokenKey) {
          let fall:
            | {
                tokenKey: string;
                feet: number;
                dice: number;
                position: CanvasPoint;
              }
            | undefined;
          const next = tokensRef.current.map((token) => {
            if (token.key !== keyboardTokenKey) return token;
            const moved = {
              ...token,
              x: clamp(token.x + delta.x, 0, CANVAS_WIDTH),
              y: clamp(token.y + delta.y, 0, CANVAS_HEIGHT),
            };
            if (locationOrientation !== "side-on") return moved;
            const grounding = groundSideOnPoint({
              point: { x: moved.x, y: token.y },
              segments: wallsRef.current.map((wall) => ({
                start: wall.start,
                end: wall.end,
                blocksMovement: wall.blocksMovement !== false,
                open: wall.kind === "door" && wall.open,
              })),
              canvasBottom: CANVAS_HEIGHT,
            });
            const feet = (grounding.fallDistance / gridSize) * 5;
            const dice = sideOnFallDamageDice(grounding.fallDistance, gridSize);
            if (dice > 0) {
              fall = {
                tokenKey: token.key,
                feet,
                dice,
                position: { x: moved.x, y: grounding.groundedY },
              };
            }
            return { ...moved, y: grounding.groundedY };
          });
          tokensRef.current = next;
          setTokens(next);
          onTokensChange?.(next);
          if (fall) {
            setFallNotice(
              `${next.find(({ key }) => key === fall!.tokenKey)?.name ?? "Creature"} fell ${Math.round(fall.feet)} feet and takes ${fall.dice}d4 damage.`,
            );
            queueTokenFall(fall);
          }
        } else {
          setViewport((current) => ({
            ...current,
            pan: {
              x: current.pan.x - delta.x / 2,
              y: current.pan.y - delta.y / 2,
            },
          }));
        }
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setViewport((current) => ({
          ...current,
          zoom: clamp(current.zoom * 1.2, 0.7, 3),
        }));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setViewport((current) => ({
          ...current,
          zoom: clamp(current.zoom / 1.2, 0.7, 3),
        }));
        return;
      }
      const tool = availableTools.find(
        ({ shortcut }) => shortcut === event.key,
      );
      if (!tool) return;
      event.preventDefault();
      setWallStart(undefined);
      setActiveTool(tool.key);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [activeTool, availableTools, gridSize, selectedTokenKey, selection]);

  soundPlaybackRef.current = soundPlayback;

  useEffect(
    () => () => {
      for (const playback of Object.values(soundPlaybackRef.current)) {
        URL.revokeObjectURL(playback.url);
      }
    },
    [],
  );

  const selectedToken =
    tokens.find(({ key }) => key === selectedTokenKey) ??
    (fixtureMode ? tokens[0] : undefined);
  const selectedTokenGeometry = selectedToken
    ? tokenSelectionGeometry(selectedToken.artworkView, selectedToken.scale)
    : undefined;
  const selectedSound = sounds.find(({ key }) => key === selectedSoundKey);
  const listenerToken =
    tokens.find(({ key }) => key === listenerTokenKey) ?? tokens[0];
  const selectedSoundPlayback = selectedSound
    ? soundPlayback[selectedSound.key]
    : undefined;
  const selectedSoundDistance =
    selectedSound && listenerToken
      ? Math.hypot(
          selectedSound.x - listenerToken.x,
          selectedSound.y - listenerToken.y,
        )
      : undefined;
  const listenerInsideSelectedSound =
    selectedSoundDistance !== undefined && selectedSound
      ? selectedSoundDistance <= selectedSound.radius
      : false;
  const anyAudioPlaying = Object.values(soundPlayback).some(
    ({ playing }) => playing,
  );
  useEffect(() => {
    const audioActive = soundEnabled && layerVisibility.sounds;
    for (const sound of sounds) {
      const audio = audioRefs.current.get(sound.key);
      const playback = soundPlayback[sound.key];
      if (!audio || !playback) continue;
      const distance = listenerToken
        ? Math.hypot(sound.x - listenerToken.x, sound.y - listenerToken.y)
        : Number.POSITIVE_INFINITY;
      const insideRange = distance <= sound.radius;
      audio.volume = listenerToken
        ? effectiveSoundVolume(sound, listenerToken)
        : 0;
      audio.loop = sound.loop;
      audio.muted = !audioActive;
      if (!playback.armed || !insideRange || !audioActive) {
        if (!audio.paused) audio.pause();
        continue;
      }
      if (audio.paused) {
        void audio.play().catch(() => {
          setSoundPlayback((current) => {
            const currentPlayback = current[sound.key];
            if (!currentPlayback || currentPlayback.url !== playback.url) {
              return current;
            }
            return {
              ...current,
              [sound.key]: {
                ...currentPlayback,
                armed: false,
                playing: false,
                error:
                  "Playback was blocked. Enable positional playback again.",
              },
            };
          });
        });
      }
    }
  }, [
    layerVisibility.sounds,
    listenerToken,
    soundEnabled,
    soundPlayback,
    sounds,
  ]);

  const visionPolygon = useMemo(() => {
    if (!selectedToken) return [];
    const blockers = walls.flatMap((wall) =>
      wall.blocksSight && !(wall.kind === "door" && wall.open)
        ? [
            {
              start: {
                x: wall.start.x / CANVAS_WIDTH,
                y: wall.start.y / CANVAS_HEIGHT,
              },
              end: {
                x: wall.end.x / CANVAS_WIDTH,
                y: wall.end.y / CANVAS_HEIGHT,
              },
            },
          ]
        : [],
    );
    return visibilityPolygon(
      {
        x: selectedToken.x / CANVAS_WIDTH,
        y: selectedToken.y / CANVAS_HEIGHT,
      },
      blockers,
    ).map(({ x, y }) => {
      const hit = { x: x * CANVAS_WIDTH, y: y * CANVAS_HEIGHT };
      const dx = hit.x - selectedToken.x;
      const dy = hit.y - selectedToken.y;
      const distance = Math.hypot(dx, dy);
      const scale = distance ? Math.min(1, selectedToken.vision / distance) : 1;
      return {
        x: selectedToken.x + dx * scale,
        y: selectedToken.y + dy * scale,
      };
    });
  }, [selectedToken, walls]);

  function svgPoint(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = event.clientX;
    screenPoint.y = event.clientY;
    return screenPoint.matrixTransform(matrix.inverse());
  }

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const scenePoint = svgPoint(event);
    return {
      x: clamp(
        (scenePoint.x - viewport.pan.x) / viewport.zoom,
        0,
        CANVAS_WIDTH,
      ),
      y: clamp(
        (scenePoint.y - viewport.pan.y) / viewport.zoom,
        0,
        CANVAS_HEIGHT,
      ),
    };
  }

  function activateSelection(nextSelection: CanvasSelection | null) {
    const transition = transitionSessionCanvasSelection(
      { activeTool, selectedTokenKey, selectedSoundKey },
      nextSelection,
    );
    setSelection(transition.selection);
    setSelectedTokenKey(transition.selectedTokenKey);
    setSelectedSoundKey(transition.selectedSoundKey);
    setInspectorTab(transition.inspectorTab);
    setActiveTool(transition.activeTool as CanvasTool);
  }

  function beginTokenDrag(
    event: ReactPointerEvent<SVGGElement>,
    token: CanvasToken,
  ) {
    if (
      !canStartTokenDrag({
        activeTool,
        sceneMode: fixtureMode ? "fixture" : "persisted",
      })
    ) {
      return;
    }
    event.stopPropagation();
    activateSelection({ kind: "token", key: token.key });
    const point = canvasPoint(event);
    if (token.disposition !== "hostile") setListenerTokenKey(token.key);
    dragRef.current = {
      kind: "token",
      pointerId: event.pointerId,
      tokenKey: token.key,
      offset: { x: token.x - point.x, y: token.y - point.y },
      startY: token.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function beginObjectDrag(
    event: ReactPointerEvent<SVGElement>,
    nextSelection: Exclude<CanvasSelection, { kind: "vertex" | "layer" }>,
    position: CanvasPoint,
    wall?: CanvasWall,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    const point = canvasPoint(event);
    activateSelection(nextSelection);
    dragRef.current = {
      kind: "object",
      pointerId: event.pointerId,
      selection: nextSelection,
      offset: { x: position.x - point.x, y: position.y - point.y },
      wall: wall
        ? {
            start: { ...wall.start },
            end: { ...wall.end },
          }
        : undefined,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function beginRadiusDrag(
    event: ReactPointerEvent<SVGElement>,
    nextSelection: Extract<
      CanvasSelection,
      { kind: "token" | "light" | "sound" | "drawing" | "template" }
    >,
    center: CanvasPoint,
    tokenScale?: number,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    activateSelection(nextSelection);
    const pointer = canvasPoint(event);
    dragRef.current = {
      kind: "radius",
      pointerId: event.pointerId,
      selection: nextSelection,
      center,
      initialPointerDistance:
        nextSelection.kind === "token"
          ? Math.hypot(pointer.x - center.x, pointer.y - center.y)
          : undefined,
      initialTokenScale:
        nextSelection.kind === "token" ? (tokenScale ?? 1) : undefined,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function beginVertexDrag(
    event: ReactPointerEvent<SVGElement>,
    point: CanvasPoint,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    activateSelection({
      kind: "vertex",
      key: `${point.x}:${point.y}`,
      point,
    });
    dragRef.current = {
      kind: "vertex",
      pointerId: event.pointerId,
      point,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = canvasPoint(event);
    if (activeTool === "pan" || event.button === 1 || event.button === 2) {
      event.preventDefault();
      dragRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        pan: viewport.pan,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (activeTool === "token") {
      const number = tokens.length + 1;
      const token: CanvasToken = {
        key: crypto.randomUUID(),
        name: `Test token ${number}`,
        initials: String(number),
        x: point.x,
        y: point.y,
        color: "#b8a7ff",
        disposition: "friendly",
        vision: 360,
      };
      setTokens((current) => [...current, token]);
      activateSelection({ kind: "token", key: token.key });
      setListenerTokenKey(token.key);
      setActiveTool("select");
      return;
    }
    if (activeTool === "wall" || activeTool === "door") {
      if (!wallStart) {
        setWallStart(point);
      } else {
        const key = crypto.randomUUID();
        const next = [
          ...wallsRef.current,
          {
            key,
            start: wallStart,
            end: point,
            kind: activeTool === "door" ? ("door" as const) : ("wall" as const),
            blocksSight: true,
            blocksMovement: true,
          },
        ];
        wallsRef.current = next;
        setWalls(next);
        onWallsChange?.(next);
        setWallStart(undefined);
        setActiveTool("select");
        activateSelection({ kind: "wall", key });
      }
      return;
    }
    if (activeTool === "drawing") {
      const key = crypto.randomUUID();
      const next = [
        ...drawingsRef.current,
        {
          key,
          name: `Drawing ${drawingsRef.current.length + 1}`,
          ...point,
          radius: 62,
        },
      ];
      drawingsRef.current = next;
      setDrawings(next);
      onCanvasObjectsChange?.({
        lights: lightsRef.current,
        sounds: soundsRef.current,
        drawings: next,
        templates: templatesRef.current,
        notes: notesRef.current,
      });
      activateSelection({ kind: "drawing", key });
      setActiveTool("select");
      return;
    }
    if (activeTool === "template") {
      const key = crypto.randomUUID();
      const next = [
        ...templatesRef.current,
        {
          key,
          name: `Template ${templatesRef.current.length + 1}`,
          ...point,
          radius: 120,
        },
      ];
      templatesRef.current = next;
      setTemplates(next);
      onCanvasObjectsChange?.({
        lights: lightsRef.current,
        sounds: soundsRef.current,
        drawings: drawingsRef.current,
        templates: next,
        notes: notesRef.current,
      });
      activateSelection({ kind: "template", key });
      setActiveTool("select");
      return;
    }
    if (activeTool === "light") {
      const number = lightsRef.current.length + 1;
      const key = crypto.randomUUID();
      const next = [
        ...lightsRef.current,
        {
          key,
          name: `Test light ${number}`,
          ...point,
          radius: 210,
          color: "#ffd78a",
        },
      ];
      lightsRef.current = next;
      setLights(next);
      onCanvasObjectsChange?.({
        lights: next,
        sounds: soundsRef.current,
        drawings: drawingsRef.current,
        templates: templatesRef.current,
        notes: notesRef.current,
      });
      activateSelection({ kind: "light", key });
      setActiveTool("select");
      return;
    }
    if (activeTool === "sound") {
      const number = soundsRef.current.length + 1;
      const key = crypto.randomUUID();
      const next = [
        ...soundsRef.current,
        {
          key,
          name: `Ambient source ${number}`,
          ...point,
          radius: 230,
          volume: 0.5,
          volumeMode: "distance" as const,
          loop: true,
        },
      ];
      soundsRef.current = next;
      setSounds(next);
      onCanvasObjectsChange?.({
        lights: lightsRef.current,
        sounds: next,
        drawings: drawingsRef.current,
        templates: templatesRef.current,
        notes: notesRef.current,
      });
      activateSelection({ kind: "sound", key });
      setActiveTool("select");
      return;
    }
    if (activeTool === "note") {
      const number = notesRef.current.length + 1;
      const key = crypto.randomUUID();
      const next = [
        ...notesRef.current,
        {
          key,
          name: `Scene note ${number}`,
          text: "A test note placed from the canvas harness.",
          ...point,
        },
      ];
      notesRef.current = next;
      setNotes(next);
      onCanvasObjectsChange?.({
        lights: lightsRef.current,
        sounds: soundsRef.current,
        drawings: drawingsRef.current,
        templates: templatesRef.current,
        notes: next,
      });
      activateSelection({ kind: "note", key });
      setActiveTool("select");
      return;
    }
    if (activeTool === "select") activateSelection(null);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = canvasPoint(event);
    setCursorPoint(point);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "token") {
      const next = tokensRef.current.map((token) =>
        token.key === drag.tokenKey
          ? {
              ...token,
              x: clamp(point.x + drag.offset.x, 28, CANVAS_WIDTH - 28),
              y: clamp(point.y + drag.offset.y, 28, CANVAS_HEIGHT - 28),
            }
          : token,
      );
      tokensRef.current = next;
      setTokens(next);
      return;
    }
    if (drag.kind === "vertex") {
      const nextPoint = { x: point.x, y: point.y };
      const next = wallsRef.current.map((wall) => ({
        ...wall,
        start:
          Math.hypot(wall.start.x - drag.point.x, wall.start.y - drag.point.y) <
          1
            ? nextPoint
            : wall.start,
        end:
          Math.hypot(wall.end.x - drag.point.x, wall.end.y - drag.point.y) < 1
            ? nextPoint
            : wall.end,
      }));
      wallsRef.current = next;
      setWalls(next);
      activateSelection({
        kind: "vertex",
        key: `${nextPoint.x}:${nextPoint.y}`,
        point: nextPoint,
      });
      dragRef.current = { ...drag, point: nextPoint };
      return;
    }
    if (drag.kind === "radius") {
      const pointerDistance = Math.hypot(
        point.x - drag.center.x,
        point.y - drag.center.y,
      );
      const radius = Math.max(20, pointerDistance);
      if (drag.selection.kind === "light") {
        const next = updateCanvasItem(
          lightsRef.current,
          drag.selection.key,
          (item) => ({ ...item, radius }),
        );
        lightsRef.current = next;
        setLights(next);
      } else if (drag.selection.kind === "token") {
        const scale = tokenScaleFromResize(
          pointerDistance,
          drag.initialPointerDistance ?? pointerDistance,
          drag.initialTokenScale ?? 1,
        );
        const next = updateCanvasItem(
          tokensRef.current,
          drag.selection.key,
          (item) => ({ ...item, scale }),
        );
        tokensRef.current = next;
        setTokens(next);
      } else if (drag.selection.kind === "sound") {
        const next = updateCanvasItem(
          soundsRef.current,
          drag.selection.key,
          (item) => ({ ...item, radius }),
        );
        soundsRef.current = next;
        setSounds(next);
      } else if (drag.selection.kind === "drawing") {
        const next = updateCanvasItem(
          drawingsRef.current,
          drag.selection.key,
          (item) => ({ ...item, radius }),
        );
        drawingsRef.current = next;
        setDrawings(next);
      } else {
        const next = updateCanvasItem(
          templatesRef.current,
          drag.selection.key,
          (item) => ({ ...item, radius }),
        );
        templatesRef.current = next;
        setTemplates(next);
      }
      return;
    }
    if (drag.kind === "object") {
      const nextPoint = {
        x: clamp(point.x + drag.offset.x, 0, CANVAS_WIDTH),
        y: clamp(point.y + drag.offset.y, 0, CANVAS_HEIGHT),
      };
      const selected = drag.selection;
      if (selected.kind === "wall" && drag.wall) {
        const midpoint = {
          x: (drag.wall.start.x + drag.wall.end.x) / 2,
          y: (drag.wall.start.y + drag.wall.end.y) / 2,
        };
        const delta = {
          x: nextPoint.x - midpoint.x,
          y: nextPoint.y - midpoint.y,
        };
        const next = wallsRef.current.map((wall) =>
          wall.key === selected.key
            ? {
                ...wall,
                start: {
                  x: drag.wall!.start.x + delta.x,
                  y: drag.wall!.start.y + delta.y,
                },
                end: {
                  x: drag.wall!.end.x + delta.x,
                  y: drag.wall!.end.y + delta.y,
                },
              }
            : wall,
        );
        wallsRef.current = next;
        setWalls(next);
      } else if (selected.kind === "light") {
        const next = updateCanvasItem(
          lightsRef.current,
          selected.key,
          (item) => ({
            ...item,
            ...nextPoint,
          }),
        );
        lightsRef.current = next;
        setLights(next);
      } else if (selected.kind === "sound") {
        const next = updateCanvasItem(
          soundsRef.current,
          selected.key,
          (item) => ({
            ...item,
            ...nextPoint,
          }),
        );
        soundsRef.current = next;
        setSounds(next);
      } else if (selected.kind === "drawing") {
        const next = updateCanvasItem(
          drawingsRef.current,
          selected.key,
          (item) => ({ ...item, ...nextPoint }),
        );
        drawingsRef.current = next;
        setDrawings(next);
      } else if (selected.kind === "template") {
        const next = updateCanvasItem(
          templatesRef.current,
          selected.key,
          (item) => ({ ...item, ...nextPoint }),
        );
        templatesRef.current = next;
        setTemplates(next);
      } else if (selected.kind === "note") {
        const next = updateCanvasItem(
          notesRef.current,
          selected.key,
          (item) => ({
            ...item,
            ...nextPoint,
          }),
        );
        notesRef.current = next;
        setNotes(next);
      }
      return;
    }
    const screenScale = event.currentTarget.getScreenCTM()?.a ?? 1;
    setViewport((current) => ({
      ...current,
      pan: {
        x: drag.pan.x + (event.clientX - drag.clientX) / screenScale,
        y: drag.pan.y + (event.clientY - drag.clientY) / screenScale,
      },
    }));
  }

  function endCanvasDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (drag.kind === "token") {
      let fall:
        | {
            tokenKey: string;
            feet: number;
            dice: number;
            position: CanvasPoint;
          }
        | undefined;
      const next = tokensRef.current.map((token) => {
        if (token.key !== drag.tokenKey || locationOrientation !== "side-on") {
          return token;
        }
        const grounding = groundSideOnPoint({
          point: { x: token.x, y: drag.startY },
          segments: wallsRef.current.map((wall) => ({
            start: wall.start,
            end: wall.end,
            blocksMovement: wall.blocksMovement !== false,
            open: wall.kind === "door" && wall.open,
          })),
          canvasBottom: CANVAS_HEIGHT,
        });
        const feet = (grounding.fallDistance / gridSize) * 5;
        const dice = sideOnFallDamageDice(grounding.fallDistance, gridSize);
        if (dice > 0) {
          fall = {
            tokenKey: token.key,
            feet,
            dice,
            position: { x: token.x, y: grounding.groundedY },
          };
        }
        return { ...token, y: grounding.groundedY };
      });
      tokensRef.current = next;
      setTokens(next);
      onTokensChange?.(next);
      if (fall) {
        setFallNotice(
          `${next.find(({ key }) => key === fall!.tokenKey)?.name ?? "Creature"} fell ${Math.round(fall.feet)} feet and takes ${fall.dice}d4 damage.`,
        );
        queueTokenFall(fall);
      } else {
        setFallNotice("");
      }
    } else if (
      drag.kind === "vertex" ||
      (drag.kind === "object" && drag.selection.kind === "wall")
    ) {
      onWallsChange?.(wallsRef.current);
      settleSideOnTokens(wallsRef.current, true);
    } else if (drag.kind === "radius" && drag.selection.kind === "token") {
      onTokensChange?.(tokensRef.current);
    } else if (drag.kind === "object" || drag.kind === "radius") {
      onCanvasObjectsChange?.({
        lights: lightsRef.current,
        sounds: soundsRef.current,
        drawings: drawingsRef.current,
        templates: templatesRef.current,
        notes: notesRef.current,
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const anchor = svgPoint(event);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((current) =>
      zoomViewportAtPoint(
        current,
        anchor,
        clamp(current.zoom * factor, 0.7, 3),
      ),
    );
  }

  function toggleLayer(key: SessionCanvasLayerKey) {
    setLayerVisibility((current) => ({ ...current, [key]: !current[key] }));
  }

  function settleSideOnTokens(
    supportWalls: readonly CanvasWall[],
    applyDamage: boolean,
  ) {
    if (locationOrientation !== "side-on") return;
    const falls: {
      tokenKey: string;
      feet: number;
      dice: number;
      position: CanvasPoint;
    }[] = [];
    const next = tokensRef.current.map((token) => {
      const grounding = groundSideOnPoint({
        point: token,
        segments: supportWalls.map((wall) => ({
          start: wall.start,
          end: wall.end,
          blocksMovement: wall.blocksMovement !== false,
          open: wall.kind === "door" && wall.open,
        })),
        canvasBottom: CANVAS_HEIGHT,
      });
      const feet = (grounding.fallDistance / gridSize) * 5;
      const dice = applyDamage
        ? sideOnFallDamageDice(grounding.fallDistance, gridSize)
        : 0;
      if (dice > 0) {
        falls.push({
          tokenKey: token.key,
          feet,
          dice,
          position: { x: token.x, y: grounding.groundedY },
        });
      }
      return { ...token, y: grounding.groundedY };
    });
    tokensRef.current = next;
    setTokens(next);
    onTokensChange?.(next);
    for (const fall of falls) queueTokenFall(fall);
    if (falls.length > 0) {
      const totalDice = falls.reduce((sum, fall) => sum + fall.dice, 0);
      setFallNotice(
        `${falls.length} ${falls.length === 1 ? "creature falls" : "creatures fall"}; resolve ${totalDice}d4 total fall damage.`,
      );
    }
  }

  function queueTokenFall(fall: {
    tokenKey: string;
    feet: number;
    dice: number;
    position: CanvasPoint;
  }) {
    fallCommitRef.current = fallCommitRef.current
      .then(() => onTokenFall?.(fall))
      .then(
        () => undefined,
        () => undefined,
      );
  }

  function removeSoundPlayback(soundKey: string) {
    const audio = audioRefs.current.get(soundKey);
    if (audio) {
      audio.muted = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRefs.current.delete(soundKey);
    }
    const playback = soundPlaybackRef.current[soundKey];
    if (playback?.url) URL.revokeObjectURL(playback.url);
    soundPlaybackRef.current = withoutSessionCanvasPlayback(
      soundPlaybackRef.current,
      soundKey,
    );
    setSoundPlayback((current) =>
      withoutSessionCanvasPlayback(current, soundKey),
    );
  }

  function deleteSelection() {
    if (!selection) return;
    if (selection.kind === "layer") return;
    if (selection.kind === "token") {
      const next = tokensRef.current.filter(({ key }) => key !== selection.key);
      tokensRef.current = next;
      setTokens(next);
      onTokensChange?.(next);
    } else if (selection.kind === "wall") {
      const next = wallsRef.current.filter(({ key }) => key !== selection.key);
      wallsRef.current = next;
      setWalls(next);
      onWallsChange?.(next);
      settleSideOnTokens(next, true);
    } else if (selection.kind === "vertex") {
      const connectedCount = wallsRef.current.filter(
        (wall) =>
          Math.hypot(
            wall.start.x - selection.point.x,
            wall.start.y - selection.point.y,
          ) < 1 ||
          Math.hypot(
            wall.end.x - selection.point.x,
            wall.end.y - selection.point.y,
          ) < 1,
      ).length;
      if (
        connectedCount > 1 &&
        !window.confirm(
          `Delete this vertex and its ${connectedCount} connected wall segments?`,
        )
      ) {
        return;
      }
      const next = wallsRef.current.filter(
        (wall) =>
          Math.hypot(
            wall.start.x - selection.point.x,
            wall.start.y - selection.point.y,
          ) >= 1 &&
          Math.hypot(
            wall.end.x - selection.point.x,
            wall.end.y - selection.point.y,
          ) >= 1,
      );
      wallsRef.current = next;
      setWalls(next);
      onWallsChange?.(next);
      settleSideOnTokens(next, true);
    } else {
      if (selection.kind === "sound") removeSoundPlayback(selection.key);
      const remove = <Item extends { key: string }>(items: readonly Item[]) =>
        items.filter(({ key }) => key !== selection.key);
      const nextObjects: CanvasAuthoredObjects = {
        lights:
          selection.kind === "light"
            ? remove(lightsRef.current)
            : [...lightsRef.current],
        sounds:
          selection.kind === "sound"
            ? remove(soundsRef.current)
            : [...soundsRef.current],
        drawings:
          selection.kind === "drawing"
            ? remove(drawingsRef.current)
            : [...drawingsRef.current],
        templates:
          selection.kind === "template"
            ? remove(templatesRef.current)
            : [...templatesRef.current],
        notes:
          selection.kind === "note"
            ? remove(notesRef.current)
            : [...notesRef.current],
      };
      lightsRef.current = [...nextObjects.lights];
      soundsRef.current = [...nextObjects.sounds];
      drawingsRef.current = [...nextObjects.drawings];
      templatesRef.current = [...nextObjects.templates];
      notesRef.current = [...nextObjects.notes];
      setLights([...nextObjects.lights]);
      setSounds([...nextObjects.sounds]);
      setDrawings([...nextObjects.drawings]);
      setTemplates([...nextObjects.templates]);
      setNotes([...nextObjects.notes]);
      onCanvasObjectsChange?.(nextObjects);
    }
    activateSelection(null);
    if (selection.kind === "token") setSelectedTokenKey("");
    if (selection.kind === "sound") setSelectedSoundKey("");
  }

  function updateSound(
    soundKey: string,
    transform: (sound: CanvasSound) => CanvasSound,
  ) {
    const next = updateCanvasItem(soundsRef.current, soundKey, transform);
    soundsRef.current = next;
    setSounds(next);
    onCanvasObjectsChange?.({
      lights: lightsRef.current,
      sounds: next,
      drawings: drawingsRef.current,
      templates: templatesRef.current,
      notes: notesRef.current,
    });
  }

  function selectAudioFile(file: File | undefined) {
    if (!selectedSound) return;
    const soundKey = selectedSound.key;
    const audio = audioRefs.current.get(soundKey);
    const previous = soundPlaybackRef.current[soundKey];
    if (audio) {
      audio.muted = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRefs.current.delete(soundKey);
    }
    if (previous?.url) URL.revokeObjectURL(previous.url);
    const url = file ? URL.createObjectURL(file) : undefined;
    setSoundPlayback((current) => {
      const next = { ...current };
      if (!file || !url) {
        delete next[soundKey];
        return next;
      }
      next[soundKey] = {
        url,
        fileName: file.name,
        armed: previous?.armed ?? false,
        playing: false,
        error: "",
      };
      return next;
    });
  }

  function updatePlaybackFromAudioElement(
    soundKey: string,
    url: string,
    transform: (playback: CanvasSoundPlayback) => CanvasSoundPlayback,
  ) {
    setSoundPlayback((current) => {
      const playback = current[soundKey];
      if (!playback || playback.url !== url) return current;
      return { ...current, [soundKey]: transform(playback) };
    });
  }

  async function togglePositionalPlayback() {
    if (!selectedSound || !selectedSoundPlayback) return;
    const soundKey = selectedSound.key;
    const audio = audioRefs.current.get(soundKey);
    if (!audio) return;
    if (selectedSoundPlayback.armed) {
      audio.muted = true;
      audio.pause();
      audio.currentTime = 0;
      setSoundPlayback((current) => ({
        ...current,
        [soundKey]: { ...current[soundKey], armed: false, error: "" },
      }));
      return;
    }
    setSoundPlayback((current) => ({
      ...current,
      [soundKey]: { ...current[soundKey], armed: true, error: "" },
    }));
    if (!listenerInsideSelectedSound || !soundEnabled) return;
    try {
      if (listenerToken) {
        audio.volume = effectiveSoundVolume(selectedSound, listenerToken);
      }
      audio.loop = selectedSound.loop;
      await audio.play();
    } catch {
      setSoundPlayback((current) => {
        const currentPlayback = current[soundKey];
        if (
          !currentPlayback ||
          currentPlayback.url !== selectedSoundPlayback.url
        ) {
          return current;
        }
        return {
          ...current,
          [soundKey]: {
            ...currentPlayback,
            armed: false,
            playing: false,
            error: "This audio file could not be played by the browser.",
          },
        };
      });
    }
  }

  function renderLayer(key: SessionCanvasLayerKey): ReactNode {
    if (!layerVisibility[key]) return null;
    if (
      !fixtureMode &&
      [
        "tiles",
        "regions",
        "special-effects",
        "coloration-effects",
        "particle-effects",
        "interface",
      ].includes(key)
    ) {
      return null;
    }
    const common = {
      "data-canvas-layer": key,
      opacity: layerOpacity[key],
    };

    if (key === "background") {
      return (
        <g {...common}>
          <rect
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fill="url(#scene-ground)"
          />
          {backgroundUrl && (
            <image
              href={backgroundUrl}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              preserveAspectRatio="none"
            />
          )}
          {!fixtureMode && !backgroundUrl && (
            <g aria-label="No map configured for this location">
              <rect
                x="215"
                y="150"
                width="1190"
                height="605"
                rx="40"
                fill="var(--color-base-200)"
                stroke="var(--color-base-300)"
                strokeWidth="8"
                strokeDasharray="20 16"
              />
              <text
                x="800"
                y="440"
                textAnchor="middle"
                fill="currentColor"
                opacity=".55"
                fontSize="28"
              >
                No map configured for this location
              </text>
            </g>
          )}
          {fixtureMode && (
            <>
              <rect
                x="215"
                y="150"
                width="1190"
                height="605"
                rx="40"
                fill="#17242a"
                stroke="#35474d"
                strokeWidth="18"
              />
              <path d="M250 185H1370V720H250Z" fill="url(#stone-floor)" />
              <path d="M250 420H1010V720H250Z" fill="#13262a" opacity=".72" />
              <path d="M1010 185H1370V420H1010Z" fill="#172a35" opacity=".9" />
              <path
                d="M800 185V720"
                stroke="#0a1115"
                strokeWidth="66"
                opacity=".55"
              />
              <path
                d="M800 218V687"
                stroke="#263940"
                strokeWidth="28"
                strokeDasharray="28 14"
                opacity=".75"
              />
              <text
                x="340"
                y="365"
                fill="#9eb0ad"
                opacity=".18"
                fontSize="42"
                letterSpacing="12"
              >
                LOWER ARCHIVE
              </text>
              <text
                x="1070"
                y="255"
                fill="#a9c7da"
                opacity=".18"
                fontSize="28"
                letterSpacing="8"
              >
                AETHER VAULT
              </text>
            </>
          )}
        </g>
      );
    }
    if (key === "background-effects") {
      return (
        <rect
          {...common}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill="url(#background-haze)"
          style={{ mixBlendMode: "soft-light" }}
        />
      );
    }
    if (key === "tiles") {
      if (!fixtureMode) return null;
      return (
        <g {...common}>
          <g transform="translate(465 295)">
            <ellipse rx="54" ry="22" fill="#050708" opacity=".55" />
            <path d="M-26 0h52l-8-46h-36Z" fill="#6f4d30" />
            <ellipse cy="-45" rx="23" ry="11" fill="#e59042" />
            <path d="M-12-48Q0-88 12-48" fill="#ffd36d" opacity=".8" />
          </g>
          <g transform="translate(1125 300)">
            <path
              d="M0-62 38 0 0 55-38 0Z"
              fill="#4ca6cc"
              opacity=".75"
              stroke="#a7e8ff"
              strokeWidth="5"
            />
            <path
              d="M0-62V55M-38 0H38"
              stroke="#d5f5ff"
              strokeWidth="2"
              opacity=".75"
            />
          </g>
          <g fill="#7a6851" stroke="#a39072" strokeWidth="3">
            <rect x="305" y="565" width="105" height="62" rx="5" />
            <rect x="1215" y="545" width="92" height="78" rx="5" />
            <path d="M320 565v-18h76v18M1230 545v-17h62v17" fill="none" />
          </g>
          <path
            d="M895 520q55-50 105 0t110 0"
            fill="none"
            stroke="#486d72"
            strokeWidth="22"
            opacity=".55"
          />
        </g>
      );
    }
    if (key === "grid") {
      return (
        <rect
          {...common}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill="url(#session-grid)"
          opacity={0.24 * layerOpacity[key]}
        />
      );
    }
    if (key === "regions") {
      if (!fixtureMode) return null;
      return (
        <g {...common}>
          <path
            d="M270 438H780V700H270Z"
            fill="#3bb7a0"
            opacity=".08"
            stroke="#65dbc5"
            strokeWidth="3"
            strokeDasharray="12 9"
          />
          {debugOverlays && (
            <text x="292" y="682" fill="#80e6d2" fontSize="20" fontWeight="700">
              Flooded stacks · difficult terrain
            </text>
          )}
        </g>
      );
    }
    if (key === "drawings") {
      return (
        <g {...common}>
          {drawings.map((drawing) => (
            <g
              key={drawing.key}
              transform={`translate(${drawing.x} ${drawing.y})`}
              className={activeTool === "select" ? "cursor-move" : ""}
              onPointerDown={(event) =>
                beginObjectDrag(
                  event,
                  { kind: "drawing", key: drawing.key },
                  drawing,
                )
              }
            >
              <circle
                r={drawing.radius}
                fill="none"
                stroke="#edcf67"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="2 14"
              />
              <path
                d={`M-${drawing.radius * 0.55} 0 Q0 -${drawing.radius * 0.55} ${drawing.radius * 0.55} 0`}
                fill="none"
                stroke="#edcf67"
                strokeWidth="5"
                strokeLinecap="round"
              />
              {selection?.kind === "drawing" &&
                selection.key === drawing.key && (
                  <circle
                    cx={drawing.radius}
                    r="9"
                    fill="#f3ca61"
                    stroke="#111"
                    strokeWidth="3"
                    className="cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginRadiusDrag(
                        event,
                        { kind: "drawing", key: drawing.key },
                        drawing,
                      )
                    }
                  />
                )}
            </g>
          ))}
        </g>
      );
    }
    if (key === "templates") {
      return (
        <g {...common}>
          {templates.map((template) => (
            <g
              key={template.key}
              className={activeTool === "select" ? "cursor-move" : ""}
              onPointerDown={(event) =>
                beginObjectDrag(
                  event,
                  { kind: "template", key: template.key },
                  template,
                )
              }
            >
              <circle
                cx={template.x}
                cy={template.y}
                r={template.radius}
                fill="#d96862"
                opacity=".09"
                stroke="#ef8a82"
                strokeWidth="4"
                strokeDasharray="12 8"
              />
              <path
                d={`M${template.x} ${template.y} ${template.x - template.radius * 1.15} ${template.y + template.radius * 1.3}A${template.radius * 1.7} ${template.radius * 1.7} 0 0 0 ${template.x + template.radius * 1.35} ${template.y + template.radius * 1.15}Z`}
                fill="#d96862"
                opacity=".08"
                stroke="#ef8a82"
                strokeWidth="3"
                strokeDasharray="9 8"
              />
              {selection?.kind === "template" &&
                selection.key === template.key && (
                  <circle
                    cx={template.x + template.radius}
                    cy={template.y}
                    r="9"
                    fill="#f3ca61"
                    stroke="#111"
                    strokeWidth="3"
                    className="cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginRadiusDrag(
                        event,
                        { kind: "template", key: template.key },
                        template,
                      )
                    }
                  />
                )}
            </g>
          ))}
        </g>
      );
    }
    if (key === "walls") {
      return (
        <g {...common}>
          {walls.map((wall) => {
            const color =
              wall.kind === "door"
                ? "#f5c85b"
                : wall.kind === "invisible-wall"
                  ? "#bd8cff"
                  : "#e15c58";
            return (
              <g
                key={wall.key}
                className={activeTool === "select" ? "cursor-move" : ""}
                onPointerDown={(event) =>
                  beginObjectDrag(
                    event,
                    { kind: "wall", key: wall.key },
                    {
                      x: (wall.start.x + wall.end.x) / 2,
                      y: (wall.start.y + wall.end.y) / 2,
                    },
                    wall,
                  )
                }
              >
                <line
                  x1={wall.start.x}
                  y1={wall.start.y}
                  x2={wall.end.x}
                  y2={wall.end.y}
                  stroke="#080b0d"
                  strokeWidth={
                    selection?.kind === "wall" && selection.key === wall.key
                      ? 15
                      : 11
                  }
                />
                <line
                  x1={wall.start.x}
                  y1={wall.start.y}
                  x2={wall.end.x}
                  y2={wall.end.y}
                  stroke={color}
                  strokeWidth="4"
                  strokeDasharray={
                    wall.kind === "door"
                      ? "15 8"
                      : wall.kind === "invisible-wall"
                        ? "3 8"
                        : undefined
                  }
                  opacity={debugOverlays ? 0.95 : 0.18}
                />
                {wall.kind === "door" && debugOverlays && (
                  <circle
                    cx={(wall.start.x + wall.end.x) / 2}
                    cy={(wall.start.y + wall.end.y) / 2}
                    r="11"
                    fill={wall.open ? "#63d7b1" : "#f5c85b"}
                    stroke="#111"
                    strokeWidth="3"
                  />
                )}
                {activeTool === "select" &&
                  ((selection?.kind === "wall" && selection.key === wall.key) ||
                    (selection?.kind === "vertex" &&
                      (Math.hypot(
                        wall.start.x - selection.point.x,
                        wall.start.y - selection.point.y,
                      ) < 1 ||
                        Math.hypot(
                          wall.end.x - selection.point.x,
                          wall.end.y - selection.point.y,
                        ) < 1))) && (
                    <>
                      {[wall.start, wall.end].map((vertex, index) => (
                        <circle
                          key={index}
                          cx={vertex.x}
                          cy={vertex.y}
                          r="9"
                          fill="#0a0d10"
                          stroke="#f3ca61"
                          strokeWidth="4"
                          className="cursor-crosshair"
                          onPointerDown={(event) =>
                            beginVertexDrag(event, vertex)
                          }
                        />
                      ))}
                    </>
                  )}
              </g>
            );
          })}
          {wallStart && cursorPoint && (
            <line
              x1={wallStart.x}
              y1={wallStart.y}
              x2={cursorPoint.x}
              y2={cursorPoint.y}
              stroke="#f5c85b"
              strokeWidth="5"
              strokeDasharray="12 8"
            />
          )}
        </g>
      );
    }
    if (key === "tokens") {
      return (
        <g {...common}>
          {tokens.map((token) => {
            const geometry = tokenSelectionGeometry(
              token.artworkView,
              token.scale,
            );
            const hitGeometry = tokenSelectionGeometry(token.artworkView, 1);
            return (
              <g key={token.key} transform={`translate(${token.x} ${token.y})`}>
                <g
                  transform={`scale(${token.scale ?? 1})`}
                  onPointerDown={(event) => beginTokenDrag(event, token)}
                  className={activeTool === "select" ? "cursor-grab" : ""}
                >
                  <title>{token.name}</title>
                  <rect
                    x={hitGeometry.bounds.x}
                    y={hitGeometry.bounds.y}
                    width={hitGeometry.bounds.width}
                    height={hitGeometry.bounds.height}
                    rx="8"
                    fill="transparent"
                    pointerEvents="all"
                  />
                  {!token.artworkUrl && listenerToken?.key === token.key && (
                    <circle
                      r="39"
                      fill="none"
                      stroke="#f0d27a"
                      strokeWidth="3"
                      strokeDasharray="5 6"
                      pointerEvents="none"
                    />
                  )}
                  {!token.artworkUrl && (
                    <>
                      <circle
                        r="31"
                        fill="#090c10"
                        stroke={
                          token.disposition === "hostile"
                            ? "#d95f59"
                            : token.disposition === "party"
                              ? "#69cfb8"
                              : "#90a0aa"
                        }
                        strokeWidth="5"
                      />
                      <circle r="25" fill={token.color} opacity=".9" />
                    </>
                  )}
                  {token.artworkUrl ? (
                    token.artworkView === "side-on" ? (
                      <image
                        href={token.artworkUrl}
                        x="-34"
                        y="-68"
                        width="68"
                        height="68"
                        preserveAspectRatio="xMidYMid meet"
                        filter="url(#canvas-token-shadow)"
                        pointerEvents="none"
                      />
                    ) : (
                      <image
                        href={token.artworkUrl}
                        x="-25"
                        y="-25"
                        width="50"
                        height="50"
                        preserveAspectRatio="xMidYMid slice"
                        clipPath="url(#canvas-token-art-clip)"
                        filter="url(#canvas-token-shadow)"
                        pointerEvents="none"
                      />
                    )
                  ) : (
                    <text
                      y="8"
                      textAnchor="middle"
                      fill="#101417"
                      fontSize="22"
                      fontWeight="900"
                    >
                      {token.initials}
                    </text>
                  )}
                  <rect
                    x="-27"
                    y={token.artworkView === "side-on" ? -8 : 35}
                    width="54"
                    height="6"
                    rx="3"
                    fill="#111"
                  />
                  <rect
                    x="-27"
                    y={token.artworkView === "side-on" ? -8 : 35}
                    width={token.disposition === "hostile" ? 34 : 47}
                    height="6"
                    rx="3"
                    fill={
                      token.disposition === "hostile" ? "#df625d" : "#5fd4a6"
                    }
                  />
                </g>
                {selection?.kind === "token" && selection.key === token.key && (
                  <>
                    <rect
                      x={geometry.bounds.x}
                      y={geometry.bounds.y}
                      width={geometry.bounds.width}
                      height={geometry.bounds.height}
                      rx="8"
                      fill="none"
                      stroke="#f3ca61"
                      strokeWidth="3"
                      strokeDasharray="7 5"
                      pointerEvents="none"
                    />
                    <circle
                      cx={geometry.resizeHandle.x}
                      cy={geometry.resizeHandle.y}
                      r="8"
                      fill="#f3ca61"
                      stroke="#111"
                      strokeWidth="3"
                      className="cursor-nwse-resize"
                      onPointerDown={(event) =>
                        beginRadiusDrag(
                          event,
                          { kind: "token", key: token.key },
                          token,
                          token.scale,
                        )
                      }
                    />
                  </>
                )}
              </g>
            );
          })}
        </g>
      );
    }
    if (key === "sounds") {
      return (
        <g {...common} opacity={layerOpacity[key]}>
          {selectedSound && listenerToken && (
            <line
              x1={selectedSound.x}
              y1={selectedSound.y}
              x2={listenerToken.x}
              y2={listenerToken.y}
              stroke={listenerInsideSelectedSound ? "#67ddb5" : "#df7272"}
              strokeWidth="3"
              strokeDasharray="8 9"
              opacity=".7"
              pointerEvents="none"
            />
          )}
          {sounds.map((sound) => {
            const selected =
              selection?.kind === "sound" && selection.key === sound.key;
            const playing = soundPlayback[sound.key]?.playing;
            return (
              <g
                key={sound.key}
                transform={`translate(${sound.x} ${sound.y})`}
                className={activeTool === "select" ? "cursor-pointer" : ""}
                onPointerDown={(event) =>
                  beginObjectDrag(
                    event,
                    { kind: "sound", key: sound.key },
                    sound,
                  )
                }
              >
                <circle
                  r={sound.radius}
                  fill={playing ? "#56d9ae" : "#8a79d6"}
                  opacity={playing ? 0.08 : 0.045}
                  stroke={
                    selected ? "#f0d27a" : playing ? "#67ddb5" : "#b7a6ff"
                  }
                  strokeWidth={selected ? 5 : 3}
                  strokeDasharray="8 11"
                  pointerEvents="none"
                />
                <circle
                  r="22"
                  fill={playing ? "#123c32" : "#171326"}
                  stroke={selected ? "#f0d27a" : "#b7a6ff"}
                  strokeWidth="3"
                />
                <text y="8" textAnchor="middle" fontSize="24" fill="#d8ceff">
                  ♫
                </text>
                {selected && (
                  <circle
                    cx={sound.radius}
                    r="9"
                    fill="#f3ca61"
                    stroke="#111"
                    strokeWidth="3"
                    className="cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginRadiusDrag(
                        event,
                        { kind: "sound", key: sound.key },
                        sound,
                      )
                    }
                  />
                )}
                {debugOverlays && (
                  <g pointerEvents="none">
                    <rect
                      x="-76"
                      y="34"
                      width="152"
                      height="26"
                      rx="13"
                      fill="#090c10"
                      opacity=".9"
                    />
                    <text
                      y="52"
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="700"
                      fill="#e6ddff"
                    >
                      {sound.name} · {sound.radius}px
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      );
    }
    if (key === "lighting") {
      return (
        <g {...common} opacity={layerOpacity[key]}>
          {lights.map((light) => {
            const selected =
              selection?.kind === "light" && selection.key === light.key;
            return (
              <g
                key={light.key}
                className={activeTool === "select" ? "cursor-move" : ""}
                onPointerDown={(event) =>
                  beginObjectDrag(
                    event,
                    { kind: "light", key: light.key },
                    light,
                  )
                }
              >
                <circle
                  cx={light.x}
                  cy={light.y}
                  r={light.radius}
                  fill="none"
                  stroke={light.color}
                  strokeWidth={selected ? 5 : 3}
                  strokeDasharray="10 10"
                  opacity={debugOverlays || selected ? 0.65 : 0}
                  pointerEvents="none"
                />
                <circle
                  cx={light.x}
                  cy={light.y}
                  r="12"
                  fill={light.color}
                  stroke="#111"
                  strokeWidth="3"
                />
                {selected && (
                  <circle
                    cx={light.x + light.radius}
                    cy={light.y}
                    r="9"
                    fill="#f3ca61"
                    stroke="#111"
                    strokeWidth="3"
                    className="cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginRadiusDrag(
                        event,
                        { kind: "light", key: light.key },
                        light,
                      )
                    }
                  />
                )}
              </g>
            );
          })}
        </g>
      );
    }
    if (key === "notes") {
      return (
        <g {...common}>
          {notes.map((note) => (
            <g
              key={note.key}
              transform={`translate(${note.x} ${note.y})`}
              className={activeTool === "select" ? "cursor-move" : ""}
              onPointerDown={(event) =>
                beginObjectDrag(event, { kind: "note", key: note.key }, note)
              }
            >
              <path
                d="M0-20 17 0 0 20-17 0Z"
                fill="#f0d27a"
                stroke="#1b1811"
                strokeWidth="4"
              />
              <text
                x="26"
                y="6"
                fill="#fff3c3"
                fontSize="18"
                fontWeight="700"
                opacity={debugOverlays ? 1 : 0}
              >
                {note.name}
              </text>
              {selection?.kind === "note" && selection.key === note.key && (
                <circle
                  r="27"
                  fill="none"
                  stroke="#f3ca61"
                  strokeWidth="3"
                  strokeDasharray="6 5"
                  pointerEvents="none"
                />
              )}
            </g>
          ))}
        </g>
      );
    }
    if (key === "controls") {
      return selection?.kind === "token" &&
        selectedToken &&
        selectedTokenGeometry ? (
        <g
          {...common}
          transform={`translate(${selectedToken.x + selectedTokenGeometry.center.x} ${selectedToken.y + selectedTokenGeometry.center.y})`}
          pointerEvents="none"
        >
          <circle
            r={selectedTokenGeometry.radius}
            fill="none"
            stroke="#f3ca61"
            strokeWidth="3"
            strokeDasharray="7 5"
          />
          <path
            d={`M${-selectedTokenGeometry.radius - 8} 0H${-selectedTokenGeometry.radius + 6}M${selectedTokenGeometry.radius - 6} 0H${selectedTokenGeometry.radius + 8}M0 ${-selectedTokenGeometry.radius - 8}V${-selectedTokenGeometry.radius + 6}M0 ${selectedTokenGeometry.radius - 6}V${selectedTokenGeometry.radius + 8}`}
            stroke="#f3ca61"
            strokeWidth="3"
          />
        </g>
      ) : null;
    }
    if (key === "special-effects") {
      return effectsPlaying ? (
        <g {...common} className="session-canvas-pulse" pointerEvents="none">
          <circle
            cx="1125"
            cy="300"
            r="72"
            fill="none"
            stroke="#82d8ff"
            strokeWidth="5"
            opacity=".4"
          />
          <path
            d="M1125 218V382M1043 300H1207"
            stroke="#bdeeff"
            strokeWidth="3"
            opacity=".45"
          />
        </g>
      ) : null;
    }
    if (key === "illumination-effects") {
      return (
        <g {...common} style={{ mixBlendMode: "screen" }} pointerEvents="none">
          {lights.map((light) => (
            <circle
              key={light.key}
              cx={light.x}
              cy={light.y}
              r={light.radius}
              fill={`url(#light-${light.key})`}
            />
          ))}
        </g>
      );
    }
    if (key === "coloration-effects") {
      return (
        <g {...common} style={{ mixBlendMode: "color" }} pointerEvents="none">
          <circle cx="1125" cy="300" r="230" fill="#1f8cd0" opacity=".1" />
          <circle cx="500" cy="295" r="260" fill="#e17b32" opacity=".08" />
        </g>
      );
    }
    if (key === "darkness-effects") {
      return (
        <rect
          {...common}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill="#020509"
          opacity={darkness * layerOpacity[key]}
          pointerEvents="none"
        />
      );
    }
    if (key === "visibility") {
      if (!fogEnabled || visionPolygon.length < 3) return null;
      return (
        <path
          {...common}
          d={`M0 0H${CANVAS_WIDTH}V${CANVAS_HEIGHT}H0Z ${pointPath(visionPolygon)} Z`}
          fill="#030609"
          fillRule="evenodd"
          opacity={0.82 * layerOpacity[key]}
          pointerEvents="none"
        />
      );
    }
    if (key === "particle-effects") {
      if (!effectsPlaying) return null;
      return (
        <g
          {...common}
          className="session-canvas-particles"
          pointerEvents="none"
        >
          {PARTICLES.map((particle, index) => (
            <circle
              key={index}
              cx={particle.x}
              cy={particle.y}
              r={particle.radius}
              fill="#d7cfaa"
              opacity=".3"
              style={{ animationDelay: `${particle.delay}s` }}
            />
          ))}
        </g>
      );
    }
    if (key === "weather-effects") {
      if (!effectsPlaying || weather === "none") return null;
      if (weather === "rain")
        return (
          <g {...common} className="session-canvas-rain" pointerEvents="none">
            {RAIN.map((drop, index) => (
              <line
                key={index}
                x1={drop.x}
                y1={drop.y}
                x2={drop.x - 7}
                y2={drop.y + drop.length}
                stroke="#a9d9e8"
                strokeWidth="2"
                opacity=".38"
                style={{ animationDelay: `${drop.delay}s` }}
              />
            ))}
          </g>
        );
      return (
        <g
          {...common}
          className={
            weather === "snow" ? "session-canvas-snow" : "session-canvas-embers"
          }
          pointerEvents="none"
        >
          {PARTICLES.map((particle, index) => (
            <circle
              key={index}
              cx={particle.x}
              cy={particle.y}
              r={weather === "snow" ? particle.radius + 2 : particle.radius}
              fill={weather === "snow" ? "#e9f5f6" : "#ff9b45"}
              opacity=".55"
              style={{ animationDelay: `${particle.delay}s` }}
            />
          ))}
        </g>
      );
    }
    if (key === "filter-effects") {
      return (
        <rect
          {...common}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill="url(#canvas-vignette)"
          pointerEvents="none"
        />
      );
    }
    if (key === "interface") {
      return (
        <g {...common} pointerEvents="none">
          {tokens.map((token) => (
            <g
              key={token.key}
              transform={`translate(${token.x} ${token.y + 60})`}
            >
              <rect
                x="-58"
                y="-14"
                width="116"
                height="28"
                rx="14"
                fill="#050708"
                opacity=".86"
              />
              <text
                y="6"
                textAnchor="middle"
                fill="#eef3f1"
                fontSize="15"
                fontWeight="700"
              >
                {token.name}
              </text>
            </g>
          ))}
          <g transform="translate(1315 665)">
            <rect
              x="-120"
              y="-28"
              width="240"
              height="56"
              rx="14"
              fill="#080b0d"
              opacity=".88"
            />
            <text
              textAnchor="middle"
              y="-4"
              fill="#f0d27a"
              fontSize="17"
              fontWeight="800"
            >
              Aether Vault
            </text>
            <text textAnchor="middle" y="17" fill="#a8b3b6" fontSize="13">
              Restricted region
            </text>
          </g>
        </g>
      );
    }
    return null;
  }

  const layersByGroup = SESSION_CANVAS_LAYERS.reduce(
    (groups, layer) => {
      groups[layer.group].push(layer);
      return groups;
    },
    { scene: [], effects: [], visibility: [], interface: [] } as Record<
      SessionCanvasLayerGroup,
      (typeof SESSION_CANVAS_LAYERS)[number][]
    >,
  );
  const authoredObjectsByLayer: Partial<
    Record<
      SessionCanvasLayerKey,
      readonly { selection: CanvasSelection; label: string; type: string }[]
    >
  > = {
    tokens: tokens.map((token) => ({
      selection: { kind: "token", key: token.key },
      label: token.name,
      type: `${token.disposition} token`,
    })),
    walls: walls.map((wall, index) => ({
      selection: { kind: "wall", key: wall.key },
      label: `${wall.kind === "door" ? "Door" : wall.kind === "invisible-wall" ? "Invisible wall" : "Wall"} ${index + 1}`,
      type: wall.open ? "open boundary" : "movement boundary",
    })),
    sounds: sounds.map((sound) => ({
      selection: { kind: "sound", key: sound.key },
      label: sound.name,
      type: "audio source",
    })),
    lighting: lights.map((light) => ({
      selection: { kind: "light", key: light.key },
      label: light.name,
      type: "light source",
    })),
    notes: notes.map((note) => ({
      selection: { kind: "note", key: note.key },
      label: note.name,
      type: "scene note",
    })),
    drawings: drawings.map((drawing, index) => ({
      selection: { kind: "drawing", key: drawing.key },
      label: drawing.name ?? `Drawing ${index + 1}`,
      type: "drawing",
    })),
    templates: templates.map((template, index) => ({
      selection: { kind: "template", key: template.key },
      label: template.name ?? `Template ${index + 1}`,
      type: "area template",
    })),
  };
  const inspectorTabs: InspectorTab[] = fixtureMode
    ? ["layers", "scene", "selection"]
    : content
      ? ["selection", "layers", "content"]
      : ["selection", "layers"];
  const CanvasRoot = fixtureMode ? "main" : "section";
  const selectionLabel = (() => {
    if (!selection) return "Nothing selected";
    if (selection.kind === "layer")
      return (
        SESSION_CANVAS_LAYERS.find(({ key }) => key === selection.key)?.label ??
        "Canvas layer"
      );
    if (selection.kind === "token")
      return tokens.find(({ key }) => key === selection.key)?.name ?? "Token";
    if (selection.kind === "sound")
      return (
        sounds.find(({ key }) => key === selection.key)?.name ?? "Audio source"
      );
    if (selection.kind === "light")
      return (
        lights.find(({ key }) => key === selection.key)?.name ?? "Light source"
      );
    if (selection.kind === "note")
      return notes.find(({ key }) => key === selection.key)?.name ?? "Note";
    if (selection.kind === "drawing")
      return (
        drawings.find(({ key }) => key === selection.key)?.name ?? "Drawing"
      );
    if (selection.kind === "template")
      return (
        templates.find(({ key }) => key === selection.key)?.name ?? "Template"
      );
    if (selection.kind === "vertex") return "Wall vertex";
    if (selection.kind === "wall") {
      const index = walls.findIndex(({ key }) => key === selection.key);
      const wall = walls[index];
      if (!wall) return "Wall";
      return `${wall.kind === "door" ? "Door" : wall.kind === "invisible-wall" ? "Invisible wall" : "Wall"} ${index + 1}`;
    }
    return "Canvas object";
  })();

  const renderLayerProperties = (
    layerKey: SessionCanvasLayerKey,
    includeSoundSourceEditor = false,
  ) => {
    const layerDefinition = SESSION_CANVAS_LAYERS.find(
      ({ key }) => key === layerKey,
    );
    if (!layerDefinition) return null;

    return (
      <div className="min-w-0 overflow-x-hidden border-t border-primary/20 bg-base-100/55 px-3 pt-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[11px] leading-4 text-base-content/45">
            {layerDefinition.description}
          </p>
          <span className="shrink-0 rounded border border-base-300 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-base-content/40 uppercase">
            {layerDefinition.graphical ? "render" : "simulation"}
          </span>
        </div>
        {layerKey === "sounds" && includeSoundSourceEditor && (
          <section
            className="mt-3 grid w-full min-w-0 max-w-full gap-3 overflow-hidden rounded-xl border border-violet-300/15 bg-violet-300/[.05] p-3"
            style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
          >
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <div className="grid min-w-0 gap-1 text-[10px] text-base-content/55">
                <span>Audio source</span>
                <PanelSelect
                  ariaLabel="Audio source"
                  value={selectedSound?.key ?? ""}
                  options={sounds.map((sound) => ({
                    value: sound.key,
                    label: sound.name,
                  }))}
                  onChange={(soundKey) =>
                    activateSelection({ kind: "sound", key: soundKey })
                  }
                />
              </div>
              <div className="grid min-w-0 gap-1 text-[10px] text-base-content/55">
                <span>Listener token</span>
                <PanelSelect
                  ariaLabel="Listener token"
                  value={listenerToken?.key ?? ""}
                  options={tokens
                    .filter(({ disposition }) => disposition !== "hostile")
                    .map((token) => ({
                      value: token.key,
                      label: token.name,
                    }))}
                  onChange={(tokenKey) => {
                    setListenerTokenKey(tokenKey);
                  }}
                />
              </div>
            </div>
            <div className="flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[.14em] text-violet-200/65 uppercase">
                  Positional audio
                </p>
                <p className="mt-1 block max-w-full overflow-hidden text-xs font-semibold text-ellipsis whitespace-nowrap text-base-content/80">
                  {selectedSoundPlayback?.fileName || "No audio file selected"}
                </p>
              </div>
              <StatusIndicator
                tone={
                  selectedSoundPlayback?.playing
                    ? "success"
                    : selectedSoundPlayback?.armed || selectedSoundPlayback
                      ? "info"
                      : "neutral"
                }
                pulse={selectedSoundPlayback?.playing}
                label={<span className="sr-only">Audio playback status</span>}
              />
            </div>
            <FileInputTrigger
              size="sm"
              fullWidth
              className="min-w-0 max-w-full overflow-hidden border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
            >
              <span className="truncate">Choose audio file</span>
              <FileInput
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                className="sr-only"
                onChange={(event) => {
                  selectAudioFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </FileInputTrigger>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.25rem] gap-2">
              <Button
                type="button"
                size="sm"
                fullWidth
                className="min-w-0 max-w-full border-base-300 bg-base-100/80 text-base-content disabled:text-base-content/30"
                disabled={!selectedSoundPlayback}
                onClick={() => void togglePositionalPlayback()}
              >
                {selectedSoundPlayback?.armed
                  ? "Disable playback"
                  : "Enable playback"}
              </Button>
              <Button
                type="button"
                tone="ghost"
                size="sm"
                fullWidth
                className="min-w-0 max-w-full px-2 text-base-content/55"
                disabled={!selectedSoundPlayback}
                onClick={() => selectAudioFile(undefined)}
              >
                Clear
              </Button>
            </div>
            {selectedSound && listenerToken && (
              <div
                className={`rounded-lg border px-2.5 py-2 text-[10px] ${listenerInsideSelectedSound ? "border-emerald-300/20 bg-emerald-300/[.06] text-emerald-200" : "border-red-300/15 bg-red-300/[.04] text-red-200/75"}`}
              >
                Listening from {listenerToken.name} ·{" "}
                {listenerInsideSelectedSound
                  ? `in range · effective volume ${Math.round(effectiveSoundVolume(selectedSound, listenerToken) * 100)}%`
                  : `${Math.round((selectedSoundDistance ?? 0) - selectedSound.radius)}px beyond the source range`}
              </div>
            )}
            {selectedSound && (
              <>
                <Label className="grid min-w-0 max-w-full gap-1.5 overflow-hidden">
                  <span className="flex justify-between text-[10px] text-base-content/55">
                    <span>Effective range</span>
                    <span>{selectedSound.radius}px</span>
                  </span>
                  <Range
                    tone="info"
                    controlSize="xs"
                    min="60"
                    max="600"
                    step="10"
                    className="w-full min-w-0 max-w-full"
                    value={selectedSound.radius}
                    onChange={(event) => {
                      const radius = Number(event.currentTarget.value);
                      updateSound(selectedSound.key, (sound) => ({
                        ...sound,
                        radius,
                      }));
                    }}
                  />
                </Label>
                <div className="grid min-w-0 gap-1 text-[10px] text-base-content/55">
                  <span>Volume behavior</span>
                  <PanelSelect<CanvasSound["volumeMode"]>
                    ariaLabel="Volume behavior"
                    value={selectedSound.volumeMode}
                    options={[
                      { value: "distance", label: "Scale with distance" },
                      { value: "constant", label: "Constant within range" },
                    ]}
                    onChange={(volumeMode) => {
                      updateSound(selectedSound.key, (sound) => ({
                        ...sound,
                        volumeMode,
                      }));
                    }}
                  />
                </div>
                <Label className="grid min-w-0 max-w-full gap-1.5 overflow-hidden">
                  <span className="flex justify-between text-[10px] text-base-content/55">
                    <span>Base volume</span>
                    <span>{Math.round(selectedSound.volume * 100)}%</span>
                  </span>
                  <Range
                    tone="secondary"
                    controlSize="xs"
                    min="0"
                    max="1"
                    step="0.01"
                    className="w-full min-w-0 max-w-full"
                    value={selectedSound.volume}
                    onChange={(event) => {
                      const volume = Number(event.currentTarget.value);
                      updateSound(selectedSound.key, (sound) => ({
                        ...sound,
                        volume,
                      }));
                    }}
                  />
                </Label>
                <Toggle
                  label="Loop continuously"
                  tone="secondary"
                  controlSize="xs"
                  wrapperClassName="min-w-0 flex-row-reverse justify-between text-xs text-base-content/65"
                  checked={selectedSound.loop}
                  onChange={(event) => {
                    const loop = event.currentTarget.checked;
                    updateSound(selectedSound.key, (sound) => ({
                      ...sound,
                      loop,
                    }));
                  }}
                />
              </>
            )}
            <p className="text-[10px] leading-4 text-base-content/35">
              Playback uses the selected listener token as this client&apos;s
              perspective. Dragging a friendly token makes it the listener and
              updates volume live.
            </p>
            {selectedSoundPlayback?.error && (
              <Alert tone="error" className="py-2 text-[10px]">
                {selectedSoundPlayback.error}
              </Alert>
            )}
          </section>
        )}
        {layerKey === "grid" && (
          <Label className="mt-3 grid min-w-0 max-w-full gap-1.5 overflow-hidden">
            <span className="flex justify-between text-[10px] text-base-content/50">
              <span>Five-foot scale</span>
              <span>{gridSize}px</span>
            </span>
            <Range
              controlSize="xs"
              min="24"
              max="160"
              step="1"
              className="w-full min-w-0 max-w-full"
              value={gridSize}
              onChange={(event) =>
                setGridSize(Number(event.currentTarget.value))
              }
            />
          </Label>
        )}
        <Label className="mt-3 grid min-w-0 max-w-full gap-1.5 overflow-hidden">
          <span className="flex justify-between text-[10px] text-base-content/50">
            <span>
              {layerKey === "sounds"
                ? "Debug overlay opacity"
                : "Layer opacity"}
            </span>
            <span>{Math.round(layerOpacity[layerKey] * 100)}%</span>
          </span>
          <Range
            controlSize="xs"
            min="0"
            max="1"
            step="0.05"
            className="w-full min-w-0 max-w-full"
            value={layerOpacity[layerKey]}
            onChange={(event) => {
              const opacity = Number(event.currentTarget.value);
              setLayerOpacity((current) => ({
                ...current,
                [layerKey]: opacity,
              }));
            }}
          />
        </Label>
      </div>
    );
  };

  return (
    <CanvasRoot
      aria-label={fixtureMode ? undefined : `${locationName} session canvas`}
      className={`session-canvas-shell flex h-full min-w-0 w-full max-w-full flex-col overflow-hidden bg-base-100 text-base-content ${fixtureMode ? "min-h-[42rem] rounded-box border border-base-300 shadow-xl" : "min-h-0"}`}
    >
      {Object.entries(soundPlayback).map(([soundKey, playback]) => (
        <audio
          key={`${soundKey}:${playback.url}`}
          ref={(element) => {
            if (element) audioRefs.current.set(soundKey, element);
            else audioRefs.current.delete(soundKey);
          }}
          src={playback.url}
          onPlay={() =>
            updatePlaybackFromAudioElement(
              soundKey,
              playback.url,
              (current) => ({
                ...current,
                playing: true,
                error: "",
              }),
            )
          }
          onPause={() =>
            updatePlaybackFromAudioElement(
              soundKey,
              playback.url,
              (current) => ({ ...current, playing: false }),
            )
          }
          onEnded={() =>
            updatePlaybackFromAudioElement(
              soundKey,
              playback.url,
              (current) => ({
                ...current,
                armed: false,
                playing: false,
              }),
            )
          }
          onError={() =>
            updatePlaybackFromAudioElement(
              soundKey,
              playback.url,
              (current) => ({
                ...current,
                armed: false,
                playing: false,
                error: "This audio file could not be decoded.",
              }),
            )
          }
        />
      ))}
      {fixtureMode ? (
        <header className="flex min-h-18 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-base-300 bg-base-200/90 px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            {onBack ? (
              <IconButton
                type="button"
                tone="ghost"
                size="sm"
                aria-label="Back to campaign locations"
                onClick={onBack}
              >
                ←
              </IconButton>
            ) : (
              <RouterButtonLink
                href="/sessions"
                tone="ghost"
                size="sm"
                className="aspect-square p-0"
                aria-label="Leave canvas laboratory"
              >
                ←
              </RouterButtonLink>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold tracking-wide">
                  {locationName}
                </p>
                <Badge tone="primary" outline size="sm">
                  {fixtureMode ? "Canvas lab" : locationKind || "Location"}
                </Badge>
              </div>
              <p className="truncate text-sm text-base-content/55">
                {fixtureMode
                  ? "Experimental session workspace · local test state"
                  : "Configure layers and prepare this location for play"}
              </p>
            </div>
          </div>
          <div className="session-canvas-header-actions ml-auto flex flex-wrap items-center justify-end gap-2">
            <>
              <StatusIndicator
                tone={
                  anyAudioPlaying
                    ? "success"
                    : soundEnabled
                      ? "info"
                      : "neutral"
                }
                pulse={anyAudioPlaying}
                className="hidden rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/60 md:inline-flex"
                label={
                  !soundEnabled || !layerVisibility.sounds
                    ? "Audio muted"
                    : anyAudioPlaying
                      ? "Positional audio playing"
                      : Object.keys(soundPlayback).length
                        ? "Positional audio ready"
                        : `${sounds.length} ambient sources`
                }
              />
              <Button
                type="button"
                tone="ghost"
                size="sm"
                onClick={() => setSoundEnabled((value) => !value)}
              >
                {soundEnabled ? "Sound on" : "Sound off"}
              </Button>
              <Button
                type="button"
                tone="primary"
                size="sm"
                onClick={() => setEffectsPlaying((value) => !value)}
              >
                {effectsPlaying ? "Pause effects" : "Play effects"}
              </Button>
            </>
            <div
              className="hidden min-w-36 rounded-box border border-dashed border-base-300 px-3 py-1.5 xl:block"
              aria-label="Session controls"
            >
              {sessionControls ?? (
                <>
                  <span className="block text-xs font-semibold">
                    Session controls
                  </span>
                  <span className="block text-xs text-base-content/45">
                    Available during play
                  </span>
                </>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <div
        className={`session-canvas-layout grid min-h-0 min-w-0 w-full max-w-full flex-1 ${fixtureMode ? "grid-cols-[4rem_minmax(0,1fr)_22rem]" : "grid-cols-[3rem_minmax(0,1fr)_22rem]"}`}
      >
        <nav
          className={`flex min-h-0 flex-col items-center border-r border-base-300/70 bg-base-200/55 backdrop-blur-xl ${fixtureMode ? "gap-2 py-3" : "gap-1.5 py-2"}`}
          aria-label="Canvas tools"
        >
          {availableTools.map((definition) => (
            <ToolButton
              key={definition.key}
              definition={definition}
              active={activeTool === definition.key}
              compact={!fixtureMode}
              onSelect={() => {
                setActiveTool(definition.key);
                setWallStart(undefined);
              }}
            />
          ))}
          {!fixtureMode && (
            <>
              <span className="my-1 h-px w-7 bg-base-300/70" />
              <IconButton
                type="button"
                className={`grid h-9 w-9 place-items-center rounded-lg border text-base ${inspectorTab === "content" ? "border-primary bg-primary text-primary-content" : "border-base-300/70 bg-base-100/65 text-base-content/70"}`}
                aria-label="Add creatures, items, or discoveries"
                title="Add creatures, items, or discoveries"
                onClick={() => setInspectorTab("content")}
              >
                +
              </IconButton>
              <IconButton
                type="button"
                className={`grid h-9 w-9 place-items-center rounded-lg border text-base ${inspectorTab === "layers" ? "border-primary bg-primary text-primary-content" : "border-base-300/70 bg-base-100/65 text-base-content/70"}`}
                aria-label="Configure layers, audio, and effects"
                title="Configure layers, audio, and effects"
                onClick={() => setInspectorTab("layers")}
              >
                ◫
              </IconButton>
            </>
          )}
          <div className="mt-auto grid gap-2">
            <IconButton
              type="button"
              className={`grid place-items-center border ${fixtureMode ? "h-10 w-10 rounded-xl" : "h-9 w-9 rounded-lg"} ${debugOverlays ? "border-secondary/40 bg-secondary/10 text-secondary" : "border-base-300 text-base-content/55"}`}
              title="Toggle authoring overlays"
              aria-label="Toggle authoring overlays"
              onClick={() => setDebugOverlays((value) => !value)}
            >
              ⌘
            </IconButton>
            <IconButton
              type="button"
              className={`grid place-items-center border border-base-300 text-base-content/55 hover:text-base-content ${fixtureMode ? "h-10 w-10 rounded-xl" : "h-9 w-9 rounded-lg"}`}
              title="Reset view"
              aria-label="Reset view"
              onClick={() => setViewport({ pan: { x: 0, y: 0 }, zoom: 1 })}
            >
              ⌂
            </IconButton>
          </div>
        </nav>

        <section
          className={`relative overflow-hidden bg-base-300 ${fixtureMode ? "min-h-[28rem]" : "min-h-0"}`}
        >
          <div
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-box border border-base-300 bg-base-100/90 p-1 text-base-content shadow-xl backdrop-blur ${fixtureMode ? "top-3" : "top-16"}`}
          >
            <IconButton
              type="button"
              tone="ghost"
              size="xs"
              aria-label="Zoom out"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: clamp(current.zoom / 1.2, 0.7, 3),
                }))
              }
            >
              −
            </IconButton>
            <span className="min-w-16 text-center text-xs font-semibold text-base-content/65">
              {Math.round(viewport.zoom * 100)}%
            </span>
            <IconButton
              type="button"
              tone="ghost"
              size="xs"
              aria-label="Zoom in"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: clamp(current.zoom * 1.2, 0.7, 3),
                }))
              }
            >
              +
            </IconButton>
            <span className="mx-1 h-5 w-px bg-base-300" />
            <span className="px-2 text-xs text-base-content/55">
              {availableTools.find(({ key }) => key === activeTool)?.label}
            </span>
          </div>

          <svg
            ref={svgRef}
            tabIndex={0}
            aria-label={`Interactive canvas for ${locationName}. ${fixtureMode ? "Use arrow keys to move the selected token or pan" : "Focus the canvas and use arrow keys to pan"}, and plus or minus to zoom.`}
            className={`h-full w-full touch-none select-none ${activeTool === "pan" ? "cursor-grab" : activeTool === "select" ? "cursor-default" : "cursor-crosshair"}`}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={endCanvasDrag}
            onPointerCancel={endCanvasDrag}
            onWheel={handleWheel}
          >
            <defs>
              <clipPath id="canvas-token-art-clip">
                <circle r="25" />
              </clipPath>
              <filter
                id="canvas-token-shadow"
                x="-75%"
                y="-75%"
                width="250%"
                height="250%"
              >
                <feDropShadow
                  dx="0"
                  dy="4"
                  stdDeviation="3.5"
                  floodColor="#000"
                  floodOpacity="0.95"
                />
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="1.25"
                  floodColor="#f4d06f"
                  floodOpacity="0.8"
                />
              </filter>
              <linearGradient id="scene-ground" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#071015" />
                <stop offset="1" stopColor="#152126" />
              </linearGradient>
              <pattern
                id="stone-floor"
                width="76"
                height="48"
                patternUnits="userSpaceOnUse"
              >
                <rect width="76" height="48" fill="#1c2b30" />
                <path
                  d="M0 1h76M0 47h76M38 1v22M0 24h76M18 24v23M58 24v23"
                  stroke="#314147"
                  strokeWidth="2"
                  opacity=".5"
                />
              </pattern>
              <pattern
                id="session-grid"
                width={gridSize}
                height={gridSize}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                  fill="none"
                  stroke="#9bb1b8"
                  strokeWidth="1"
                />
              </pattern>
              <radialGradient id="background-haze">
                <stop stopColor="#2d7984" stopOpacity=".18" />
                <stop offset="1" stopColor="#10171b" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="canvas-vignette">
                <stop offset="55%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity=".64" />
              </radialGradient>
              {lights.map((light) => (
                <radialGradient key={light.key} id={`light-${light.key}`}>
                  <stop stopColor={light.color} stopOpacity=".72" />
                  <stop offset=".42" stopColor={light.color} stopOpacity=".2" />
                  <stop offset="1" stopColor={light.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>
            <g
              transform={`translate(${viewport.pan.x} ${viewport.pan.y}) scale(${viewport.zoom})`}
            >
              {SESSION_CANVAS_LAYERS.map(({ key }) => (
                <g key={key}>{renderLayer(key)}</g>
              ))}
            </g>
          </svg>

          <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end justify-between gap-4">
            <div className="rounded-box border border-base-300 bg-base-100/90 px-3 py-2 text-xs text-base-content/60 shadow-xl backdrop-blur">
              <span className="font-bold text-base-content/80">
                {selectedToken?.name ?? "No token selected"}
              </span>
              <span className="mx-2 text-base-content/25">•</span>
              {Math.round(cursorPoint?.x ?? 0)},{" "}
              {Math.round(cursorPoint?.y ?? 0)}
              <span className="mx-2 text-base-content/25">•</span>
              {
                SESSION_CANVAS_LAYERS.filter(({ key }) => layerVisibility[key])
                  .length
              }{" "}
              layers active
            </div>
            {selection && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-box border border-primary/30 bg-base-100/92 px-2 py-1.5 text-xs shadow-xl backdrop-blur">
                <span className="max-w-48 truncate font-semibold text-base-content/80">
                  {selectionLabel}
                </span>
                <span className="text-base-content/35">
                  {selection.kind === "layer"
                    ? "Layer settings"
                    : `Drag to move${selection.kind === "vertex" ? " connected walls" : ""}`}
                </span>
                {selection.kind !== "layer" && (
                  <Button
                    type="button"
                    tone="danger"
                    size="xs"
                    onClick={deleteSelection}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
            <div className="rounded-box border border-base-300 bg-base-100/90 px-3 py-2 text-xs text-base-content/60 shadow-xl backdrop-blur">
              {fixtureMode
                ? "Drag or arrow keys to pan · Scroll or +/- to zoom"
                : "Choose Pan to drag · Focus canvas for arrow and +/- controls"}
            </div>
          </div>
          {fallNotice && (
            <Alert
              tone="error"
              className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-lg border border-error/30 bg-base-100/92 px-4 py-2 text-sm font-semibold text-error shadow-xl backdrop-blur"
            >
              {fallNotice}
            </Alert>
          )}
        </section>

        <aside className="session-canvas-inspector flex min-h-0 min-w-0 flex-col overflow-y-auto border-l border-base-300/70 bg-base-200/65 shadow-[-12px_0_30px_rgba(0,0,0,.12)] backdrop-blur-xl">
          <Tabs
            aria-label="Canvas inspector"
            className="sticky top-0 z-10 flex shrink-0 border-b border-base-300 bg-base-200/90 p-2 backdrop-blur-xl"
          >
            {inspectorTabs.map((tab, index) => (
              <Tab
                key={tab}
                id={`canvas-tab-${tab}`}
                active={inspectorTab === tab}
                className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-semibold capitalize ${inspectorTab === tab ? "bg-primary/15 text-primary" : "text-base-content/50 hover:text-base-content/80"}`}
                aria-controls="canvas-inspector-panel"
                tabIndex={inspectorTab === tab ? 0 : -1}
                onClick={() => setInspectorTab(tab)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  event.preventDefault();
                  const delta = event.key === "ArrowRight" ? 1 : -1;
                  const next =
                    inspectorTabs[
                      (index + delta + inspectorTabs.length) %
                        inspectorTabs.length
                    ];
                  setInspectorTab(next);
                  requestAnimationFrame(() =>
                    document.getElementById(`canvas-tab-${next}`)?.focus(),
                  );
                }}
              >
                {tab}
              </Tab>
            ))}
          </Tabs>

          <div
            id="canvas-inspector-panel"
            role="tabpanel"
            aria-labelledby={`canvas-tab-${inspectorTab}`}
            className="shrink-0 p-3"
          >
            {inspectorTab === "layers" && (
              <div className="grid gap-5">
                {(Object.keys(layersByGroup) as SessionCanvasLayerGroup[]).map(
                  (group) => (
                    <section key={group}>
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-xs font-bold tracking-[.14em] text-base-content/50 uppercase">
                          {GROUP_LABELS[group]}
                        </h2>
                        <span className="text-xs text-base-content/40">
                          {layersByGroup[group].length}
                        </span>
                      </div>
                      <div className="grid gap-1">
                        {layersByGroup[group].map((layer) => {
                          const objects =
                            authoredObjectsByLayer[layer.key] ?? [];
                          const objectKind = canvasObjectKindForLayer(
                            layer.key,
                          );
                          return (
                            <div
                              key={layer.key}
                              className="overflow-hidden rounded-lg border border-base-300/60 bg-base-100/35"
                            >
                              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center px-1 py-1.5">
                                <Button
                                  type="button"
                                  className={`grid h-8 w-8 place-items-center rounded-md text-sm ${layerVisibility[layer.key] ? "text-primary" : "text-base-content/25"}`}
                                  aria-label={`${layerVisibility[layer.key] ? "Hide" : "Show"} ${layer.label}`}
                                  onClick={() => toggleLayer(layer.key)}
                                >
                                  {layerVisibility[layer.key] ? "◉" : "○"}
                                </Button>
                                <Button
                                  type="button"
                                  className="min-w-0 px-1 text-left"
                                  onClick={() =>
                                    activateSelection({
                                      kind: "layer",
                                      key: layer.key,
                                    })
                                  }
                                >
                                  <span className="block truncate text-sm font-semibold text-base-content/80">
                                    {layer.label}
                                  </span>
                                  <span className="block text-xs text-base-content/40">
                                    {layer.graphical ? "render" : "simulation"}
                                  </span>
                                </Button>
                                <Button
                                  type="button"
                                  className="grid h-8 w-8 place-items-center rounded-md text-base-content/40 hover:text-base-content/75"
                                  aria-label={`Open ${layer.label} settings`}
                                  onClick={() =>
                                    activateSelection({
                                      kind: "layer",
                                      key: layer.key,
                                    })
                                  }
                                >
                                  <span aria-hidden="true">⚙</span>
                                </Button>
                              </div>
                              {objects.length > 0 ? (
                                <div className="grid gap-0.5 border-t border-base-300/50 p-1.5">
                                  {objects.map((object) => (
                                    <Button
                                      key={`${object.selection.kind}:${object.selection.key}`}
                                      type="button"
                                      className="grid min-w-0 grid-cols-[1.1rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary/[.08]"
                                      onClick={() =>
                                        activateSelection(object.selection)
                                      }
                                    >
                                      <span
                                        aria-hidden
                                        className="text-xs text-primary/70"
                                      >
                                        •
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block truncate text-xs font-semibold text-base-content/75">
                                          {object.label}
                                        </span>
                                        <span className="block truncate text-[10px] capitalize text-base-content/40">
                                          {object.type}
                                        </span>
                                      </span>
                                    </Button>
                                  ))}
                                </div>
                              ) : objectKind ? (
                                <div className="border-t border-base-300/50 px-3 py-2 text-[10px] text-base-content/35">
                                  No authored {layer.label.toLowerCase()}{" "}
                                  objects
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ),
                )}
              </div>
            )}

            {inspectorTab === "content" && content && (
              <div className="grid gap-4">
                <div className="border-b border-base-300 pb-3">
                  <p className="text-xs font-semibold tracking-[.14em] text-primary uppercase">
                    Location content
                  </p>
                  <p className="mt-1 text-sm text-base-content/55">
                    {contentSummary ||
                      "Add world creatures, items, and discoveries after configuring the canvas layers."}
                  </p>
                </div>
                {content}
              </div>
            )}

            {inspectorTab === "scene" && (
              <div className="grid gap-5">
                <section>
                  <p className="text-[11px] font-bold tracking-[.16em] text-base-content/50 uppercase">
                    Environment
                  </p>
                  <Label className="mt-3 grid gap-2 text-xs text-base-content/70">
                    Weather
                    <Select
                      controlSize="sm"
                      className="border-base-300 bg-base-100"
                      value={weather}
                      onChange={(event) =>
                        setWeather(event.currentTarget.value as WeatherKind)
                      }
                    >
                      <option value="none">None</option>
                      <option value="rain">Rain</option>
                      <option value="snow">Snow</option>
                      <option value="embers">Embers</option>
                    </Select>
                  </Label>
                  <Label className="mt-4 grid gap-2 text-xs text-base-content/70">
                    <span className="flex justify-between">
                      <span>Darkness</span>
                      <span>{Math.round(darkness * 100)}%</span>
                    </span>
                    <Range
                      controlSize="xs"
                      min="0"
                      max="0.85"
                      step="0.01"
                      value={darkness}
                      onChange={(event) =>
                        setDarkness(Number(event.currentTarget.value))
                      }
                    />
                  </Label>
                </section>
                <section className="grid gap-3 border-t border-base-300 pt-4">
                  <Toggle
                    label="Token vision & fog"
                    controlSize="xs"
                    wrapperClassName="flex-row-reverse justify-between text-xs text-base-content/70"
                    checked={fogEnabled}
                    onChange={(event) =>
                      setFogEnabled(event.currentTarget.checked)
                    }
                  />
                  <Toggle
                    label="Authoring overlays"
                    tone="info"
                    controlSize="xs"
                    wrapperClassName="flex-row-reverse justify-between text-xs text-base-content/70"
                    checked={debugOverlays}
                    onChange={(event) =>
                      setDebugOverlays(event.currentTarget.checked)
                    }
                  />
                  <Label className="grid gap-2 text-xs text-base-content/70">
                    <span className="flex justify-between">
                      <span>Grid size</span>
                      <span>{gridSize}px</span>
                    </span>
                    <Range
                      controlSize="xs"
                      min="32"
                      max="96"
                      step="8"
                      value={gridSize}
                      onChange={(event) =>
                        setGridSize(Number(event.currentTarget.value))
                      }
                    />
                  </Label>
                </section>
                <section className="border-t border-base-300 pt-4">
                  <p className="text-[11px] font-bold tracking-[.16em] text-base-content/50 uppercase">
                    Encounter clock
                  </p>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-base-300 bg-base-100 p-3">
                    <IconButton
                      type="button"
                      tone="ghost"
                      size="xs"
                      aria-label="Previous encounter round"
                      onClick={() =>
                        setRound((value) => Math.max(1, value - 1))
                      }
                    >
                      −
                    </IconButton>
                    <div className="text-center">
                      <p className="text-lg font-black text-primary">
                        Round {round}
                      </p>
                      <p className="text-[10px] text-base-content/40">
                        Kael’s turn
                      </p>
                    </div>
                    <IconButton
                      type="button"
                      tone="ghost"
                      size="xs"
                      aria-label="Next encounter round"
                      onClick={() => setRound((value) => value + 1)}
                    >
                      +
                    </IconButton>
                  </div>
                </section>
              </div>
            )}

            {inspectorTab === "selection" &&
              (selection?.kind === "token" && selectedToken ? (
                <div className="grid gap-5">
                  <section className="flex items-center gap-3">
                    <div className="grid h-14 w-14 place-items-center rounded-full border-4 border-emerald-300 bg-primary text-xl font-black text-black">
                      {selectedToken.initials}
                    </div>
                    <div>
                      <p className="font-bold text-base-content">
                        {selectedToken.name}
                      </p>
                      <p className="text-xs capitalize text-base-content/50">
                        {selectedToken.disposition} token
                      </p>
                    </div>
                  </section>
                  <section className="grid gap-3 border-t border-base-300 pt-4">
                    {fixtureMode ? (
                      <Label className="grid gap-2 text-xs text-base-content/70">
                        <span className="flex justify-between">
                          <span>Vision range</span>
                          <span>{selectedToken.vision} px</span>
                        </span>
                        <Range
                          tone="info"
                          controlSize="xs"
                          min="100"
                          max="650"
                          step="10"
                          value={selectedToken.vision}
                          onChange={(event) => {
                            const vision = Number(event.currentTarget.value);
                            setTokens((current) =>
                              current.map((token) =>
                                token.key === selectedToken.key
                                  ? { ...token, vision }
                                  : token,
                              ),
                            );
                          }}
                        />
                      </Label>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-base-content/60">
                        <span>Vision range</span>
                        <span>{selectedToken.vision} px</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-base-300 bg-base-100 p-3">
                        <p className="text-[10px] text-base-content/40">
                          Position X
                        </p>
                        <p className="mt-1 font-mono text-sm text-base-content/80">
                          {Math.round(selectedToken.x)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-base-300 bg-base-100 p-3">
                        <p className="text-[10px] text-base-content/40">
                          Position Y
                        </p>
                        <p className="mt-1 font-mono text-sm text-base-content/80">
                          {Math.round(selectedToken.y)}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      tone="danger"
                      size="sm"
                      onClick={deleteSelection}
                    >
                      Delete token
                    </Button>
                  </section>
                  {renderLayerProperties("tokens")}
                </div>
              ) : selection ? (
                <div className="grid gap-4">
                  <div>
                    <p className="font-bold text-base-content">
                      {selectionLabel}
                    </p>
                    <p className="mt-1 text-xs text-base-content/50">
                      {selection.kind === "layer"
                        ? "Configure this layer independently from its authored objects."
                        : "Drag the object to move it. Drag a highlighted boundary handle to resize it."}
                    </p>
                  </div>
                  {renderLayerProperties(
                    sessionCanvasLayerForSelection(selection),
                    selection.kind === "sound",
                  )}
                  {selection.kind === "vertex" && (
                    <p className="rounded-lg border border-primary/20 bg-primary/[.06] p-3 text-xs text-base-content/60">
                      Moving this vertex previews every connected wall. Deleting
                      it removes every connected line.
                    </p>
                  )}
                  {selection.kind !== "layer" && (
                    <Button
                      type="button"
                      tone="danger"
                      size="sm"
                      onClick={deleteSelection}
                    >
                      Delete {selection.kind === "vertex" ? "vertex" : "object"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-base-300 p-5 text-center text-sm text-base-content/40">
                  Select an object on the canvas to inspect it.
                </div>
              ))}
          </div>
        </aside>
      </div>
    </CanvasRoot>
  );
}

export function SessionCanvasHarness() {
  return <SessionCanvasWorkspace />;
}
