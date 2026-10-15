import { useBlocker } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, Button, Label, Textarea } from "@aow/ui";
import {
  updateInstanceAgentCapabilities,
  type CampaignInstanceRoster,
} from "./api";
export function InstanceAgentCapabilities({
  campaignId,
  instanceId,
  agent,
  onSaved,
}: {
  campaignId: string;
  instanceId: string;
  agent: CampaignInstanceRoster["agents"][number];
  onSaved: (roster: CampaignInstanceRoster) => void;
}) {
  const [observe, setObserve] = useState(agent.observeCapabilities.join("\n"));
  const [act, setAct] = useState(agent.actCapabilities.join("\n"));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty =
    observe !== agent.observeCapabilities.join("\n") ||
    act !== agent.actCapabilities.join("\n");
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave without saving Agent capabilities?"),
    enableBeforeUnload: dirty,
  });
  const keys = (value: string) =>
    value
      .split("\n")
      .map((key) => key.trim())
      .filter(Boolean);
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          onSaved(
            await updateInstanceAgentCapabilities(
              campaignId,
              instanceId,
              agent.participationId,
              {
                expectedObserve: agent.observeCapabilities,
                expectedAct: agent.actCapabilities,
                observe: keys(observe),
                act: keys(act),
              },
            ),
          );
        } catch {
          setError(
            "Capabilities were not saved. Refresh if the Agent changed elsewhere.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Label>
        Observe capabilities
        <Textarea
          aria-label="Observe capabilities"
          className="mt-1 w-full"
          value={observe}
          onChange={(event) => setObserve(event.currentTarget.value)}
        />
      </Label>
      <Label>
        Act capabilities
        <Textarea
          aria-label="Act capabilities"
          className="mt-1 w-full"
          value={act}
          onChange={(event) => setAct(event.currentTarget.value)}
        />
      </Label>
      <p className="text-sm">
        One capability per line. Saving requires authorization again before
        participation.
      </p>
      <Button className="min-h-11" type="submit" disabled={busy}>
        Save capabilities
      </Button>
    </form>
  );
}
