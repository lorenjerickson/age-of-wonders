import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Disclosure,
  Field,
  Fieldset,
  Input,
  Select,
} from "@aow/ui";
import {
  applyTerrainWrites,
  assertTerrainVolume,
  createTerrainVolume,
  editTerrainSelection,
  terrainCellIndex,
  terrainShapePreset,
  terrainRegionAddresses,
  type IsometricTerrainVolume,
  type IsometricTerrainManifest,
  type TerrainAddress,
  type TerrainEditResult,
  type TerrainGenerationSettings,
  type TerrainShapePreset,
  type NamespacedKey,
  type SaveLocationTerrainRequest,
} from "@aow/common";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import {
  ApiRequestError,
  getLocationTerrain,
  saveLocationTerrain,
  uploadLocationTerrainChunk,
} from "./api";
import { recordPayload } from "./worldAuthoringModel";
import type { TerrainTextureQuality } from "./terrainMaterials";
import { IsometricTerrainViewport } from "./IsometricTerrainViewport";
import {
  mergeTerrainSelection,
  planeSelection,
  terrainPlacementWrites,
  terrainOpeningWrites,
  terrainSmoothingWrites,
  terrainPlaneAxis,
  type TerrainWorkPlane,
  TERRAIN_PALETTE,
  terrainPreviewActor,
} from "./isometricEditorModel";

interface EditorHistory extends TerrainEditResult {
  selectionBefore: readonly TerrainAddress[];
  selectionAfter: readonly TerrainAddress[];
}
interface GenerationCandidate {
  result: TerrainEditResult;
  counts: {
    created: number;
    replaced: number;
    removed: number;
    skipped: number;
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
async function chunkHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(value))),
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

