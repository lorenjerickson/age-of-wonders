import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { visibilityPolygon } from "./mapGeometry";
import {
  defaultSessionCanvasLayerVisibility,
  defaultSessionCanvasLayerOpacity,
  SESSION_CANVAS_LAYERS,
  sessionCanvasLayerOpacity,
  sessionCanvasLayerVisibility,
  spatialAudioGain,
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
}

export interface CanvasWall {
  key: string;
  start: CanvasPoint;
  end: CanvasPoint;
  kind: "wall" | "door" | "invisible-wall";
  open?: boolean;
  blocksSight: boolean;
}

interface CanvasLight extends CanvasPoint {
  key: string;
  name: string;
  radius: number;
  color: string;
}

interface CanvasSound extends CanvasPoint {
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

interface CanvasNote extends CanvasPoint {
  key: string;
  name: string;
  text: string;
}

interface CanvasDrawing extends CanvasPoint {
  key: string;
  radius: number;
}

interface CanvasTemplate extends CanvasPoint {
  key: string;
  radius: number;
}

type CanvasTool =
  | "select"
  | "pan"
  | "token"
  | "wall"
  | "drawing"
  | "template"
  | "light"
  | "sound"
  | "note";

type InspectorTab = "layers" | "content" | "scene" | "selection";
type WeatherKind = "none" | "rain" | "snow" | "embers";

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
    <details ref={detailsRef} className="group min-w-0">
      <summary
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
      </summary>
      <div className="mt-1 grid min-w-0 overflow-hidden rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`min-w-0 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10 ${option.value === value ? "bg-violet-300/10 text-violet-100" : "text-base-content/65"}`}
            onClick={() => {
              onChange(option.value);
              detailsRef.current?.removeAttribute("open");
            }}
          >
            <span className="block truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function pointPath(points: readonly CanvasPoint[]) {
  return points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
}

function ToolButton({
  active,
  definition,
  onSelect,
}: {
  active: boolean;
  definition: (typeof TOOL_DEFINITIONS)[number];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`group relative grid h-11 w-11 place-items-center rounded-xl border text-lg transition ${
        active
          ? "border-primary bg-primary text-primary-content shadow-[0_0_24px_rgba(244,195,76,.22)]"
          : "border-base-300 bg-base-100 text-base-content/70 hover:border-primary/40 hover:text-base-content"
      }`}
      aria-label={`${definition.label} (${definition.shortcut})`}
      title={`${definition.label} (${definition.shortcut})`}
      onClick={onSelect}
    >
      <span aria-hidden>{definition.glyph}</span>
      <span className="absolute -right-1 -bottom-1 grid h-4 min-w-4 place-items-center rounded bg-base-300 px-1 text-xs font-bold text-base-content/55">
        {definition.shortcut}
      </span>
    </button>
  );
}

