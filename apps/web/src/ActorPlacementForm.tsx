import { useState } from "react";
import { Alert, Button, Field, Fieldset, Input, Select } from "@aow/ui";
import type {
  CampaignInstanceCreatureEmbodimentListProjection,
  CampaignInstanceCreatureEmbodimentProjection,
} from "@aow/common";
import { placeCampaignInstanceActor } from "./api";

export function ActorPlacementForm({
  actor,
  data,
  campaignDefinitionId,
  onSaved,
}: {
  actor: CampaignInstanceCreatureEmbodimentProjection;
  data: CampaignInstanceCreatureEmbodimentListProjection;
  campaignDefinitionId: string;
  onSaved(data: CampaignInstanceCreatureEmbodimentListProjection): void;
}) {
  const locations = data.terrainLocations ?? [];
  const [location, setLocation] = useState(
    actor.currentLocationId ?? locations[0]?.id ?? "",
  );
  const [position, setPosition] = useState(
    actor.terrainPosition ?? { x: 0.5, y: 0.5, z: 1 },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(remove: boolean) {
    setBusy(true);
    setError("");
    try {
      onSaved(
        await placeCampaignInstanceActor(
          campaignDefinitionId,
          data.campaignInstanceId,
          actor.runtimeCreatureId,
          {
            expectedRuntimeRevision: data.runtimeRevision,
            locationId: location || actor.currentLocationId || "unused",
            position: remove ? null : position,
          },
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Actor placement could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Fieldset disabled={busy} className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {actor.terrainPosition && (
        <p className="text-sm">
          Placed at ({actor.terrainPosition.x}, {actor.terrainPosition.y},{" "}
          {actor.terrainPosition.z}) grid units.
        </p>
      )}
      {locations.length > 0 ? (
        <>
          <Field label="Terrain Location">
            <Select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Choose a Location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <Field key={axis} label={`${axis.toUpperCase()} grid units`}>
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={position[axis]}
                  onChange={(e) =>
                    setPosition((p) => ({
                      ...p,
                      [axis]: Number(e.target.value),
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <p className="text-xs">
            Each grid unit is five feet. Place the actor's feet on a terrain
            surface. Pause active Sessions before changing setup.
          </p>
          <Button disabled={!location} onClick={() => void save(false)}>
            Place actor
          </Button>
        </>
      ) : (
        <p className="text-sm">
          Capture a World with an isometric Location to place this actor.
        </p>
      )}
      {actor.terrainPosition && (
        <Button tone="outline" onClick={() => void save(true)}>
          Remove map placement
        </Button>
      )}
    </Fieldset>
  );
}
