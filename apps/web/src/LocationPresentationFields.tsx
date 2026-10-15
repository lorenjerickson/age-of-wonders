import { PresentationMediaName } from "./LocationPresentationSummary";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Disclosure,
  Field,
  Fieldset,
  FileInput,
  Input,
  Select,
} from "@aow/ui";
import {
  listLocationPresentationMedia,
  uploadWorldMedia,
  type JsonValue,
  type MediaAsset,
} from "./api";
import {
  presentationObject,
  presentationField,
  presentationEntries,
  type PresentationObject,
} from "./locationPresentationModel";
import { protectedComparisonText } from "./protectedAuthoringText";
import { RuleTextField } from "./RuleValueFields";

export function LocationPresentationFields({
  worldId,
  weather,
  audiovisualEffects,
  onWeather,
  onEffects,
  onBusyChange,
}: {
  worldId: string;
  weather: JsonValue | undefined;
  audiovisualEffects: JsonValue | undefined;
  onWeather(value: JsonValue): void;
  onEffects(value: JsonValue): void;
  onBusyChange?(busy: boolean): void;
}) {
  const [presentationOpen, setPresentationOpen] = useState(
    weather != null || audiovisualEffects != null,
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [picker, setPicker] = useState<string | null>(null),
    [media, setMedia] = useState<MediaAsset[]>([]),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0);
  const [mediaType, setMediaType] = useState<"images" | "audio" | "video">(
    "audio",
  );
  const entries = presentationEntries(audiovisualEffects);
  const ids = new Set(
    entries?.flatMap((entry) => [
      String(entry.id),
      String(entry.assetId ?? ""),
    ]) ?? [],
  );
  const update = (
    id: string,
    fn: (entry: PresentationObject) => PresentationObject,
  ) =>
    onEffects(entries!.map((entry) => (entry.id === id ? fn(entry) : entry)));
  async function run(action: () => Promise<void>) {
    setBusy(true);
    onBusyChange?.(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The media could not be loaded. Try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  async function browse(
    id: string,
    type: "images" | "audio" | "video",
    nextOffset = 0,
  ) {
    setPicker(id);
    setMediaType(type);
    await run(async () => {
      const result = await listLocationPresentationMedia(
        type,
        search,
        nextOffset,
      );
      setMedia(result.items);
      setTotal(result.total);
      setOffset(nextOffset);
    });
  }
  function attach(id: string, asset: MediaAsset) {
    update(id, (entry) => ({
      ...entry,
      assetId: asset.id,
      ...(!String(entry.name ?? "").trim() ? { name: asset.originalName } : {}),
    }));
    setPicker(null);
  }
  const weatherValue = presentationObject(weather) ? weather : undefined;
  const wind =
    weatherValue && presentationObject(weatherValue.wind)
      ? weatherValue.wind
      : undefined;
  return (
    <Disclosure
      summary="Weather and audiovisual effects"
      open={presentationOpen}
      onToggle={(event) => setPresentationOpen(event.currentTarget.open)}
    >
      <Fieldset disabled={busy} className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Weather</h3>
          <p className="text-sm">Authored defaults for this Location.</p>
          {weather == null ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => onWeather({ condition: "" })}
            >
              Add weather
            </Button>
          ) : !weatherValue ? (
            <>
              <Alert>
                This imported weather cannot be edited here. It will be
                preserved.
              </Alert>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => onWeather(null)}
              >
                Remove weather
              </Button>
            </>
          ) : (
            <>
              <RuleTextField
                label="Weather condition"
                value={String(weatherValue.condition ?? "")}
                recordIds={ids}
                onChange={(value) =>
                  onWeather(presentationField(weatherValue, "condition", value))
                }
              />
              <Field label="Temperature (°C)">
                <Input
                  type="number"
                  step="any"
                  className="min-h-11"
                  value={
                    typeof weatherValue.temperatureCelsius === "number"
                      ? weatherValue.temperatureCelsius
                      : ""
                  }
                  onChange={(event) =>
                    onWeather(
                      presentationField(
                        weatherValue,
                        "temperatureCelsius",
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                      ),
                    )
                  }
                />
              </Field>
              {weatherValue.wind === undefined ? (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() =>
                    onWeather({ ...weatherValue, wind: { speedKph: 0 } })
                  }
                >
                  Add wind
                </Button>
              ) : !wind ? (
                <Alert>Imported wind settings will be preserved.</Alert>
              ) : (
                <div className="space-y-3">
                  <Field label="Wind speed (km/h)">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      required
                      className="min-h-11"
                      value={
                        typeof wind.speedKph === "number" ? wind.speedKph : ""
                      }
                      onChange={(event) =>
                        onWeather({
                          ...weatherValue,
                          wind: {
                            ...wind,
                            speedKph:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Wind direction (degrees)">
                    <Input
                      type="number"
                      min="0"
                      max="359.999999"
                      step="any"
                      className="min-h-11"
                      value={
                        typeof wind.directionDegrees === "number"
                          ? wind.directionDegrees
                          : ""
                      }
                      onChange={(event) =>
                        onWeather({
                          ...weatherValue,
                          wind: presentationField(
                            wind,
                            "directionDegrees",
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                          ),
                        })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() =>
                      onWeather(
                        presentationField(weatherValue, "wind", undefined),
                      )
                    }
                  >
                    Remove wind
                  </Button>
                </div>
              )}
              <Button
                type="button"
                className="min-h-11"
                onClick={() => onWeather(null)}
              >
                Remove weather
              </Button>
            </>
          )}
        </section>
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Audiovisual effects</h3>
          <p className="text-sm">
            Named media defaults captured with this World.
          </p>
          {!entries ? (
            <>
              <Alert>
                This imported effects collection cannot be edited here. It will
                be preserved.
              </Alert>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => onEffects(null)}
              >
                Clear effects configuration
              </Button>
            </>
          ) : (
            <>
              {entries.map((entry, index) => (
                <section
                  key={String(entry.id)}
                  className="space-y-3 rounded-box border border-base-300 p-4"
                  aria-label={`Presentation effect ${index + 1}`}
                >
                  <h4>
                    {entry.kind === "audio" ? "Audio" : "Visual"} effect{" "}
                    {index + 1}
                  </h4>
                  <RuleTextField
                    label="Effect name"
                    value={String(entry.name ?? "")}
                    recordIds={ids}
                    onChange={(value) =>
                      update(String(entry.id), (current) => ({
                        ...current,
                        name: value,
                      }))
                    }
                  />
                  <p>
                    <PresentationMediaName assetId={entry.assetId} />
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() =>
                        void browse(
                          String(entry.id),
                          entry.kind === "audio" ? "audio" : "images",
                        )
                      }
                    >
                      Choose media
                    </Button>
                    <Field label="Upload effect media">
                      <FileInput
                        accept={
                          entry.kind === "audio" ? "audio/*" : "image/*,video/*"
                        }
                        className="min-h-11"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          void run(async () => {
                            if (file.size === 0)
                              throw new Error(
                                "This media file is empty. Choose a non-empty file.",
                              );
                            if (
                              !(entry.kind === "audio"
                                ? file.type.startsWith("audio/")
                                : /^(image|video)\//.test(file.type))
                            )
                              throw new Error(
                                "Choose media that matches this effect type.",
                              );
                            attach(
                              String(entry.id),
                              await uploadWorldMedia(
                                worldId,
                                file,
                                "location-presentation",
                                ["location-presentation"],
                              ),
                            );
                          });
                        }}
                      />
                    </Field>
                  </div>
                  <Checkbox
                    label="Enabled"
                    wrapperClassName="min-h-11 items-center"
                    checked={entry.enabled === true}
                    onChange={(event) =>
                      update(String(entry.id), (current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <Checkbox
                    label="Loop"
                    wrapperClassName="min-h-11 items-center"
                    checked={entry.loop === true}
                    onChange={(event) =>
                      update(String(entry.id), (current) => ({
                        ...current,
                        loop: event.target.checked,
                      }))
                    }
                  />
                  <Field
                    label={
                      entry.kind === "audio" ? "Volume (0–1)" : "Opacity (0–1)"
                    }
                  >
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="any"
                      className="min-h-11"
                      value={
                        typeof entry[
                          entry.kind === "audio" ? "volume" : "opacity"
                        ] === "number"
                          ? String(
                              entry[
                                entry.kind === "audio" ? "volume" : "opacity"
                              ],
                            )
                          : ""
                      }
                      onChange={(event) =>
                        update(String(entry.id), (current) =>
                          presentationField(
                            current,
                            entry.kind === "audio" ? "volume" : "opacity",
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                          ),
                        )
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...entries];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        onEffects(next);
                      }}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() =>
                        onEffects(
                          entries.filter((current) => current.id !== entry.id),
                        )
                      }
                    >
                      Remove effect
                    </Button>
                  </div>
                </section>
              ))}
              <div className="flex flex-wrap gap-3">
                {(["audio", "visual"] as const).map((kind) => (
                  <Button
                    type="button"
                    className="min-h-11"
                    key={kind}
                    onClick={() =>
                      onEffects([
                        ...entries,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          kind,
                          assetId: "",
                          enabled: true,
                          loop: false,
                        },
                      ])
                    }
                  >
                    Add {kind} effect
                  </Button>
                ))}
              </div>
              {audiovisualEffects !== undefined && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => onEffects(null)}
                >
                  Clear effects configuration
                </Button>
              )}
            </>
          )}
          {picker && (
            <section
              className="space-y-3 rounded-box border border-base-300 p-4"
              aria-label="Effect media library"
            >
              <Field label="Media type">
                <Select
                  className="min-h-11"
                  value={mediaType}
                  disabled={
                    entries?.find((entry) => entry.id === picker)?.kind ===
                    "audio"
                  }
                  onChange={(event) =>
                    void browse(picker, event.target.value as typeof mediaType)
                  }
                >
                  <option
                    value="audio"
                    disabled={
                      entries?.find((entry) => entry.id === picker)?.kind !==
                      "audio"
                    }
                  >
                    Audio
                  </option>
                  <option value="images">Images</option>
                  <option value="video">Video</option>
                </Select>
              </Field>
              <Field label="Search effect media">
                <Input
                  className="min-h-11"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => void browse(picker, mediaType)}
              >
                Search media
              </Button>
              {media.map((asset) => (
                <Button
                  type="button"
                  className="min-h-11 h-auto whitespace-normal"
                  key={asset.id}
                  onClick={() => attach(picker, asset)}
                >
                  {protectedComparisonText(
                    asset.originalName,
                    new Set([asset.id]),
                  )
                    ? "Saved media"
                    : asset.originalName || "Saved media"}
                </Button>
              ))}
              {!media.length && <p>No matching media.</p>}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={offset === 0}
                  onClick={() =>
                    void browse(picker, mediaType, Math.max(0, offset - 24))
                  }
                >
                  Previous media
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={offset + media.length >= total}
                  onClick={() => void browse(picker, mediaType, offset + 24)}
                >
                  Next media
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => setPicker(null)}
                >
                  Close media library
                </Button>
              </div>
            </section>
          )}
          {message && <Alert role="alert">{message}</Alert>}
        </section>
      </Fieldset>
    </Disclosure>
  );
}
