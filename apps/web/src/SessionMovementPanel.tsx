import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Badge, Button, Input, Label, Select } from "@aow/ui";
import type {
  SessionMovementContext,
  SessionMovementProposal,
  TerrainPoint,
} from "@aow/common";
import {
  ApiRequestError,
  decideSessionMovement,
  getSessionMovement,
  proposeSessionMovement,
} from "./api";
import { dateLabel, statusLabel } from "./campaignLibraryModel";

const positionLabel = (point: TerrainPoint) =>
  `X ${point.x}, Y ${point.y}, Z ${point.z}`;

export function SessionMovementPanel({
  campaignDefinitionId,
  campaignInstanceId,
  sessionId,
  onCommitted,
}: {
  campaignDefinitionId: string;
  campaignInstanceId: string;
  sessionId: string;
  onCommitted?: () => void;
}) {
  const [context, setContext] = useState<SessionMovementContext>();
  const [actorId, setActorId] = useState("");
  const [destination, setDestination] = useState({ x: "0", y: "0", z: "0" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const mutation = useRef(false);
  const submission = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  const decisions = useRef(new Map<string, string>());
  const actor =
    context?.actors.find((entry) => entry.id === actorId) ??
    (!actorId ? context?.actors[0] : undefined);
  const resolvedActorId = actor?.id;
  useEffect(() => {
    if (actor)
      setDestination({
        x: String(actor.position.x),
        y: String(actor.position.y),
        z: String(actor.position.z),
      });
    // Position refreshes must not overwrite an edited destination.
  }, [resolvedActorId]);

  const load = useCallback(async () => {
    const requestSequence = ++sequence.current;
    try {
      const result = await getSessionMovement(
        campaignDefinitionId,
        campaignInstanceId,
        sessionId,
      );
      if (requestSequence !== sequence.current) return;
      setContext(result);
      setRefreshError("");
    } catch (caught) {
      if (requestSequence !== sequence.current) return;
      if (
        caught instanceof ApiRequestError &&
        [401, 403, 404].includes(caught.status)
      )
        setContext(undefined);
      setRefreshError(
        "Movement history could not be refreshed. Refresh before making a decision.",
      );
    }
  }, [campaignDefinitionId, campaignInstanceId, sessionId]);
  useEffect(() => {
    setContext(undefined);
    setActorId("");
    setError("");
    setNotice("");
    submission.current = undefined;
    decisions.current.clear();
    void load();
    const timer = window.setInterval(() => {
      if (!mutation.current) void load();
    }, 15_000);
    return () => {
      sequence.current++;
      window.clearInterval(timer);
    };
  }, [load]);

  async function preview(event?: FormEvent, rebuild?: SessionMovementProposal) {
    event?.preventDefault();
    if (!context || mutation.current) return;
    const targetActor = rebuild
      ? context.actors.find((entry) => entry.id === rebuild.actorId)
      : actor;
    if (!targetActor) {
      setError("Choose an available actor before previewing movement.");
      return;
    }
    const point = rebuild?.destination ?? {
      x: Number(destination.x),
      y: Number(destination.y),
      z: Number(destination.z),
    };
    if (
      !Object.values(point).every(Number.isFinite) ||
      (!rebuild && Object.values(destination).some((value) => !value.trim()))
    ) {
      setError("Enter a finite destination coordinate for each axis.");
      return;
    }
    const input = {
      actorId: targetActor.id,
      destination: point,
      expectedRuntimeRevision: context.runtimeRevision,
    };
    const fingerprint = JSON.stringify(input);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() };
    mutation.current = true;
    sequence.current++;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const result = await proposeSessionMovement(
        campaignDefinitionId,
        campaignInstanceId,
        sessionId,
        { ...input, idempotencyKey: submission.current.key },
      );
      submission.current = undefined;
      setNotice(
        result.status === "no-op"
          ? "The captured rules produced no gameplay change."
          : result.status === "failed"
            ? "The rule chain failed without applying gameplay changes."
            : "Movement preview is ready for review. No position has changed.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The preview could not be completed. Retry uses the same submission.",
      );
      if (caught instanceof ApiRequestError && caught.status === 409) {
        submission.current = undefined;
        await load();
      }
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  async function decide(
    proposal: SessionMovementProposal,
    decision: "approve" | "reject",
  ) {
    if (mutation.current) return;
    const key = `${proposal.id}/${decision}`;
    if (!decisions.current.has(key))
      decisions.current.set(key, crypto.randomUUID());
    mutation.current = true;
    sequence.current++;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await decideSessionMovement(
        campaignDefinitionId,
        campaignInstanceId,
        sessionId,
        proposal.id,
        decision,
        { idempotencyKey: decisions.current.get(key)! },
      );
      setNotice(
        decision === "approve"
          ? "The approved rule effects were committed."
          : "The movement proposal was rejected without applying effects.",
      );
      await load();
      if (decision === "approve") onCommitted?.();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The decision could not be confirmed. Retry uses the same decision.",
      );
      if (caught instanceof ApiRequestError && caught.status === 409)
        await load();
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  const disabled = Boolean(
    busy || refreshError || context?.status !== "active",
  );
  return (
    <section
      className="mt-6 rounded-box border border-base-300 bg-base-100 p-4"
      aria-labelledby="session-movement-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="session-movement-heading" className="text-xl font-semibold">
          Movement & rule decisions
        </h3>
        <Button
          tone="outline"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => void load()}
        >
          Refresh movement
        </Button>
      </div>
      <p className="mt-2 text-sm opacity-65">
        Declare a destination, inspect the captured rule effects, then approve
        or reject. A World without applicable rules produces no movement.
      </p>
      {refreshError && (
        <p className="mt-3 text-sm text-error" role="alert">
          {refreshError}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm" role="status">
        {notice}
      </p>
      {!context && !refreshError && (
        <p className="mt-3 text-sm opacity-65">Loading movement context…</p>
      )}
      {context && (
        <>
          <p className="mt-2 text-sm opacity-65">
            {context.capturedRules.length
              ? `Captured rules: ${context.capturedRules.map((rule) => `${rule.name} revision ${rule.revision}`).join(" · ")}`
              : "No enabled rules are captured for this Instance."}
          </p>
          {context.status === "paused" && (
            <p className="mt-3 text-sm">
              Resume the Session to propose or decide movement.
            </p>
          )}
          {context.actors.length ? (
            <form onSubmit={(event) => void preview(event)} className="mt-4">
              <fieldset
                disabled={disabled}
                className="grid gap-4 sm:grid-cols-3"
              >
                <Label className="sm:col-span-3">
                  Actor
                  <Select
                    className="mt-2 w-full"
                    value={actor?.id ?? ""}
                    onChange={(event) => setActorId(event.currentTarget.value)}
                  >
                    {!actor && <option value="">Choose an actor</option>}
                    {context.actors.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} · {entry.locationName}
                      </option>
                    ))}
                  </Select>
                </Label>
                {actor && (
                  <p className="text-sm opacity-65 sm:col-span-3">
                    Current position in {actor.locationName}:{" "}
                    {positionLabel(actor.position)}
                  </p>
                )}
                {(["x", "y", "z"] as const).map((axis) => (
                  <Label key={axis}>
                    Destination {axis.toUpperCase()}
                    <Input
                      type="number"
                      step="any"
                      required
                      className="mt-2 w-full"
                      value={destination[axis]}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDestination((current) => ({
                          ...current,
                          [axis]: value,
                        }));
                      }}
                    />
                  </Label>
                ))}
                <div className="sm:col-span-3">
                  <Button
                    type="submit"
                    tone="primary"
                    loading={busy === "preview"}
                  >
                    Preview movement
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <p className="mt-4 text-sm opacity-65">
              Place an Instance actor on a captured terrain map before declaring
              movement.
            </p>
          )}
          <h4 className="mt-6 font-semibold">Proposal history</h4>
          {context.proposals.length ? (
            <ol className="mt-3 grid gap-4">
              {context.proposals.map((proposal) => {
                const stale =
                  proposal.status === "pending" &&
                  proposal.expectedRuntimeRevision !== context.runtimeRevision;
                return (
                  <li
                    key={proposal.id}
                    className="rounded-box border border-base-300 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {proposal.actorName} · {proposal.locationName}
                      </p>
                      <Badge outline>{statusLabel(proposal.status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm">
                      {positionLabel(proposal.origin)} →{" "}
                      {positionLabel(proposal.destination)}
                    </p>
                    <p className="mt-2 text-sm">{proposal.explanation}</p>
                    {proposal.effects.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-semibold">
                          Proposed effects
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                          {proposal.effects.map((effect, index) => (
                            <li key={index}>{effect}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Causal explanation
                      </summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        {proposal.trace.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ol>
                    </details>
                    <p className="mt-3 text-xs opacity-55">
                      {dateLabel(proposal.createdAt)}
                      {proposal.decidedAt
                        ? ` · decided ${dateLabel(proposal.decidedAt)}`
                        : ""}
                    </p>
                    {stale && (
                      <p className="mt-3 text-sm">
                        The runtime changed. Rebuild this preview before
                        approving.
                      </p>
                    )}
                    {proposal.status === "pending" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {stale ? (
                          <Button
                            tone="primary"
                            disabled={disabled}
                            onClick={() => void preview(undefined, proposal)}
                          >
                            Rebuild preview
                          </Button>
                        ) : (
                          <Button
                            tone="primary"
                            disabled={disabled || !proposal.canApprove}
                            onClick={() => void decide(proposal, "approve")}
                          >
                            Approve movement
                          </Button>
                        )}
                        <Button
                          tone="outline"
                          disabled={disabled}
                          onClick={() => void decide(proposal, "reject")}
                        >
                          Reject proposal
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-3 text-sm opacity-65">
              No movement proposals have been recorded.
            </p>
          )}
        </>
      )}
    </section>
  );
}