export interface SessionCanvasWorkspaceProps {
  locationId?: string;
  locationName?: string;
  locationKind?: string;
  backgroundUrl?: string;
  initialTokens?: readonly CanvasToken[];
  initialWalls?: readonly CanvasWall[];
  initialConfiguration?: {
    layers: readonly {
      key: SessionCanvasLayerKey;
      visible: boolean;
      opacity: number;
    }[];
  };
  onConfigurationChange?: (configuration: {
    locationId: string;
    layers: {
      key: SessionCanvasLayerKey;
      visible: boolean;
      opacity: number;
    }[];
  }) => void;
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
  backgroundUrl,
  initialTokens = [],
  initialWalls = [],
  initialConfiguration,
  onConfigurationChange,
  onBack,
  content,
  contentSummary,
  saveControls,
  saveStatus,
  sessionControls,
}: SessionCanvasWorkspaceProps) {
  const fixtureMode = !locationId;
  const svgRef = useRef<SVGSVGElement>(null);
  const configurationChangeRef = useRef(onConfigurationChange);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const soundPlaybackRef = useRef<Record<string, CanvasSoundPlayback>>({});
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
  const [inspectedLayer, setInspectedLayer] =
    useState<SessionCanvasLayerKey>("tokens");
  const [tokens, setTokens] = useState(
    fixtureMode ? INITIAL_TOKENS : [...initialTokens],
  );
  const [walls, setWalls] = useState(
    fixtureMode ? INITIAL_WALLS : [...initialWalls],
  );
  const [lights, setLights] = useState(fixtureMode ? INITIAL_LIGHTS : []);
  const [sounds, setSounds] = useState(fixtureMode ? INITIAL_SOUNDS : []);
  const [selectedSoundKey, setSelectedSoundKey] = useState("sound-water");
  const [listenerTokenKey, setListenerTokenKey] = useState("token-kael");
  const [soundPlayback, setSoundPlayback] = useState<
    Record<string, CanvasSoundPlayback>
  >({});
  const [notes, setNotes] = useState(fixtureMode ? INITIAL_NOTES : []);
  const [drawings, setDrawings] = useState(fixtureMode ? INITIAL_DRAWINGS : []);
  const [templates, setTemplates] = useState(
    fixtureMode ? INITIAL_TEMPLATES : [],
  );
  const [selectedTokenKey, setSelectedTokenKey] = useState(
    fixtureMode ? "token-kael" : "",
  );
  const [wallStart, setWallStart] = useState<CanvasPoint>();
  const [cursorPoint, setCursorPoint] = useState<CanvasPoint>();
  const [viewport, setViewport] = useState({ pan: { x: 0, y: 0 }, zoom: 1 });
  const [gridSize, setGridSize] = useState(64);
  const [darkness, setDarkness] = useState(fixtureMode ? 0.34 : 0);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [weather, setWeather] = useState<WeatherKind>(
    fixtureMode ? "rain" : "none",
  );
  const [effectsPlaying, setEffectsPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [debugOverlays, setDebugOverlays] = useState(true);
  const [round, setRound] = useState(fixtureMode ? 3 : 1);
  const availableTools = useMemo(
    () =>
      fixtureMode
        ? TOOL_DEFINITIONS
        : TOOL_DEFINITIONS.filter(
            ({ key }) => key === "select" || key === "pan",
          ).map((definition) =>
            definition.key === "select"
              ? { ...definition, label: "Inspect canvas" }
              : definition,
          ),
    [fixtureMode],
  );

  configurationChangeRef.current = onConfigurationChange;
  useEffect(() => {
    if (fixtureMode) return;
    setTokens([...initialTokens]);
  }, [fixtureMode, initialTokens]);

  useEffect(() => {
    if (fixtureMode) return;
    setWalls([...initialWalls]);
  }, [fixtureMode, initialWalls]);

  useEffect(() => {
    if (!locationId || !configurationChangeRef.current) return;
    configurationChangeRef.current({
      locationId,
      layers: SESSION_CANVAS_LAYERS.map(({ key }) => ({
        key,
        visible: layerVisibility[key],
        opacity: layerOpacity[key],
      })),
    });
  }, [layerOpacity, layerVisibility, locationId]);

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
        if (activeTool === "select" && selectedTokenKey) {
          setTokens((current) =>
            current.map((token) =>
              token.key === selectedTokenKey
                ? {
                    ...token,
                    x: clamp(token.x + delta.x, 0, CANVAS_WIDTH),
                    y: clamp(token.y + delta.y, 0, CANVAS_HEIGHT),
                  }
                : token,
            ),
          );
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
  }, [activeTool, availableTools, gridSize, selectedTokenKey]);

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
    tokens.find(({ key }) => key === selectedTokenKey) ?? tokens[0];
  const selectedSound =
    sounds.find(({ key }) => key === selectedSoundKey) ?? sounds[0];
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
  const inspectedLayerDefinition = SESSION_CANVAS_LAYERS.find(
    ({ key }) => key === inspectedLayer,
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

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = event.clientX;
    screenPoint.y = event.clientY;
    const scenePoint = screenPoint.matrixTransform(matrix.inverse());
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

  function beginTokenDrag(
    event: ReactPointerEvent<SVGGElement>,
    token: CanvasToken,
  ) {
    if (!fixtureMode || activeTool !== "select") return;
    event.stopPropagation();
    const point = canvasPoint(event);
    setSelectedTokenKey(token.key);
    if (token.disposition !== "hostile") setListenerTokenKey(token.key);
    setInspectorTab("selection");
    dragRef.current = {
      kind: "token",
      pointerId: event.pointerId,
      tokenKey: token.key,
      offset: { x: token.x - point.x, y: token.y - point.y },
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
      setSelectedTokenKey(token.key);
      setListenerTokenKey(token.key);
      setActiveTool("select");
      setInspectorTab("selection");
      return;
    }
    if (activeTool === "wall") {
      if (!wallStart) {
        setWallStart(point);
      } else {
        setWalls((current) => [
          ...current,
          {
            key: crypto.randomUUID(),
            start: wallStart,
            end: point,
            kind: "wall",
            blocksSight: true,
          },
        ]);
        setWallStart(undefined);
      }
      return;
    }
    if (activeTool === "drawing") {
      setDrawings((current) => [
        ...current,
        { key: crypto.randomUUID(), ...point, radius: 62 },
      ]);
      return;
    }
    if (activeTool === "template") {
      setTemplates((current) => [
        ...current,
        { key: crypto.randomUUID(), ...point, radius: 120 },
      ]);
      return;
    }
    if (activeTool === "light") {
      const number = lights.length + 1;
      setLights((current) => [
        ...current,
        {
          key: crypto.randomUUID(),
          name: `Test light ${number}`,
          ...point,
          radius: 210,
          color: "#ffd78a",
        },
      ]);
      return;
    }
    if (activeTool === "sound") {
      const number = sounds.length + 1;
      const key = crypto.randomUUID();
      setSounds((current) => [
        ...current,
        {
          key,
          name: `Ambient source ${number}`,
          ...point,
          radius: 230,
          volume: 0.5,
          volumeMode: "distance",
          loop: true,
        },
      ]);
      setSelectedSoundKey(key);
      setInspectedLayer("sounds");
      setInspectorTab("layers");
      setActiveTool("select");
      return;
    }
    if (activeTool === "note") {
      const number = notes.length + 1;
      setNotes((current) => [
        ...current,
        {
          key: crypto.randomUUID(),
          name: `Scene note ${number}`,
          text: "A test note placed from the canvas harness.",
          ...point,
        },
      ]);
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = canvasPoint(event);
    setCursorPoint(point);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "token") {
      setTokens((current) =>
        current.map((token) =>
          token.key === drag.tokenKey
            ? {
                ...token,
                x: clamp(point.x + drag.offset.x, 28, CANVAS_WIDTH - 28),
                y: clamp(point.y + drag.offset.y, 28, CANVAS_HEIGHT - 28),
              }
            : token,
        ),
      );
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
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((current) => ({
      ...current,
      zoom: clamp(current.zoom * factor, 0.7, 3),
    }));
  }

  function toggleLayer(key: SessionCanvasLayerKey) {
    setLayerVisibility((current) => ({ ...current, [key]: !current[key] }));
  }

  function updateSound(
    soundKey: string,
    transform: (sound: CanvasSound) => CanvasSound,
  ) {
    setSounds((current) =>
      current.map((sound) =>
        sound.key === soundKey ? transform(sound) : sound,
      ),
    );
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
              preserveAspectRatio="xMidYMid slice"
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
            </g>
          ))}
        </g>
      );
    }
    if (key === "templates") {
      return (
        <g {...common}>
          {templates.map((template) => (
            <g key={template.key}>
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
              <g key={wall.key}>
                <line
                  x1={wall.start.x}
                  y1={wall.start.y}
                  x2={wall.end.x}
                  y2={wall.end.y}
                  stroke="#080b0d"
                  strokeWidth="11"
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
          {tokens.map((token) => (
            <g
              key={token.key}
              transform={`translate(${token.x} ${token.y})`}
              onPointerDown={
                fixtureMode
                  ? (event) => beginTokenDrag(event, token)
                  : undefined
              }
              className={
                fixtureMode && activeTool === "select" ? "cursor-grab" : ""
              }
            >
              {listenerToken?.key === token.key && (
                <circle
                  r="39"
                  fill="none"
                  stroke="#f0d27a"
                  strokeWidth="3"
                  strokeDasharray="5 6"
                  pointerEvents="none"
                />
              )}
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
              <text
                y="8"
                textAnchor="middle"
                fill="#101417"
                fontSize="22"
                fontWeight="900"
              >
                {token.initials}
              </text>
              <rect x="-27" y="35" width="54" height="6" rx="3" fill="#111" />
              <rect
                x="-27"
                y="35"
                width={token.disposition === "hostile" ? 34 : 47}
                height="6"
                rx="3"
                fill={token.disposition === "hostile" ? "#df625d" : "#5fd4a6"}
              />
            </g>
          ))}
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
            const selected = sound.key === selectedSound?.key;
            const playing = soundPlayback[sound.key]?.playing;
            return (
              <g
                key={sound.key}
                transform={`translate(${sound.x} ${sound.y})`}
                className={activeTool === "select" ? "cursor-pointer" : ""}
                onPointerDown={(event) => {
                  if (activeTool !== "select") return;
                  event.stopPropagation();
                  setSelectedSoundKey(sound.key);
                  setInspectedLayer("sounds");
                  setInspectorTab("layers");
                }}
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
        <g
          {...common}
          opacity={debugOverlays ? layerOpacity[key] : 0}
          pointerEvents="none"
        >
          {lights.map((light) => (
            <g key={light.key}>
              <circle
                cx={light.x}
                cy={light.y}
                r={light.radius}
                fill="none"
                stroke={light.color}
                strokeWidth="3"
                strokeDasharray="10 10"
                opacity=".5"
              />
              <circle
                cx={light.x}
                cy={light.y}
                r="12"
                fill={light.color}
                stroke="#111"
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
      );
    }
    if (key === "notes") {
      return (
        <g {...common} pointerEvents="none">
          {notes.map((note) => (
            <g key={note.key} transform={`translate(${note.x} ${note.y})`}>
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
            </g>
          ))}
        </g>
      );
    }
    if (key === "controls") {
      return selectedToken ? (
        <g
          {...common}
          transform={`translate(${selectedToken.x} ${selectedToken.y})`}
          pointerEvents="none"
        >
          <circle
            r="42"
            fill="none"
            stroke="#f3ca61"
            strokeWidth="3"
            strokeDasharray="7 5"
          />
          <path
            d="M-50 0H-36M36 0H50M0-50V-36M0 36V50"
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
  const inspectorTabs: InspectorTab[] = content
    ? ["layers", "content"]
    : ["layers", "scene", "selection"];
  const CanvasRoot = fixtureMode ? "main" : "section";

  return (
    <CanvasRoot
      aria-label={fixtureMode ? undefined : `${locationName} session canvas`}
      className="session-canvas-shell flex h-full min-h-[42rem] min-w-0 w-full max-w-full flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 text-base-content shadow-xl"
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
      <header className="flex min-h-18 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-base-300 bg-base-200/90 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          {onBack ? (
            <button
              type="button"
              className="btn btn-ghost btn-square btn-sm"
              aria-label="Back to campaign locations"
              onClick={onBack}
            >
              ←
            </button>
          ) : (
            <a
              href="/sessions"
              className="btn btn-ghost btn-square btn-sm"
              aria-label="Leave canvas laboratory"
            >
              ←
            </a>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold tracking-wide">
                {locationName}
              </p>
              <span className="badge badge-primary badge-outline badge-sm">
                {fixtureMode ? "Canvas lab" : locationKind || "Location"}
              </span>
            </div>
            <p className="truncate text-sm text-base-content/55">
              {fixtureMode
                ? "Experimental session workspace · local test state"
                : "Configure layers and prepare this location for play"}
            </p>
          </div>
        </div>
        <div className="session-canvas-header-actions ml-auto flex flex-wrap items-center justify-end gap-2">
          {saveControls}
          {saveStatus && (
            <span
              role="status"
              className={`badge badge-outline ${saveStatus === "Campaign saved." ? "badge-success" : "badge-error"}`}
            >
              {saveStatus}
            </span>
          )}
          {fixtureMode && (
            <>
              <div className="hidden items-center gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/60 md:flex">
                <span
                  className={`h-2 w-2 rounded-full ${anyAudioPlaying ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : soundEnabled ? "bg-violet-300" : "bg-white/25"}`}
                />
                {!soundEnabled || !layerVisibility.sounds
                  ? "Audio muted"
                  : anyAudioPlaying
                    ? "Positional audio playing"
                    : Object.keys(soundPlayback).length
                      ? "Positional audio ready"
                      : `${sounds.length} ambient sources`}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSoundEnabled((value) => !value)}
              >
                {soundEnabled ? "Sound on" : "Sound off"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEffectsPlaying((value) => !value)}
              >
                {effectsPlaying ? "Pause effects" : "Play effects"}
              </button>
            </>
          )}
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

      <div className="session-canvas-layout grid min-h-0 min-w-0 w-full max-w-full flex-1 grid-cols-[4rem_minmax(0,1fr)_22rem]">
        <nav
          className="flex min-h-0 flex-col items-center gap-2 border-r border-base-300 bg-base-200/70 py-3"
          aria-label="Canvas tools"
        >
          {availableTools.map((definition) => (
            <ToolButton
              key={definition.key}
              definition={definition}
              active={activeTool === definition.key}
              onSelect={() => {
                setActiveTool(definition.key);
                setWallStart(undefined);
              }}
            />
          ))}
          <div className="mt-auto grid gap-2">
            <button
              type="button"
              className={`grid h-10 w-10 place-items-center rounded-xl border ${debugOverlays ? "border-secondary/40 bg-secondary/10 text-secondary" : "border-base-300 text-base-content/55"}`}
              title="Toggle authoring overlays"
              aria-label="Toggle authoring overlays"
              onClick={() => setDebugOverlays((value) => !value)}
            >
              ⌘
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-base-300 text-base-content/55 hover:text-base-content"
              title="Reset view"
              aria-label="Reset view"
              onClick={() => setViewport({ pan: { x: 0, y: 0 }, zoom: 1 })}
            >
              ⌂
            </button>
          </div>
        </nav>

        <section className="relative min-h-[28rem] overflow-hidden bg-base-300">
          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-box border border-base-300 bg-base-100/90 p-1 text-base-content shadow-xl backdrop-blur">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label="Zoom out"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: clamp(current.zoom / 1.2, 0.7, 3),
                }))
              }
            >
              −
            </button>
            <span className="min-w-16 text-center text-xs font-semibold text-base-content/65">
              {Math.round(viewport.zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label="Zoom in"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: clamp(current.zoom * 1.2, 0.7, 3),
                }))
              }
            >
              +
            </button>
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
            <div className="rounded-box border border-base-300 bg-base-100/90 px-3 py-2 text-xs text-base-content/60 shadow-xl backdrop-blur">
              {fixtureMode
                ? "Drag or arrow keys to pan · Scroll or +/- to zoom"
                : "Choose Pan to drag · Focus canvas for arrow and +/- controls"}
            </div>
          </div>
        </section>

        <aside className="session-canvas-inspector flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-base-300 bg-base-200/70">
          <div
            role="tablist"
            aria-label="Canvas inspector"
            className="flex border-b border-base-300 p-2"
          >
            {inspectorTabs.map((tab, index) => (
              <button
                key={tab}
                id={`canvas-tab-${tab}`}
                type="button"
                role="tab"
                className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-semibold capitalize ${inspectorTab === tab ? "bg-primary/15 text-primary" : "text-base-content/50 hover:text-base-content/80"}`}
                aria-selected={inspectorTab === tab}
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
              </button>
            ))}
          </div>

          <div
            id="canvas-inspector-panel"
            role="tabpanel"
            aria-labelledby={`canvas-tab-${inspectorTab}`}
            className="min-h-0 flex-1 overflow-y-auto p-3"
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
                        {layersByGroup[group].map((layer) => (
                          <div
                            key={layer.key}
                            className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center rounded-lg border px-1 py-1 transition ${inspectedLayer === layer.key ? "border-primary/30 bg-primary/[.08]" : "border-transparent hover:bg-base-300/60"}`}
                          >
                            <button
                              type="button"
                              className={`grid h-8 w-8 place-items-center rounded-md text-sm ${layerVisibility[layer.key] ? "text-primary" : "text-base-content/25"}`}
                              aria-label={`${layerVisibility[layer.key] ? "Hide" : "Show"} ${layer.label}`}
                              onClick={() => toggleLayer(layer.key)}
                            >
                              {layerVisibility[layer.key] ? "◉" : "○"}
                            </button>
                            <button
                              type="button"
                              className="min-w-0 px-1 text-left"
                              onClick={() => setInspectedLayer(layer.key)}
                            >
                              <span className="block truncate text-sm font-semibold text-base-content/80">
                                {layer.label}
                              </span>
                              <span className="block text-xs text-base-content/40">
                                {layer.graphical ? "render" : "simulation"}
                              </span>
                            </button>
                            <span className="pr-2 text-xs font-bold tracking-wider text-base-content/30 uppercase">
                              {layer.group.slice(0, 3)}
                            </span>
                          </div>
                        ))}
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
                  <label className="mt-3 grid gap-2 text-xs text-base-content/70">
                    Weather
                    <select
                      className="select select-sm w-full border-base-300 bg-base-100"
                      value={weather}
                      onChange={(event) =>
                        setWeather(event.currentTarget.value as WeatherKind)
                      }
                    >
                      <option value="none">None</option>
                      <option value="rain">Rain</option>
                      <option value="snow">Snow</option>
                      <option value="embers">Embers</option>
                    </select>
                  </label>
                  <label className="mt-4 grid gap-2 text-xs text-base-content/70">
                    <span className="flex justify-between">
                      <span>Darkness</span>
                      <span>{Math.round(darkness * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.85"
                      step="0.01"
                      className="range range-xs range-primary"
                      value={darkness}
                      onChange={(event) =>
                        setDarkness(Number(event.currentTarget.value))
                      }
                    />
                  </label>
                </section>
                <section className="grid gap-3 border-t border-base-300 pt-4">
                  <label className="flex items-center justify-between text-xs text-base-content/70">
                    <span>Token vision & fog</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-xs toggle-primary"
                      checked={fogEnabled}
                      onChange={(event) =>
                        setFogEnabled(event.currentTarget.checked)
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-base-content/70">
                    <span>Authoring overlays</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-xs toggle-info"
                      checked={debugOverlays}
                      onChange={(event) =>
                        setDebugOverlays(event.currentTarget.checked)
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-xs text-base-content/70">
                    <span className="flex justify-between">
                      <span>Grid size</span>
                      <span>{gridSize}px</span>
                    </span>
                    <input
                      type="range"
                      min="32"
                      max="96"
                      step="8"
                      className="range range-xs"
                      value={gridSize}
                      onChange={(event) =>
                        setGridSize(Number(event.currentTarget.value))
                      }
                    />
                  </label>
                </section>
                <section className="border-t border-base-300 pt-4">
                  <p className="text-[11px] font-bold tracking-[.16em] text-base-content/50 uppercase">
                    Encounter clock
                  </p>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-base-300 bg-base-100 p-3">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        setRound((value) => Math.max(1, value - 1))
                      }
                    >
                      −
                    </button>
                    <div className="text-center">
                      <p className="text-lg font-black text-primary">
                        Round {round}
                      </p>
                      <p className="text-[10px] text-base-content/40">
                        Kael’s turn
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setRound((value) => value + 1)}
                    >
                      +
                    </button>
                  </div>
                </section>
              </div>
            )}

            {inspectorTab === "selection" &&
              (selectedToken ? (
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
                    <label className="grid gap-2 text-xs text-base-content/70">
                      <span className="flex justify-between">
                        <span>Vision range</span>
                        <span>{selectedToken.vision} px</span>
                      </span>
                      <input
                        type="range"
                        min="100"
                        max="650"
                        step="10"
                        className="range range-xs range-info"
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
                    </label>
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
                    <button
                      type="button"
                      className="btn btn-sm border-red-400/20 bg-red-400/5 text-red-200 hover:bg-red-400/10"
                      onClick={() => {
                        setTokens((current) =>
                          current.filter(
                            ({ key }) => key !== selectedToken.key,
                          ),
                        );
                        setSelectedTokenKey("");
                      }}
                    >
                      Remove test token
                    </button>
                  </section>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-base-300 p-5 text-center text-sm text-base-content/40">
                  Select a token on the canvas to inspect it.
                </div>
              ))}
          </div>

          {inspectorTab === "layers" && inspectedLayerDefinition && (
            <div className="max-h-[72%] min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-t border-base-300 bg-base-100/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-base-content/85">
                    {inspectedLayerDefinition.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-base-content/45">
                    {inspectedLayerDefinition.description}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-base-300 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-base-content/40 uppercase">
                  {inspectedLayerDefinition.graphical ? "render" : "simulation"}
                </span>
              </div>
              {inspectedLayer === "sounds" && (
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
                        onChange={setSelectedSoundKey}
                      />
                    </div>
                    <div className="grid min-w-0 gap-1 text-[10px] text-base-content/55">
                      <span>Listener token</span>
                      <PanelSelect
                        ariaLabel="Listener token"
                        value={listenerToken?.key ?? ""}
                        options={tokens
                          .filter(
                            ({ disposition }) => disposition !== "hostile",
                          )
                          .map((token) => ({
                            value: token.key,
                            label: token.name,
                          }))}
                        onChange={(tokenKey) => {
                          setListenerTokenKey(tokenKey);
                          setSelectedTokenKey(tokenKey);
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
                        {selectedSoundPlayback?.fileName ||
                          "No audio file selected"}
                      </p>
                    </div>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${selectedSoundPlayback?.playing ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : selectedSoundPlayback?.armed ? "bg-primary" : selectedSoundPlayback ? "bg-violet-300" : "bg-white/20"}`}
                    />
                  </div>
                  <label className="btn btn-sm w-full min-w-0 max-w-full overflow-hidden border-violet-300/20 bg-violet-300/10 text-violet-100 hover:bg-violet-300/20">
                    <span className="truncate">Choose audio file</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                      className="sr-only"
                      onChange={(event) => {
                        selectAudioFile(event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.25rem] gap-2">
                    <button
                      type="button"
                      className="btn btn-sm w-full min-w-0 max-w-full border-base-300 bg-base-100/80 text-base-content disabled:text-base-content/30"
                      disabled={!selectedSoundPlayback}
                      onClick={() => void togglePositionalPlayback()}
                    >
                      {selectedSoundPlayback?.armed
                        ? "Disable playback"
                        : "Enable playback"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm w-full min-w-0 max-w-full px-2 text-base-content/55"
                      disabled={!selectedSoundPlayback}
                      onClick={() => selectAudioFile(undefined)}
                    >
                      Clear
                    </button>
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
                      <label className="grid min-w-0 max-w-full gap-1.5 overflow-hidden">
                        <span className="flex justify-between text-[10px] text-base-content/55">
                          <span>Effective range</span>
                          <span>{selectedSound.radius}px</span>
                        </span>
                        <input
                          type="range"
                          min="60"
                          max="600"
                          step="10"
                          className="range range-xs range-info w-full min-w-0 max-w-full"
                          value={selectedSound.radius}
                          onChange={(event) => {
                            const radius = Number(event.currentTarget.value);
                            updateSound(selectedSound.key, (sound) => ({
                              ...sound,
                              radius,
                            }));
                          }}
                        />
                      </label>
                      <div className="grid min-w-0 gap-1 text-[10px] text-base-content/55">
                        <span>Volume behavior</span>
                        <PanelSelect<CanvasSound["volumeMode"]>
                          ariaLabel="Volume behavior"
                          value={selectedSound.volumeMode}
                          options={[
                            {
                              value: "distance",
                              label: "Scale with distance",
                            },
                            {
                              value: "constant",
                              label: "Constant within range",
                            },
                          ]}
                          onChange={(volumeMode) => {
                            updateSound(selectedSound.key, (sound) => ({
                              ...sound,
                              volumeMode,
                            }));
                          }}
                        />
                      </div>
                      <label className="grid min-w-0 max-w-full gap-1.5 overflow-hidden">
                        <span className="flex justify-between text-[10px] text-base-content/55">
                          <span>Base volume</span>
                          <span>{Math.round(selectedSound.volume * 100)}%</span>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          className="range range-xs range-secondary w-full min-w-0 max-w-full"
                          value={selectedSound.volume}
                          onChange={(event) => {
                            const volume = Number(event.currentTarget.value);
                            updateSound(selectedSound.key, (sound) => ({
                              ...sound,
                              volume,
                            }));
                          }}
                        />
                      </label>
                      <label className="flex min-w-0 items-center justify-between gap-3 text-xs text-base-content/65">
                        <span>Loop continuously</span>
                        <input
                          type="checkbox"
                          className="toggle toggle-xs toggle-secondary"
                          checked={selectedSound.loop}
                          onChange={(event) => {
                            const loop = event.currentTarget.checked;
                            updateSound(selectedSound.key, (sound) => ({
                              ...sound,
                              loop,
                            }));
                          }}
                        />
                      </label>
                    </>
                  )}
                  <p className="text-[10px] leading-4 text-base-content/35">
                    Playback uses the selected listener token as this client's
                    perspective. Dragging a friendly token makes it the listener
                    and updates volume live.
                  </p>
                  {selectedSoundPlayback?.error && (
                    <p role="alert" className="text-[10px] text-red-300">
                      {selectedSoundPlayback.error}
                    </p>
                  )}
                </section>
              )}
              <label className="mt-3 grid min-w-0 max-w-full gap-1.5 overflow-hidden">
                <span className="flex justify-between text-[10px] text-base-content/50">
                  <span>
                    {inspectedLayer === "sounds"
                      ? "Debug overlay opacity"
                      : "Layer opacity"}
                  </span>
                  <span>{Math.round(layerOpacity[inspectedLayer] * 100)}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="range range-xs range-primary w-full min-w-0 max-w-full"
                  value={layerOpacity[inspectedLayer]}
                  onChange={(event) => {
                    const opacity = Number(event.currentTarget.value);
                    setLayerOpacity((current) => ({
                      ...current,
                      [inspectedLayer]: opacity,
                    }));
                  }}
                />
              </label>
            </div>
          )}
        </aside>
      </div>
    </CanvasRoot>
  );
}

export function SessionCanvasHarness() {
  return <SessionCanvasWorkspace />;
}
