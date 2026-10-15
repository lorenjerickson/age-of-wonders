import { useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@aow/ui";
import type { JsonValue } from "./api";
import {
  canvasArray,
  canvasCollections,
  canvasLayers,
  canvasObject,
  newCanvasEntry,
  patchLocationCanvas,
} from "./campaignCanvasModel";

const names = {
  lightSources: "Light",
  soundSources: "Sound",
  drawings: "Drawing",
  templates: "Template",
  notes: "Note",
};
const pluralNames = {
  lightSources: "Lights",
  soundSources: "Sounds",
  drawings: "Drawings",
  templates: "Templates",
  notes: "Notes",
};
const label = (key: string) =>
  key.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());
const string = (value: JsonValue | undefined) =>
  typeof value === "string" ? value : "";
const numeric = (value: JsonValue | undefined, fallback: number) =>
  typeof value === "number" ? value : fallback;

function NumberField({
  title,
  value,
  onChange,
  min = 0,
  max = 1,
}: {
  title: string;
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
}) {
  return (
    <Label>
      {title}
      <Input
        className="min-h-11 w-full"
        type="number"
        min={min}
        max={max}
        step="any"
        required
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </Label>
  );
}

/** Controlled draft editor: the parent owns persistence, Cancel and navigation guards. */
export function CampaignCanvasPreparation({
  canvases,
  locations,
  onChange,
}: {
  canvases: readonly JsonValue[];
  locations: readonly { id: string; name: string }[];
  onChange(value: JsonValue[]): void;
}) {
  const [selectedId, setSelectedId] = useState(locations[0]?.id ?? "");
  const selectedLocation = locations.find(
    (location) => location.id === selectedId,
  );
  const selected = canvasObject(
    canvases.find((value) => canvasObject(value).locationId === selectedId),
  );
  const patch = (value: Record<string, JsonValue>) =>
    onChange(patchLocationCanvas(canvases, selectedId, value));
  return (
    <section className="space-y-4 rounded-box border border-base-300 p-4">
      <h2 className="text-xl font-semibold">Location canvas preparation</h2>
      <p className="text-sm text-base-content/70">
        Prepare reusable layers, lights, sounds, drawings, templates and GM
        notes for a captured Location. Position and radius values run from 0 to
        1 across the map.
      </p>
      {!locations.length ? (
        <p>Add a captured Location before configuring its canvas.</p>
      ) : (
        <>
          <Label>
            Canvas Location
            <Select
              className="min-h-11 w-full"
              value={selectedId}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name || "Unnamed captured Location"}
                </option>
              ))}
            </Select>
          </Label>
          {selectedLocation && (
            <div className="space-y-4">
              <h3 className="font-semibold">
                Canvas for{" "}
                {selectedLocation.name || "Unnamed captured Location"}
              </h3>
              <Label>
                Pixels per five feet (optional)
                <Input
                  className="min-h-11 w-full"
                  type="number"
                  min="0.000001"
                  step="any"
                  value={
                    typeof selected.pixelsPerFiveFeet === "number"
                      ? selected.pixelsPerFiveFeet
                      : ""
                  }
                  onChange={(event) => {
                    if (!event.currentTarget.value) {
                      const next = { ...selected };
                      delete next.pixelsPerFiveFeet;
                      onChange(
                        canvases.map((value) =>
                          canvasObject(value).locationId === selectedId
                            ? next
                            : value,
                        ),
                      );
                    } else if (
                      Number.isFinite(event.currentTarget.valueAsNumber)
                    )
                      patch({
                        pixelsPerFiveFeet: event.currentTarget.valueAsNumber,
                      });
                  }}
                />
              </Label>
              <details className="rounded-box border border-base-300 p-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                  Layers
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {canvasLayers.map((key) => {
                    const layers = canvasArray(selected.layers);
                    const index = layers.findIndex(
                      (value) => canvasObject(value).key === key,
                    );
                    const layer = canvasObject(layers[index]);
                    const update = (change: Record<string, JsonValue>) => {
                      const next = {
                        key,
                        visible: true,
                        opacity: 1,
                        ...layer,
                        ...change,
                      };
                      patch({
                        layers:
                          index < 0
                            ? [...layers, next]
                            : layers.map((value, i) =>
                                i === index ? next : value,
                              ),
                      });
                    };
                    return (
                      <fieldset
                        key={key}
                        className="min-w-0 rounded border border-base-300 p-3"
                      >
                        <legend>{label(key)}</legend>
                        <Label className="flex min-h-11 items-center gap-2">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={
                              typeof layer.visible === "boolean"
                                ? layer.visible
                                : true
                            }
                            onChange={(event) =>
                              update({ visible: event.currentTarget.checked })
                            }
                          />
                          Visible
                        </Label>
                        <NumberField
                          title={`${label(key)} opacity`}
                          value={numeric(layer.opacity, 1)}
                          onChange={(opacity) => update({ opacity })}
                        />
                      </fieldset>
                    );
                  })}
                </div>
              </details>
              {canvasCollections.map((collection) => {
                const entries = canvasArray(selected[collection]);
                return (
                  <details
                    key={collection}
                    className="rounded-box border border-base-300 p-3"
                  >
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                      {pluralNames[collection]} ({entries.length})
                    </summary>
                    <div className="mt-3 space-y-4">
                      {entries.map((value, index) => {
                        const entry = canvasObject(value);
                        const position = canvasObject(entry.position);
                        const update = (change: Record<string, JsonValue>) =>
                          patch({
                            [collection]: entries.map((current, i) =>
                              i === index ? { ...entry, ...change } : current,
                            ),
                          });
                        const title = `${names[collection]} ${index + 1}`;
                        return (
                          <fieldset
                            className="min-w-0 space-y-3 rounded border border-base-300 p-3"
                            key={index}
                          >
                            <legend>{string(entry.name) || title}</legend>
                            <Label>
                              {title} name
                              <Input
                                className="min-h-11 w-full"
                                required
                                value={string(entry.name)}
                                onChange={(event) =>
                                  update({ name: event.currentTarget.value })
                                }
                              />
                            </Label>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <NumberField
                                title={`${title} horizontal position`}
                                value={numeric(position.x, 0.5)}
                                onChange={(x) =>
                                  update({
                                    position: {
                                      ...position,
                                      kind: "normalized-map",
                                      x,
                                    },
                                  })
                                }
                              />
                              <NumberField
                                title={`${title} vertical position`}
                                value={numeric(position.y, 0.5)}
                                onChange={(y) =>
                                  update({
                                    position: {
                                      ...position,
                                      kind: "normalized-map",
                                      y,
                                    },
                                  })
                                }
                              />
                            </div>
                            {collection !== "notes" && (
                              <NumberField
                                title={`${title} radius`}
                                value={numeric(entry.radius, 0.1)}
                                onChange={(radius) => update({ radius })}
                              />
                            )}
                            {collection === "lightSources" && (
                              <Label>
                                {title} color
                                <Input
                                  className="min-h-11 w-full"
                                  required
                                  value={string(entry.color)}
                                  onChange={(event) =>
                                    update({ color: event.currentTarget.value })
                                  }
                                />
                              </Label>
                            )}
                            {collection === "soundSources" && (
                              <>
                                <NumberField
                                  title={`${title} volume`}
                                  value={numeric(entry.volume, 1)}
                                  onChange={(volume) => update({ volume })}
                                />
                                <Label>
                                  {title} volume behavior
                                  <Select
                                    className="min-h-11 w-full"
                                    value={string(entry.volumeMode)}
                                    onChange={(event) =>
                                      update({
                                        volumeMode: event.currentTarget.value,
                                      })
                                    }
                                  >
                                    <option value="distance">
                                      Fade with distance
                                    </option>
                                    <option value="constant">
                                      Constant volume
                                    </option>
                                  </Select>
                                </Label>
                                <Label className="flex min-h-11 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={entry.loop === true}
                                    onChange={(event) =>
                                      update({
                                        loop: event.currentTarget.checked,
                                      })
                                    }
                                  />
                                  Loop sound
                                </Label>
                              </>
                            )}
                            {collection === "notes" && (
                              <Label>
                                {title} text
                                <Textarea
                                  className="min-h-24 w-full"
                                  value={string(entry.text)}
                                  onChange={(event) =>
                                    update({ text: event.currentTarget.value })
                                  }
                                />
                              </Label>
                            )}
                            <Button
                              type="button"
                              tone="outline"
                              className="min-h-11"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove ${string(entry.name) || title}? Save preparation defaults to apply this removal.`,
                                  )
                                )
                                  patch({
                                    [collection]: entries.filter(
                                      (_, i) => i !== index,
                                    ),
                                  });
                              }}
                            >
                              Remove {names[collection].toLowerCase()}
                            </Button>
                          </fieldset>
                        );
                      })}
                      <Button
                        type="button"
                        tone="outline"
                        className="min-h-11"
                        onClick={() =>
                          patch({
                            [collection]: [
                              ...entries,
                              newCanvasEntry(collection, crypto.randomUUID()),
                            ],
                          })
                        }
                      >
                        Add {names[collection].toLowerCase()}
                      </Button>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
