import { Fieldset, Details, Summary } from "@aow/ui";
import { Badge, Button, Input, Label, Select } from "@aow/ui";
import {
  useSessionMovement,
  type SessionMovementController,
  type SessionMovementOptions,
} from "./useSessionMovement";
import { dateLabel, statusLabel } from "./campaignLibraryModel";
import { sessionPositionLabel as positionLabel } from "./sessionMovementMapModel";
type PanelProps = SessionMovementOptions & {
  controller?: SessionMovementController;
};
export function SessionMovementPanel(props: PanelProps) {
  return props.controller ? (
    <SessionMovementView controller={props.controller} />
  ) : (
    <StandaloneMovementPanel {...props} />
  );
}
function StandaloneMovementPanel(props: SessionMovementOptions) {
  const controller = useSessionMovement(props);
  return <SessionMovementView controller={controller} />;
}
function SessionMovementView({
  controller,
}: {
  controller: SessionMovementController;
}) {
  const {
    context,
    actors,
    actor,
    busy,
    error,
    refreshError,
    notice,
    disabled,
    coherent,
    destination,
    load,
    preview,
    decide,
    setActorId,
    setDestination,
    canReviewProposal,
  } = controller;
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
      {!coherent && context && (
        <p className="mt-3 text-sm" role="status">
          The map changed. Refresh the table and movement context before
          continuing.
        </p>
      )}
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
          <ol
            aria-label="Rule evaluation steps"
            className="mt-4 grid gap-2 text-sm sm:grid-cols-3"
          >
            <li>1. Choose an actor and destination.</li>
            <li>2. Preview and inspect the rule chain.</li>
            <li>3. Approve effects, then check committed state.</li>
          </ol>
          <p className="mt-3 text-sm">
            {context.status === "paused"
              ? "Testing paused — resume the Session to continue."
              : !actors.length
                ? "Actor setup needed at the viewed Location."
                : !context.capturedRules.length
                  ? "Ready for a no-rules test: previews should leave gameplay unchanged."
                  : "Ready to evaluate captured rules."}
          </p>
          <p className="mt-2 text-sm opacity-65">
            {context.capturedRules.length
              ? `Captured rules: ${context.capturedRules.map((rule) => `${rule.name} revision ${rule.revision}`).join(" · ")}`
              : "No rules are captured for this Instance."}
          </p>
          {context.status === "paused" && (
            <p className="mt-3 text-sm">
              Resume the Session to propose or decide movement.
            </p>
          )}
          {actor && (
            <section
              aria-label="Committed actor state"
              className="mt-4 rounded-box bg-base-200 p-4"
            >
              <h4 className="font-semibold">Committed state · {actor.name}</h4>
              <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="opacity-65">Position</dt>
                  <dd>{positionLabel(actor.position)}</dd>
                </div>
                <div>
                  <dt className="opacity-65">Movement remaining</dt>
                  <dd>
                    {actor.movementRemaining ?? "Not initialized by rules"}
                  </dd>
                </div>
                <div>
                  <dt className="opacity-65">Recorded moves</dt>
                  <dd>{actor.recordedMoves ?? "Not initialized by rules"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs opacity-65">
                Previewing does not change these values. Authored resources
                persist across Sessions; resuming does not reset them.
              </p>
            </section>
          )}
          {actors.length ? (
            <form onSubmit={(event) => void preview(event)} className="mt-4">
              <Fieldset
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
                    {actors.map((entry) => (
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
              </Fieldset>
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
                const proposalOnMap = canReviewProposal(proposal);
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
                    <Details className="mt-3 text-sm">
                      <Summary className="cursor-pointer font-medium">
                        Causal explanation
                      </Summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        {proposal.trace.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ol>
                    </Details>
                    <p className="mt-3 text-xs opacity-55">
                      {dateLabel(proposal.createdAt)}
                      {proposal.decidedAt
                        ? ` · decided ${dateLabel(proposal.decidedAt)}`
                        : ""}
                    </p>
                    {proposal.status === "pending" && !proposalOnMap && (
                      <p className="mt-3 text-sm">
                        View this actor's current Location and choose a new
                        destination to continue.
                      </p>
                    )}
                    {stale && proposalOnMap && (
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
                            disabled={disabled || !proposalOnMap}
                            onClick={() => void preview(undefined, proposal)}
                          >
                            Rebuild preview
                          </Button>
                        ) : (
                          <Button
                            tone="primary"
                            disabled={
                              disabled || !proposalOnMap || !proposal.canApprove
                            }
                            onClick={() => void decide(proposal, "approve")}
                          >
                            Approve movement
                          </Button>
                        )}
                        <Button
                          tone="outline"
                          disabled={disabled || !proposalOnMap}
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
