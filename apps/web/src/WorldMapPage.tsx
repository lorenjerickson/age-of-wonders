import { LocationPresentationFields } from "./LocationPresentationFields";
import { presentationFields } from "./locationPresentationModel";
import { ShellTools } from "./AppShellTools";
import { LocationTerrainEditor } from "./LocationTerrainEditor";
import { ZoomableImage } from "./ZoomableImage";
import { MediaImage } from "./MediaImage";
import { Fragment, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Field,
  Fieldset,
  FileInput,
  Input,
  Select,
  Textarea,
} from "@aow/ui";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import { recordName, recordPayload } from "./worldAuthoringModel";
import { locationWithMapScene } from "./worldMapModel";
import {
  generateLocationMap,
  getMediaDownloadUrl,
  listMapMedia,
  uploadWorldMedia,
  type JsonValue,
  type MediaAsset,
} from "./api";

type ImageRecord = Record<string, JsonValue>;
function object(value: unknown): ImageRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ImageRecord)
    : {};
}
export function WorldMapPage({
  locationId,
  inlineTools = false,
}: {
  locationId: string;
  inlineTools?: boolean;
}) {
  const MapTools = inlineTools ? Fragment : ShellTools;
  const { definition, draft, saveRecord, canEdit, markDirty } =
    useWorldAuthoring();
  const record = draft?.records.find(
    (record) =>
      record.resourceType === "locations" && record.sourceId === locationId,
  );
  const payload = record ? recordPayload(record) : {};
  const scene = object(payload.mapScene);
  const [image, setImage] = useState<ImageRecord>(object(payload.image));
  const [weather, setWeather] = useState<JsonValue | undefined>(
    payload.weather as JsonValue | undefined,
  );
  const [audiovisualEffects, setAudiovisualEffects] = useState<
    JsonValue | undefined
  >(payload.audiovisualEffects as JsonValue | undefined);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [notes, setNotes] = useState(String(scene.notes ?? ""));
  const [orientation, setOrientation] = useState(
    String(
      object(payload.map).kind === "isometric"
        ? "isometric"
        : (scene.orientation ?? object(payload.image).orientation ?? "scenic"),
    ),
  );
  const [altText, setAltText] = useState(
    String(
      object(payload.image).altText ??
        `Map of ${record ? recordName(record, "this Location") : "this Location"}`,
    ),
  );
  const [baseline, setBaseline] = useState(
    JSON.stringify({
      image,
      notes,
      orientation,
      altText,
      weather,
      audiovisualEffects,
    }),
  );
  const dirty =
    JSON.stringify({
      image,
      notes,
      orientation,
      altText,
      weather,
      audiovisualEffects,
    }) !== baseline;
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);
  const [terrainDirty, setTerrainDirty] = useState(false);
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const generationKey = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const assetId = typeof image.assetId === "string" ? image.assetId : "";
  useEffect(() => {
    let cancelled = false;
    setPreview("");
    setPreviewError(false);
    if (assetId)
      void getMediaDownloadUrl(assetId).then(
        ({ url }) => {
          if (!cancelled) setPreview(url);
        },
        () => {
          if (!cancelled) setPreviewError(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  useBlocker({
    shouldBlockFn: () =>
      (dirty || terrainDirty || terrainBusy || presentationBusy || !!busy) &&
      !window.confirm("Leave without saving these Map changes?"),
    enableBeforeUnload:
      dirty || terrainDirty || terrainBusy || presentationBusy || !!busy,
  });
  async function selectAsset(asset: Pick<MediaAsset, "id" | "mimeType">) {
    const { url } = await getMediaDownloadUrl(asset.id);
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Image unavailable"));
        img.src = url;
      },
    );
    setImage({
      assetId: asset.id,
      mimeType: asset.mimeType,
      ...dimensions,
      altText,
      orientation,
    });
    setPreview(url);
    setPreviewError(false);
    setSaved(false);
    setPickerOpen(false);
  }
  async function searchMedia(nextOffset = 0) {
    setBusy("Searching");
    setMessage("");
    setPickerOpen(true);
    try {
      const result = await listMapMedia(search, nextOffset);
      setMedia(result.items);
      setTotal(result.total);
      setOffset(nextOffset);
    } catch {
      setMessage("The image library could not be loaded. Try again.");
    } finally {
      setBusy("");
    }
  }
  async function upload(file: File) {
    if (file.size === 0) {
      setMessage("This image file is empty. Choose a non-empty image file.");
      return;
    }
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setMessage("Choose an image smaller than 20 MB.");
      return;
    }
    setBusy("Uploading");
    setMessage("");
    try {
      await selectAsset(
        await uploadWorldMedia(definition.id, file, "maps", ["location-map"]),
      );
    } catch {
      setMessage(
        "The image could not be uploaded or opened. Your current Map is unchanged.",
      );
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (!draft || !direction.trim()) return;
    setBusy("Generating");
    setMessage("");
    const input = {
      expectedStorageRevision: draft.storageRevision,
      direction: direction.trim(),
      orientation: orientation as "scenic" | "overhead" | "side-on",
    };
    const fingerprint = JSON.stringify(input);
    if (generationKey.current?.fingerprint !== fingerprint)
      generationKey.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await generateLocationMap(
        definition.id,
        locationId,
        input,
        generationKey.current.key,
      );
      setImage(result.image);
      generationKey.current = null;
      setSaved(false);
      setMessage(
        "Image generated. Review it, then Save Map to attach it to this Location.",
      );
    } catch {
      setMessage(
        "The image could not be generated. Check that image generation is configured, or retry this request.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl p-4 lg:px-8 lg:py-7">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">
        Location ·{" "}
        {record
          ? recordName(record, "Unnamed Location")
          : "Location unavailable"}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Map</h2>
        {orientation !== "isometric" && record && (
          <Button
            type="submit"
            form="world-map-settings"
            tone="primary"
            className="min-h-11"
            loading={busy === "Saving"}
            disabled={
              !dirty ||
              !!busy ||
              presentationBusy ||
              !canEdit ||
              (!!assetId && !altText.trim())
            }
          >
            Save map
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-base-content/60">
        {orientation === "overhead" ? "Top-down" : orientation} ·{" "}
        {dirty || terrainDirty ? "Unsaved changes" : "Draft"}
      </p>
      <MapTools>
        <h2 className="mt-6 text-lg font-semibold">Map setup</h2>
        <Field label="Map orientation" className="mt-4">
          <Select
            value={orientation}
            disabled={!!busy || terrainBusy || presentationBusy || !canEdit}
            onChange={(event) => {
              const next = event.target.value;
              if (
                (dirty || terrainDirty) &&
                !window.confirm(
                  "Discard unsaved Map changes and change orientation?",
                )
              )
                return;
              const previous = JSON.parse(baseline);
              setImage(previous.image);
              setNotes(previous.notes);
              setAltText(previous.altText);
              setWeather(previous.weather);
              setAudiovisualEffects(previous.audiovisualEffects);
              setTerrainDirty(false);
              setTerrainBusy(false);
              setSaved(false);
              setOrientation(next);
            }}
          >
            <option value="scenic">Scenic</option>
            <option value="overhead">Overhead</option>
            <option value="side-on">Side-on</option>
            <option value="isometric">Isometric</option>
          </Select>
        </Field>
      </MapTools>
      {orientation === "isometric" ? (
        <>
          <LocationTerrainEditor
            locationId={locationId}
            disabled={!!busy}
            onDirtyChange={setTerrainDirty}
            onBusyChange={setTerrainBusy}
            onSaved={() =>
              setBaseline((previous) =>
                JSON.stringify({
                  ...JSON.parse(previous),
                  orientation: "isometric",
                }),
              )
            }
          />
          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                !record ||
                busy ||
                presentationBusy ||
                terrainBusy ||
                !canEdit
              )
                return;
              setBusy("Saving");
              setSaved(false);
              const success = await saveRecord({
                ...record,
                payload: {
                  ...object(payload),
                  ...presentationFields(weather, audiovisualEffects, payload),
                },
              });
              setBusy("");
              if (success) {
                setBaseline((previous) =>
                  JSON.stringify({
                    ...JSON.parse(previous),
                    weather,
                    audiovisualEffects,
                  }),
                );
                setSaved(true);
              }
            }}
          >
            <Fieldset
              disabled={!!busy || terrainBusy || presentationBusy || !canEdit}
              className="space-y-4"
            >
              <LocationPresentationFields
                worldId={definition.id}
                weather={weather}
                audiovisualEffects={audiovisualEffects}
                onWeather={setWeather}
                onEffects={setAudiovisualEffects}
                onBusyChange={setPresentationBusy}
              />
              <Button
                type="submit"
                tone="primary"
                className="min-h-11"
                disabled={!dirty}
              >
                Save presentation
              </Button>
            </Fieldset>
          </form>
        </>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-box border border-base-300 bg-base-200">
            {preview && !previewError ? (
              <ZoomableImage
                key={preview}
                src={preview}
                alt={altText}
                className="max-h-[70dvh] w-full object-contain"
                onError={() => setPreviewError(true)}
              />
            ) : (
              <p className="flex min-h-[55dvh] items-center justify-center p-10 text-center text-base-content/60">
                {previewError
                  ? "The attached image could not be loaded. Choose an existing image or upload a replacement."
                  : assetId
                    ? "Loading Map…"
                    : "No map image attached yet."}
              </p>
            )}
          </div>
          <MapTools>
            <DraftRequired>
              {record && (
                <>
                  <Fieldset
                    disabled={
                      !!busy || terrainBusy || presentationBusy || !canEdit
                    }
                    className="mt-6 space-y-5"
                  >
                    <div className="flex flex-wrap gap-3">
                      <Button tone="outline" onClick={() => void searchMedia()}>
                        Pick image
                      </Button>
                      <Button
                        tone="outline"
                        onClick={() => setGenerateOpen((open) => !open)}
                      >
                        Generate image
                      </Button>
                    </div>
                    <Field
                      label="Upload image"
                      help="Choose an image up to 20 MB."
                    >
                      <FileInput
                        accept="image/*"
                        className="mt-2 w-full"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void upload(file);
                          event.target.value = "";
                        }}
                      />
                    </Field>
                  </Fieldset>
                  {message && (
                    <Alert className="mt-4" aria-live="polite">
                      {message}
                    </Alert>
                  )}
                  {pickerOpen && (
                    <section
                      className="mt-6 rounded-box border border-base-300 p-5"
                      aria-label="Image library"
                    >
                      <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void searchMedia();
                        }}
                      >
                        <Field label="Search images">
                          <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                          />
                        </Field>
                        <Button type="submit" disabled={!!busy}>
                          Search
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => setPickerOpen(false)}
                        >
                          Close library
                        </Button>
                      </form>
                      <div className="mt-5 grid gap-4">
                        {media.map((asset) => (
                          <MediaChoice
                            key={asset.id}
                            asset={asset}
                            disabled={!!busy}
                            onSelect={async () => {
                              setBusy("Opening image");
                              setMessage("");
                              try {
                                await selectAsset(asset);
                              } catch {
                                setMessage(
                                  "That image could not be opened. Choose another image.",
                                );
                              } finally {
                                setBusy("");
                              }
                            }}
                          />
                        ))}
                      </div>
                      {!media.length && !busy && (
                        <p className="mt-4">No matching images.</p>
                      )}
                      <div className="mt-4 flex gap-3">
                        <Button
                          disabled={offset === 0 || !!busy}
                          onClick={() =>
                            void searchMedia(Math.max(0, offset - 24))
                          }
                        >
                          Previous
                        </Button>
                        <Button
                          disabled={offset + media.length >= total || !!busy}
                          onClick={() => void searchMedia(offset + 24)}
                        >
                          Next
                        </Button>
                      </div>
                    </section>
                  )}
                  {generateOpen && (
                    <section className="mt-6 space-y-4 rounded-box border border-base-300 p-5">
                      <Field
                        label="Image direction"
                        help="Describe the terrain, landmarks, style, and composition. Generation uses the configured AI provider."
                      >
                        <Textarea
                          className="mt-2 w-full"
                          rows={4}
                          maxLength={4000}
                          disabled={!!busy}
                          value={direction}
                          onChange={(event) => setDirection(event.target.value)}
                        />
                      </Field>
                      <Button
                        tone="primary"
                        loading={busy === "Generating"}
                        disabled={!!busy || !direction.trim()}
                        onClick={() => void generate()}
                      >
                        Generate Map preview
                      </Button>
                    </section>
                  )}
                  <form
                    id="world-map-settings"
                    className="mt-8 space-y-6"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (busy || presentationBusy || !canEdit) return;
                      setBusy("Saving");
                      setSaved(false);
                      setMessage("");
                      let next = locationWithMapScene(
                        record,
                        notes,
                        orientation,
                      );
                      if (assetId)
                        next = {
                          ...next,
                          payload: {
                            ...object(next.payload),
                            image: { ...image, altText, orientation },
                          },
                        };
                      next = {
                        ...next,
                        payload: {
                          ...object(next.payload),
                          ...presentationFields(
                            weather,
                            audiovisualEffects,
                            payload,
                          ),
                        },
                      };
                      const success = await saveRecord(next);
                      setBusy("");
                      if (success) {
                        setBaseline(
                          JSON.stringify({
                            image,
                            notes,
                            orientation,
                            altText,
                            weather,
                            audiovisualEffects,
                          }),
                        );
                        setSaved(true);
                      }
                    }}
                  >
                    <Fieldset
                      disabled={
                        !!busy || terrainBusy || presentationBusy || !canEdit
                      }
                      className="space-y-6"
                    >
                      <LocationPresentationFields
                        worldId={definition.id}
                        weather={weather}
                        audiovisualEffects={audiovisualEffects}
                        onWeather={setWeather}
                        onEffects={setAudiovisualEffects}
                        onBusyChange={setPresentationBusy}
                      />
                      <Field label="Alternative text">
                        <Input
                          className="mt-2 w-full"
                          required={!!assetId}
                          value={altText}
                          onChange={(event) => setAltText(event.target.value)}
                        />
                      </Field>
                      <Field label="Map or scene notes">
                        <Textarea
                          className="mt-2 w-full"
                          maxLength={4000}
                          rows={5}
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                        />
                      </Field>
                      <Button
                        type="submit"
                        tone="primary"
                        loading={busy === "Saving"}
                        disabled={!dirty || (!!assetId && !altText.trim())}
                      >
                        Save Map
                      </Button>
                    </Fieldset>
                  </form>
                </>
              )}
            </DraftRequired>
          </MapTools>
        </>
      )}
      {busy && (
        <p className="mt-4" role="status">
          {busy}…
        </p>
      )}
      {saved && !dirty && (
        <Alert className="mt-4" tone="success" aria-live="polite">
          Map saved to the World draft.
        </Alert>
      )}
    </main>
  );
}
function MediaChoice({
  asset,
  disabled,
  onSelect,
}: {
  asset: MediaAsset;
  disabled: boolean;
  onSelect(): void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-base-300">
      <MediaImage
        image={{ assetId: asset.id }}
        name={asset.originalName || "Saved image"}
      />
      <div className="space-y-3 p-3">
        <p className="break-words text-sm">
          {asset.originalName || "Saved image"}
        </p>
        <Button size="sm" tone="outline" disabled={disabled} onClick={onSelect}>
          Use image
        </Button>
      </div>
    </article>
  );
}
