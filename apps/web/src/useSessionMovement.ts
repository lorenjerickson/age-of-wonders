import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import {
  chooseSessionMapActor,
  movementMapIsCoherent,
} from "./sessionMovementMapModel";

export interface SessionMovementOptions {
  campaignDefinitionId: string;
  campaignInstanceId: string;
  sessionId: string;
  onCommitted?: () => void;
  focusLocationId?: string | null;
  expectedRuntimeRevision?: number;
  expectedSnapshotNumber?: number;
  blocked?: boolean;
}
export function useSessionMovement({
  campaignDefinitionId,
  campaignInstanceId,
  sessionId,
  onCommitted,
  focusLocationId,
  expectedRuntimeRevision,
  expectedSnapshotNumber,
  blocked = false,
}: SessionMovementOptions) {
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
  const actors =
    context?.actors.filter(
      (entry) =>
        focusLocationId === undefined || entry.locationId === focusLocationId,
    ) ?? [];
  const actor = actors.find((entry) => entry.id === actorId);
  const resolvedActorId = actor?.id;
  const resolvedActorLocation = actor?.locationId;
  const previousLocation = useRef<string | null | undefined>(focusLocationId);
  const [destinationEdited, setDestinationEdited] = useState(false);
  const coherent =
    focusLocationId === undefined ||
    movementMapIsCoherent(
      context,
      expectedRuntimeRevision,
      expectedSnapshotNumber,
    );
  const disabled = Boolean(
    busy ||
    refreshError ||
    blocked ||
    !coherent ||
    context?.status !== "active",
  );
  useEffect(() => {
    const enteringLocation = previousLocation.current !== focusLocationId;
    previousLocation.current = focusLocationId;
    const choice = chooseSessionMapActor(
      actors,
      enteringLocation ? undefined : actorId,
      focusLocationId === undefined ? () => 0 : Math.random,
    );
    if (choice !== actorId) setActorId(choice ?? "");
    if (enteringLocation) setDestinationEdited(false);
  }, [context?.actors, focusLocationId, actorId]);

  useEffect(() => {
    setDestinationEdited(false);
    if (actor)
      setDestination({
        x: String(actor.position.x),
        y: String(actor.position.y),
        z: String(actor.position.z),
      });
    // Position refreshes must not overwrite an edited destination.
  }, [resolvedActorId, resolvedActorLocation]);

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
    if (!context || mutation.current || disabled) return;
    const targetActor = rebuild
      ? actors.find((entry) => entry.id === rebuild.actorId)
      : actor;
    if (!targetActor) {
      setError("Choose an available actor before previewing movement.");
      return;
    }
    if (rebuild && rebuild.locationId !== targetActor.locationId) {
      setError(
        "This actor changed Location. Choose a new destination on the current map.",
      );
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
    if (mutation.current || disabled) return;
    if (
      !actors.some(
        (entry) =>
          entry.id === proposal.actorId &&
          entry.locationId === proposal.locationId,
      )
    ) {
      setError("View this actor's Location before deciding this proposal.");
      return;
    }
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
      setDestinationEdited(false);
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

  const numericDestination = {
    x: Number(destination.x),
    y: Number(destination.y),
    z: Number(destination.z),
  };
  const pendingDestination =
    actor &&
    destinationEdited &&
    Object.values(destination).every((value) => value.trim()) &&
    Object.values(numericDestination).every(Number.isFinite)
      ? numericDestination
      : undefined;
  function selectActor(id: string) {
    if (mutation.current || !actors.some((entry) => entry.id === id)) return;
    setActorId(id);
    setDestinationEdited(false);
    setNotice("");
  }
  function pickDestination(point: TerrainPoint) {
    if (disabled || !actor || !Object.values(point).every(Number.isFinite))
      return;
    setDestination({
      x: String(point.x),
      y: String(point.y),
      z: String(point.z),
    });
    setDestinationEdited(true);
    setNotice(
      "Destination selected. Preview the captured rule effects before approving movement.",
    );
  }
  const editDestination: typeof setDestination = (update) => {
    setDestinationEdited(true);
    setDestination(update);
  };
  const canReviewProposal = (proposal: SessionMovementProposal) =>
    actors.some(
      (entry) =>
        entry.id === proposal.actorId &&
        entry.locationId === proposal.locationId,
    );
  return {
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
    pendingDestination,
    canReviewProposal,
    load,
    preview,
    decide,
    setActorId: selectActor,
    setDestination: editDestination,
    pickDestination,
  };
}
export type SessionMovementController = ReturnType<typeof useSessionMovement>;