export function LocationTerrainEditor({
  locationId,
  disabled,
  onDirtyChange,
  onBusyChange,
  onSaved,
}: {
  locationId: string;
  disabled: boolean;
  onDirtyChange(value: boolean): void;
  onBusyChange(value: boolean): void;
  onSaved?(): void;
}) {
  const { definition, draft, canEdit, adoptDraft, markDirty } =
    useWorldAuthoring();
  const record = draft?.records.find(
    (r) => r.resourceType === "locations" && r.sourceId === locationId,
  );
  const map = record
    ? (recordPayload(record).map as unknown as
        IsometricTerrainManifest | { kind: "image" } | undefined)
    : undefined;
  const mapKey = JSON.stringify(map);
  const loadedMap = useRef<string | undefined>(undefined);
  const [volume, setVolume] = useState<IsometricTerrainVolume | undefined>(
    () =>
      map?.kind === "isometric"
        ? undefined
        : createTerrainVolume(
            { x: 100, y: 100, z: 100 },
            TERRAIN_PALETTE.map((m) => ({
              key: m.key,
              terrainType: m.terrainType,
              name: m.name,
              revision: m.revision,
            })),
          ),
  );
  const [dirty, setDirty] = useState(map?.kind !== "isometric");
  const [conflicted, setConflicted] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState(0);
  const [plane, setPlane] = useState<TerrainWorkPlane>("xy");
  const [smoothing, setSmoothing] = useState(0.5);
  const [textureQuality, setTextureQuality] =
    useState<TerrainTextureQuality>("balanced");
  const [slice, setSlice] = useState(false);
  const [tool, setTool] = useState<"place" | "select" | "erase" | "focus">(
    "place",
  );
  const [material, setMaterial] = useState<NamespacedKey>("terrain:grass");
  const [shape, setShape] = useState<TerrainShapePreset>("cube");
  const [rotation, setRotation] = useState(0);
  const [openingKind, setOpeningKind] = useState<"door" | "window">("door");
  const [openingState, setOpeningState] = useState<
    "open" | "closed" | "locked"
  >("closed");
  const [openingFacing, setOpeningFacing] = useState<0 | 1 | 2 | 3>(0);
  const [frameThickness, setFrameThickness] = useState(2 / 16);
  const [actor, setActor] = useState({ x: 16, y: 16, z: 0 });
  const [selection, setSelection] = useState<readonly TerrainAddress[]>([]);
  const [boxMin, setBoxMin] = useState<TerrainAddress>({ x: 0, y: 0, z: 0 });
  const [boxMax, setBoxMax] = useState<TerrainAddress>({ x: 0, y: 0, z: 0 });
  const [history, setHistory] = useState<readonly EditorHistory[]>([]);
  const [redo, setRedo] = useState<readonly EditorHistory[]>([]);
  const [seed, setSeed] = useState(42);
  const [preset, setPreset] =
    useState<TerrainGenerationSettings["preset"]>("rolling-hills");
  const [generationMode, setGenerationMode] =
    useState<TerrainGenerationSettings["mode"]>("fill-empty");
  const [candidate, setCandidate] = useState<GenerationCandidate>();
  const worker = useRef<Worker | null>(null);
  const generationRevision = useRef<number | undefined>(undefined);
  const saveJob = useRef<
    | { volume: IsometricTerrainVolume; request: SaveLocationTerrainRequest }
    | undefined
  >(undefined);
  const locked = disabled || !canEdit || conflicted || !!busy || !!candidate;
  useEffect(() => {
    onDirtyChange(dirty);
    if (dirty) markDirty();
  }, [dirty, markDirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange(!!busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );
  useEffect(() => {
    if (!map || map.kind !== "isometric" || loadedMap.current === mapKey)
      return;
    if (dirty) {
      setConflicted(true);
      setMessage(
        "The saved map changed. Your local terrain is retained; reload the Location to review the latest map.",
      );
      return;
    }
    let cancelled = false;
    setBusy("Loading terrain");
    void (async () => {
      const next = await getLocationTerrain(definition.id, locationId);
      assertTerrainVolume(next);
      if (!cancelled) {
        loadedMap.current = mapKey;
        setVolume(next);
        setActor(
          terrainPreviewActor(
            next,
            Math.floor(next.dimensions.x / 2),
            Math.floor(next.dimensions.y / 2),
          ),
        );
        setHistory([]);
        setRedo([]);
        setSelection([]);
      }
    })()
      .catch(() => {
        if (!cancelled)
          setMessage(
            "The terrain could not be loaded. Reload this Location to retry.",
          );
      })
      .finally(() => {
        if (!cancelled) setBusy("");
      });
    return () => {
      cancelled = true;
    };
  }, [mapKey, definition.id, locationId]); // Dirty changes must not restart a load or discard edits.
  function commit(result: TerrainEditResult, nextSelection = selection) {
    setVolume(result.volume);
    setHistory((h) => {
      const next = [
        ...h.slice(-7),
        {
          ...result,
          selectionBefore: selection,
          selectionAfter: nextSelection,
        },
      ];
      while (
        next.length > 1 &&
        next.reduce((n, e) => n + e.undo.length + e.redo.length, 0) > 1_000_000
      )
        next.shift();
      return next;
    });
    setSelection(nextSelection);
    setActor((a) => terrainPreviewActor(result.volume, a.x, a.y));
    setRedo([]);
    setCandidate(undefined);
    setDirty(true);
    setMessage("");
    saveJob.current = undefined;
  }
  function stroke(
    start: TerrainAddress,
    end: TerrainAddress,
    mode: "replace" | "add" | "subtract",
  ) {
    if (!volume || locked) return;
    try {
      const cells = planeSelection(start, end, volume.dimensions, plane);
      if (tool === "focus") {
        setActor({ ...end });
        return;
      }
      if (tool === "select") {
        setSelection((current) => mergeTerrainSelection(current, cells, mode));
        return;
      }
      commit(
        tool === "erase"
          ? editTerrainSelection(volume, cells, { kind: "remove" })
          : applyTerrainWrites(
              volume,
              terrainPlacementWrites(
                volume,
                cells,
                material,
                terrainShapePreset(shape, rotation),
              ),
            ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The terrain edit could not be applied.",
      );
    }
  }
  function openingEdit(remove: boolean) {
    if (!volume || locked) return;
    try {
      const settings =
        openingKind === "door"
          ? {
              kind: "door" as const,
              state: openingState,
              facing: openingFacing,
              frameThickness,
            }
          : {
              kind: "window" as const,
              state:
                openingState === "open"
                  ? ("open" as const)
                  : ("closed" as const),
              facing: openingFacing,
              frameThickness,
            };
      const writes = terrainOpeningWrites(
        volume,
        selection,
        remove ? null : settings,
      );
      if (!writes.length) {
        setMessage("Select occupied cells to change their openings.");
        return;
      }
      commit(applyTerrainWrites(volume, writes));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The openings could not be changed.",
      );
    }
  }
  function selectionEdit(remove: boolean) {
    if (!volume) return;
    try {
      commit(
        editTerrainSelection(
          volume,
          selection,
          remove
            ? { kind: "remove" }
            : { kind: "material", materialKey: material },
        ),
        remove ? [] : selection,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The selection could not be changed.",
      );
    }
  }
  function undoEdit(forward: boolean) {
    if (!volume) return;
    const entry = (forward ? redo : history).at(-1);
    if (!entry) return;
    const next = applyTerrainWrites(volume, forward ? entry.redo : entry.undo);
    setVolume(next.volume);
    setSelection(forward ? entry.selectionAfter : entry.selectionBefore);
    setActor((a) => terrainPreviewActor(next.volume, a.x, a.y));
    setDirty(true);
    saveJob.current = undefined;
    if (forward) {
      setRedo((r) => r.slice(0, -1));
      setHistory((h) => [...h, entry]);
    } else {
      setHistory((h) => h.slice(0, -1));
      setRedo((r) => [...r, entry]);
    }
  }
  function generate() {
    if (!volume || !draft || locked) return;
    setBusy("Generating terrain");
    setMessage("");
    generationRevision.current = draft.storageRevision;
    const task = new Worker(
      new URL("./terrainGeneration.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = task;
    task.onmessage = (
      event: MessageEvent<GenerationCandidate & { error?: string }>,
    ) => {
      task.terminate();
      worker.current = null;
      setBusy("");
      if (event.data.error) setMessage(event.data.error);
      else setCandidate(event.data);
    };
    task.onerror = () => {
      task.terminate();
      worker.current = null;
      setBusy("");
      setMessage("Terrain generation failed. Your map is unchanged.");
    };
    task.postMessage({
      volume,
      settings: {
        version: 1,
        seed,
        preset,
        region: {
          minimum: { x: 0, y: 0, z: 0 },
          maximum: {
            x: volume.dimensions.x - 1,
            y: volume.dimensions.y - 1,
            z: volume.dimensions.z - 1,
          },
        },
        minimumElevation: 0,
        maximumElevation: Math.min(14, volume.dimensions.z),
        baseElevation: Math.min(7, Math.floor(volume.dimensions.z / 2)),
        featureSize: 12,
        roughness: 0.5,
        materialKey: material,
        mode: generationMode,
        ...(selection.length ? { mask: selection } : {}),
      },
    });
  }
  async function save() {
    if (!volume || !draft?.id || locked) return;
    setBusy("Uploading terrain");
    setMessage("");
    try {
      if (saveJob.current?.volume !== volume) {
        const refs: IsometricTerrainManifest["chunks"][number][] = [];
        for (const chunk of volume.chunks) {
          const hash = await chunkHash(chunk);
          const existing =
            map?.kind === "isometric" &&
            map.chunks.find((ref) => ref.contentHash === hash);
          refs.push(
            existing ||
              (await uploadLocationTerrainChunk(definition.id, locationId, {
                expectedDraftId: draft.id,
                expectedStorageRevision: draft.storageRevision,
                chunk,
              })),
          );
          setBusy(
            `Uploading terrain ${refs.length} of ${volume.chunks.length}`,
          );
        }
        const nextMap: IsometricTerrainManifest = {
          ...volume,
          kind: "isometric",
          chunks: refs,
        };
        saveJob.current = {
          volume,
          request: {
            expectedDraftId: draft.id,
            expectedStorageRevision: draft.storageRevision,
            operationId: crypto.randomUUID(),
            map: nextMap,
          },
        };
      }
      setBusy("Saving terrain");
      const saved = await saveLocationTerrain(
        definition.id,
        locationId,
        saveJob.current.request,
      );
      const savedRecord = saved.records.find(
        (r) => r.resourceType === "locations" && r.sourceId === locationId,
      );
      const savedMap = savedRecord ? recordPayload(savedRecord).map : undefined;
      if (
        JSON.stringify(canonical(savedMap)) !==
        JSON.stringify(canonical(saveJob.current.request.map))
      ) {
        setConflicted(true);
        setMessage(
          "This save completed earlier, but the map has since changed. Your local terrain is retained; reload to review the latest map.",
        );
        return;
      }
      loadedMap.current = JSON.stringify(savedMap);
      adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
      setDirty(false);
      saveJob.current = undefined;
      onSaved?.();
      setMessage("Terrain map saved to this Location.");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409)
        setConflicted(true);
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The World draft changed. Your terrain is retained; reload to review the latest draft before saving."
          : "The terrain could not be saved. Your edits are retained; retry Save Map.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!record || !draft) return null;
  return (
    <section
      className="my-6 space-y-4 rounded-box border border-base-300 p-5"
      aria-label="Isometric terrain map"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Isometric terrain</h2>
        <span className="text-sm opacity-70">5 feet per cell</span>
      </div>
      <p className="text-sm opacity-70">
        Start building on the empty grid, or use the generation options below.
        Generation is optional.
      </p>
      {!volume ? (
        <p>
          {busy ||
            "The saved map could not be loaded. Reload this Location to try again."}
        </p>
      ) : (
        <>
          <h3 className="font-semibold">Optional terrain generation</h3>
          <Fieldset
            disabled={locked}
            className="flex flex-wrap items-end gap-3"
          >
            <Field label="Tool">
              <Select
                value={tool}
                onChange={(e) => setTool(e.target.value as typeof tool)}
              >
                <option value="place">Place plane</option>
                <option value="select">Select cells</option>
                <option value="erase">Erase plane</option>
                <option value="focus">Move preview actor</option>
              </Select>
            </Field>
            <Field label="Terrain type">
              <Select
                value={material}
                onChange={(e) => setMaterial(e.target.value as NamespacedKey)}
              >
                {volume.materials.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shape">
              <Select
                value={shape}
                onChange={(e) => setShape(e.target.value as TerrainShapePreset)}
              >
                {["cube", "ramp", "ridge", "valley"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              tone="outline"
              onClick={() => setRotation((r) => (r + 1) % 4)}
            >
              Rotate shape {rotation * 90}°
            </Button>
            <Field label="Work plane">
              <Select
                value={plane}
                onChange={(e) => {
                  const next = e.target.value as TerrainWorkPlane;
                  setPlane(next);
                  setLevel((n) =>
                    Math.min(n, volume.dimensions[terrainPlaneAxis(next)] - 1),
                  );
                }}
              >
                <option value="xy">Horizontal (XY)</option>
                <option value="xz">Vertical (XZ)</option>
                <option value="yz">Vertical (YZ)</option>
              </Select>
            </Field>
            <Field
              label={`Work level (${terrainPlaneAxis(plane).toUpperCase()})`}
            >
              <Input
                type="number"
                min={0}
                max={volume.dimensions[terrainPlaneAxis(plane)] - 1}
                value={level}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (
                    Number.isInteger(n) &&
                    n >= 0 &&
                    n < volume.dimensions[terrainPlaneAxis(plane)]
                  )
                    setLevel(n);
                }}
                className="w-20"
              />
            </Field>
            <Button
              tone="outline"
              aria-pressed={slice}
              onClick={() => setSlice((s) => !s)}
            >
              {slice ? "Show all levels" : "Hide beyond work plane"}
            </Button>
          </Fieldset>
          <Fieldset
            disabled={locked}
            className="flex flex-wrap items-end gap-3"
          >
            <Field label="Surface smoothing">
              <Select
                value={smoothing}
                onChange={(e) => setSmoothing(Number(e.target.value))}
              >
                <option value={0}>None</option>
                <option value={0.25}>Light</option>
                <option value={0.5}>Medium</option>
                <option value={1}>Full</option>
              </Select>
            </Field>
            <Button
              disabled={!selection.length}
              onClick={() => {
                if (!volume || locked) return;
                try {
                  const writes = terrainSmoothingWrites(
                    volume,
                    selection,
                    smoothing,
                  );
                  if (writes.length) commit(applyTerrainWrites(volume, writes));
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Smoothing could not be applied.",
                  );
                }
              }}
            >
              Smooth selected terrain
            </Button>
            <p className="text-sm">
              Softens surface lighting while keeping exact terrain edges,
              support heights, and gaps. Openings cannot be smoothed.
            </p>
          </Fieldset>
          <Fieldset disabled={locked} className="space-y-3">
            <p className="font-medium">Doors and windows</p>
            <p className="text-sm">
              Select cube cells, then apply an opening. These controls set the
              initial authored state. Removing an opening restores a solid cube.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Opening type">
                <Select
                  value={openingKind}
                  onChange={(e) => {
                    setOpeningKind(e.target.value as "door" | "window");
                    if (
                      e.target.value === "window" &&
                      openingState === "locked"
                    )
                      setOpeningState("closed");
                  }}
                >
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </Select>
              </Field>
              <Field label="Initial opening state">
                <Select
                  value={openingState}
                  onChange={(e) =>
                    setOpeningState(e.target.value as typeof openingState)
                  }
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  {openingKind === "door" && (
                    <option value="locked">Locked</option>
                  )}
                </Select>
              </Field>
              <Field label="Opening facing">
                <Select
                  value={openingFacing}
                  onChange={(e) =>
                    setOpeningFacing(
                      Number(e.target.value) as typeof openingFacing,
                    )
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n * 90}°
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Frame thickness">
                <Select
                  value={frameThickness}
                  onChange={(e) => setFrameThickness(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n / 16}>
                      {n * 3.75} inches
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                disabled={!selection.length}
                onClick={() => openingEdit(false)}
              >
                Apply opening to selection
              </Button>
              <Button
                disabled={!selection.length}
                tone="outline"
                onClick={() => openingEdit(true)}
              >
                Remove selected openings
              </Button>
            </div>
            <p className="text-sm">
              Clear aperture: {((1 - 2 * frameThickness) * 5).toFixed(2)} ft
              wide ×{" "}
              {(
                (1 - (openingKind === "door" ? 1 : 2) * frameThickness) *
                5
              ).toFixed(2)}{" "}
              ft high. A single cell opening is less than five feet high.
            </p>
          </Fieldset>
          <Fieldset disabled={locked} className="space-y-3">
            <p className="text-sm">
              {selection.length.toLocaleString()} selected grid cells · Ctrl/Cmd
              adds; Alt subtracts. Selection includes air; edits apply to
              occupied cells.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!selection.length}
                onClick={() => selectionEdit(false)}
              >
                Change selected terrain
              </Button>
              <Button
                disabled={!selection.length}
                onClick={() => selectionEdit(true)}
              >
                Remove selected cells
              </Button>
              <Button tone="outline" onClick={() => setSelection([])}>
                Clear selection
              </Button>
              <Button
                tone="outline"
                onClick={() =>
                  setSelection(
                    [...terrainCellIndex(volume).keys()].map((key) => {
                      const [x, y, z] = key.split(",").map(Number);
                      return { x, y, z };
                    }),
                  )
                }
              >
                Select all cells
              </Button>
            </div>
            <Disclosure summary="Select a volume across levels">
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {(["x", "y", "z"] as const).map((axis) => (
                  <div key={axis} className="flex gap-2">
                    <Field label={`${axis.toUpperCase()} from`}>
                      <Input
                        className="w-20"
                        type="number"
                        min={0}
                        max={volume.dimensions[axis] - 1}
                        value={boxMin[axis]}
                        onChange={(e) =>
                          setBoxMin((b) => ({
                            ...b,
                            [axis]: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label={`${axis.toUpperCase()} to`}>
                      <Input
                        className="w-20"
                        type="number"
                        min={0}
                        max={volume.dimensions[axis] - 1}
                        value={boxMax[axis]}
                        onChange={(e) =>
                          setBoxMax((b) => ({
                            ...b,
                            [axis]: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                  </div>
                ))}
                <Button
                  onClick={() => {
                    try {
                      setSelection((s) =>
                        mergeTerrainSelection(
                          s,
                          terrainRegionAddresses(
                            { minimum: boxMin, maximum: boxMax },
                            volume.dimensions,
                          ),
                          "add",
                        ),
                      );
                      setMessage("");
                    } catch {
                      setMessage(
                        "Choose whole cell coordinates inside the map, with each starting coordinate before its end.",
                      );
                    }
                  }}
                >
                  Add volume to selection
                </Button>
              </div>
            </Disclosure>
          </Fieldset>
          <Fieldset
            disabled={locked}
            className="flex flex-wrap items-end gap-3 border-t border-base-300 pt-4"
          >
            <Field label="Landform">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value as typeof preset)}
              >
                <option value="plains">Plains</option>
                <option value="rolling-hills">Rolling hills</option>
                <option value="mountains">Mountains</option>
              </Select>
            </Field>
            <Field label="Seed">
              <Input
                type="number"
                min={0}
                max={4294967295}
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="w-32"
              />
            </Field>
            <Button
              tone="outline"
              onClick={() =>
                setSeed(crypto.getRandomValues(new Uint32Array(1))[0])
              }
            >
              New seed
            </Button>
            <Field label="Generation mode">
              <Select
                value={generationMode}
                onChange={(e) =>
                  setGenerationMode(e.target.value as typeof generationMode)
                }
              >
                <option value="fill-empty">Fill empty cells</option>
                <option value="replace-region">Replace terrain</option>
              </Select>
            </Field>
            <Button onClick={generate}>Generate preview</Button>
            <span className="text-sm opacity-70">
              {selection.length
                ? "Within the selection"
                : "Across the whole map"}
            </span>
          </Fieldset>
          {busy === "Generating terrain" && (
            <Button
              onClick={() => {
                worker.current?.terminate();
                worker.current = null;
                setBusy("");
              }}
            >
              Cancel generation
            </Button>
          )}
          {candidate && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Preview: {candidate.counts.created.toLocaleString()} new ·{" "}
                {candidate.counts.replaced.toLocaleString()} replaced ·{" "}
                {candidate.counts.removed.toLocaleString()} removed
              </p>
              <Button
                disabled={
                  disabled ||
                  !canEdit ||
                  draft.storageRevision !== generationRevision.current
                }
                onClick={() => commit(candidate.result)}
              >
                Apply terrain
              </Button>
              <Button tone="outline" onClick={() => setCandidate(undefined)}>
                Discard preview
              </Button>
              {draft.storageRevision !== generationRevision.current && (
                <p>Draft changed; generate a new preview before applying.</p>
              )}
            </div>
          )}
          <Field label="Texture quality">
            <Select
              value={textureQuality}
              onChange={(e) =>
                setTextureQuality(e.target.value as TerrainTextureQuality)
              }
            >
              <option value="balanced">Balanced · 1K</option>
              <option value="high">High · 2K</option>
              <option value="off">Untextured</option>
            </Select>
          </Field>
          <IsometricTerrainViewport
            volume={candidate?.result.volume ?? volume}
            level={level}
            plane={plane}
            textureQuality={textureQuality}
            slice={slice}
            actor={actor}
            selection={selection}
            disabled={locked}
            onStroke={stroke}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-base-300 pt-4">
            <Button
              disabled={locked || !history.length}
              onClick={() => undoEdit(false)}
            >
              Undo
            </Button>
            <Button
              disabled={locked || !redo.length}
              onClick={() => undoEdit(true)}
            >
              Redo
            </Button>
            <Button
              tone="primary"
              disabled={locked || !dirty}
              onClick={() => void save()}
            >
              Save Map
            </Button>
            <span className="text-sm opacity-70">
              {volume.chunks
                .reduce((n, c) => n + c.cells.length, 0)
                .toLocaleString()}{" "}
              cells · {dirty ? "Unsaved terrain" : "Saved terrain"}
            </span>
          </div>
        </>
      )}
      {busy && <p role="status">{busy}…</p>}
      {message && <Alert aria-live="polite">{message}</Alert>}
    </section>
  );
}
