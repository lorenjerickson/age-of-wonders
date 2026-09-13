import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Badge, Button, Label, Textarea } from "@aow/ui";
import {
  ApiRequestError,
  commandCampaignSession,
  ejectCampaignSessionParticipant,
  getCampaignSession,
  getCampaignSessionEvents,
  getCampaignSessionReadiness,
  getCampaignSessionSummary,
  issueCampaignSessionInvitations,
  updateCampaignSessionSummary,
  type CampaignSessionDetail,
  type CampaignSessionEvents,
  type CampaignSessionReadiness,
} from "./api";
import { AsyncErrorSummary } from "./CampaignInstancePages";
import { useCampaignInstance } from "./CampaignInstanceWorkspace";
import { dateLabel, statusLabel } from "./campaignLibraryModel";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { quickStartSuffix } from "./quickStartModel";
import { useSessionPresence } from "./useSessionPresence";

const pageClass = "mx-auto max-w-6xl px-6 py-12 lg:px-10";

export function CampaignSessionRunPage({ sessionId }: { sessionId: string }) {
  return <CampaignSessionPage sessionId={sessionId} operational />;
}

export function CampaignSessionPage({
  sessionId,
  operational = false,
}: {
  sessionId: string;
  operational?: boolean;
}) {
  const { instance, refresh: refreshInstance } = useCampaignInstance();
  const campaignDefinitionId = instance.campaignDefinitionId;
  const [session, setSession] = useState<CampaignSessionDetail>();
  const [readiness, setReadiness] = useState<CampaignSessionReadiness>();
  const [events, setEvents] = useState<CampaignSessionEvents>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summaryNarrative, setSummaryNarrative] = useState("");
  const [privateGmNotes, setPrivateGmNotes] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [summaryConflict, setSummaryConflict] = useState(false);
  const summaryDraft = useRef({
    narrative: "",
    notes: "",
    dirty: false,
    revision: 0,
  });
  const loadSequence = useRef(0);
  const mutationPending = useRef(false);
  const navigate = useInternalNavigate();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const recordHref = `/campaigns/instances/${encodeURIComponent(instance.id)}/sessions/${encodeURIComponent(sessionId)}${suffix}`;
  const runHref = `/campaigns/instances/${encodeURIComponent(instance.id)}/run/${encodeURIComponent(sessionId)}${suffix}`;

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      if (!campaignDefinitionId) {
        throw new Error("Campaign Definition context is unavailable.");
      }
      const [nextSession, nextReadiness, nextEvents] = await Promise.all([
        getCampaignSession(campaignDefinitionId, instance.id, sessionId),
        getCampaignSessionReadiness(
          campaignDefinitionId,
          instance.id,
          sessionId,
        ),
        getCampaignSessionEvents(campaignDefinitionId, instance.id, sessionId),
      ]);
      if (sequence !== loadSequence.current) return;
      if (nextSession.status === "concluded") {
        const summary = await getCampaignSessionSummary(
          campaignDefinitionId,
          instance.id,
          sessionId,
        );
        if (sequence !== loadSequence.current) return;
        if (!summaryDraft.current.dirty) {
          summaryDraft.current = {
            narrative: summary.narrative,
            notes: summary.privateGmNotes ?? "",
            dirty: false,
            revision: nextSession.metadataRevision,
          };
          setSummaryNarrative(summary.narrative);
          setPrivateGmNotes(summary.privateGmNotes ?? "");
          setSummaryConflict(false);
        } else if (
          summaryDraft.current.revision !== nextSession.metadataRevision
        ) {
          setSummaryConflict(true);
        }
      }
      setSession(nextSession);
      setReadiness(nextReadiness);
      setEvents(nextEvents);
      setRefreshError("");
      return true;
    } catch {
      if (sequence === loadSequence.current) {
        setRefreshError(
          "Session updates are unavailable. Refresh before making another change.",
        );
      }
      return false;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [campaignDefinitionId, instance.id, sessionId]);

  const refresh = useCallback(async () => {
    if (mutationPending.current) return;
    await load();
  }, [load]);
  const presence = useSessionPresence({
    campaignInstanceId: instance.id,
    sessionId,
    onRefresh: refresh,
  });

  useEffect(() => {
    setLoading(true);
    setSession(undefined);
    setReadiness(undefined);
    setEvents(undefined);
    setError("");
    setNotice("");
    setSummaryNarrative("");
    setPrivateGmNotes("");
    summaryDraft.current = {
      narrative: "",
      notes: "",
      dirty: false,
      revision: 0,
    };
    void load();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      loadSequence.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, refresh]);

  useEffect(() => {
    if (
      operational &&
      session &&
      !["active", "paused"].includes(session.status)
    ) {
      void navigate(recordHref, { replace: true });
    }
  }, [operational, session, recordHref, navigate]);

  useBlocker({
    shouldBlockFn: () =>
      mutationPending.current ||
      (summaryDraft.current.dirty &&
        !window.confirm("Leave without saving Session summary changes?")),
    enableBeforeUnload: Boolean(busy) || summaryDraft.current.dirty,
  });

  async function recoverConflict(caught: unknown) {
    if (caught instanceof ApiRequestError && caught.status === 409) {
      if (await load()) {
        setNotice(
          "Session state refreshed. Review the latest state and try again.",
        );
      }
    }
  }

  async function act(
    command:
      | "open-lobby"
      | "close-lobby"
      | "start"
      | "pause"
      | "resume"
      | "conclude"
      | "cancel",
  ) {
    if (!session || !readiness || mutationPending.current) return;
    let reason: string | undefined;
    if (command === "cancel") {
      reason = window.prompt("Why is this Session being cancelled?")?.trim();
      if (!reason) return;
    }
    setBusy(command);
    mutationPending.current = true;
    loadSequence.current++;
    setError("");
    try {
      if (!campaignDefinitionId) {
        throw new Error("Campaign Definition context is unavailable.");
      }
      await commandCampaignSession(
        campaignDefinitionId,
        instance.id,
        session.id,
        command,
        {
          expectedMetadataRevision: session.metadataRevision,
          expectedRuntimeRevision: readiness.runtimeRevision,
          readinessToken: readiness.token,
          reason,
        },
      );
      await load();
      await refreshInstance().catch(() => undefined);
      setNotice(
        `${session.name} ${command === "start" ? "started" : command === "resume" ? "resumed" : command.replace("-", " ")}.`,
      );
      mutationPending.current = false;
      if (command === "start" || command === "resume") await navigate(runHref);
      if (command === "conclude" || command === "cancel")
        await navigate(recordHref, { replace: operational });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The Session action could not be completed.",
      );
      await recoverConflict(caught);
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  }

  async function joinLobby() {
    if (!session || mutationPending.current) return;
    setBusy("join");
    mutationPending.current = true;
    loadSequence.current++;
    setError("");
    try {
      if (presence.present) await presence.leave();
      else await presence.join();
      await load();
      setNotice(
        presence.present
          ? "You left Session presence."
          : "You are present in the Session.",
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The lobby could not be joined.",
      );
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  }

  async function invite() {
    if (!session || mutationPending.current) return;
    setBusy("invite");
    mutationPending.current = true;
    loadSequence.current++;
    setError("");
    try {
      const result = await issueCampaignSessionInvitations(
        campaignDefinitionId!,
        instance.id,
        session.id,
      );
      setNotice(
        result.invitations.length
          ? `Session invitations were issued for ${result.invitations.length} participants.`
          : "There are no Player or Spectator invitations to issue.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "Session invitations could not be issued.",
      );
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  }

  async function ejectParticipant(
    participant: CampaignSessionDetail["participants"][number],
  ) {
    if (!session || mutationPending.current) return;
    setBusy(`eject-${participant.participationId}`);
    mutationPending.current = true;
    loadSequence.current++;
    setError("");
    try {
      await ejectCampaignSessionParticipant(
        campaignDefinitionId!,
        instance.id,
        session.id,
        participant.participationId,
        session.metadataRevision,
      );
      setNotice(`${participant.name} was removed from Session presence.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The participant could not be removed from Session presence.",
      );
      await recoverConflict(caught);
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  }

  async function saveSummary(event: FormEvent) {
    event.preventDefault();
    if (!session || mutationPending.current) return;
    setBusy("summary");
    mutationPending.current = true;
    loadSequence.current++;
    setError("");
    try {
      const result = await updateCampaignSessionSummary(
        campaignDefinitionId!,
        instance.id,
        session.id,
        {
          expectedSessionRevision: summaryDraft.current.revision,
          narrative: summaryNarrative,
          privateGmNotes,
        },
      );
      setNotice(
        result.status === "approved"
          ? "The Session summary was approved and its backup request was recorded."
          : "A new immutable Session summary amendment was recorded.",
      );
      summaryDraft.current.dirty = false;
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The Session summary could not be saved.",
      );
      await recoverConflict(caught);
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  }

  return (
    <main
      className={
        operational
          ? "min-h-screen bg-neutral px-6 py-10 text-neutral-content lg:px-10"
          : pageClass
      }
    >
      <header>
        <p className="text-xs font-semibold tracking-[0.18em] text-secondary uppercase">
          {operational ? "Run · Session" : "Campaign Instance · Session"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {session?.name ?? "Session"}
        </h1>
        <p className="mt-4 max-w-3xl opacity-65">
          {operational
            ? "Follow your participants and Session activity, and pause or end play."
            : "Manage planning, lobby readiness, lifecycle, and durable Session history."}
        </p>
      </header>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          tone="outline"
          disabled={Boolean(busy)}
          onClick={() => void refresh()}
        >
          Refresh Session
        </Button>
        <RouterButtonLink
          tone="outline"
          href={`/campaigns/instances/${encodeURIComponent(instance.id)}/sessions${suffix}`}
        >
          Back to Sessions
        </RouterButtonLink>
        {operational && session && (
          <>
            <RouterButtonLink tone="outline" href={recordHref}>
              Session management
            </RouterButtonLink>
            <RouterButtonLink
              tone="outline"
              href={`/campaigns/instances/${encodeURIComponent(instance.id)}${suffix}`}
            >
              Prepare Instance
            </RouterButtonLink>
          </>
        )}
      </div>
      {loading ? (
        <p className="mt-8 text-sm opacity-60" aria-live="polite">
          Loading…
        </p>
      ) : (
        <AsyncErrorSummary
          error={refreshError || error || presence.error}
          className="mt-8"
        />
      )}
      <p className="mt-4 text-sm" aria-live="polite">
        {notice}
      </p>
      {operational && session?.status === "paused" && (
        <p className="mt-4 rounded-box border border-warning p-4" role="status">
          Play is paused. Rejoin and review readiness before resuming.
        </p>
      )}
      {session &&
        readiness &&
        (!operational || ["active", "paused"].includes(session.status)) && (
          <fieldset
            aria-label={operational ? "Run Session" : "Session management"}
            disabled={Boolean(busy) || Boolean(refreshError)}
            className={`mt-8 grid min-w-0 gap-6 ${operational ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
          >
            <section
              className={`rounded-box border border-base-300 bg-base-200 p-6 text-base-content ${operational ? (session.status === "active" ? "lg:col-span-3" : "lg:col-span-2") : ""}`}
              aria-labelledby="session-state-heading"
            >
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="session-state-heading"
                  className="text-2xl font-semibold"
                >
                  Session state
                </h2>
                <Badge outline>{statusLabel(session.status)}</Badge>
              </div>
              {session.scheduledFor && (
                <p className="mt-3 text-sm">
                  Scheduled {dateLabel(session.scheduledFor)}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                {session.status === "planned" && (
                  <Button
                    tone="primary"
                    loading={busy === "open-lobby"}
                    onClick={() => void act("open-lobby")}
                  >
                    Open lobby
                  </Button>
                )}
                {session.status === "lobby" && (
                  <>
                    <Button
                      tone="outline"
                      loading={busy === "join"}
                      onClick={() => void joinLobby()}
                    >
                      {presence.present ? "Leave presence" : "Join lobby"}
                    </Button>
                    <Button
                      tone="outline"
                      loading={busy === "invite"}
                      onClick={() => void invite()}
                    >
                      Issue invitations
                    </Button>
                    <Button
                      tone="primary"
                      loading={busy === "start"}
                      disabled={
                        !readiness.ready ||
                        Boolean(busy) ||
                        Boolean(refreshError)
                      }
                      onClick={() => void act("start")}
                    >
                      Start Session
                    </Button>
                    <Button
                      tone="ghost"
                      loading={busy === "close-lobby"}
                      onClick={() => void act("close-lobby")}
                    >
                      Close lobby
                    </Button>
                  </>
                )}
                {session.status === "active" && (
                  <>
                    <Button
                      tone="outline"
                      loading={busy === "join"}
                      onClick={() => void joinLobby()}
                    >
                      {presence.present ? "Leave presence" : "Rejoin Session"}
                    </Button>
                    <Button
                      tone="primary"
                      loading={busy === "pause"}
                      onClick={() => void act("pause")}
                    >
                      Pause Session
                    </Button>
                    <Button
                      tone="outline"
                      loading={busy === "conclude"}
                      onClick={() => void act("conclude")}
                    >
                      Conclude Session
                    </Button>
                  </>
                )}
                {session.status === "paused" && (
                  <>
                    <Button
                      tone="outline"
                      loading={busy === "join"}
                      onClick={() => void joinLobby()}
                    >
                      {presence.present ? "Leave presence" : "Rejoin"}
                    </Button>
                    <Button
                      tone="primary"
                      loading={busy === "resume"}
                      disabled={
                        !readiness.ready ||
                        Boolean(busy) ||
                        Boolean(refreshError)
                      }
                      onClick={() => void act("resume")}
                    >
                      Resume Session
                    </Button>
                    <Button
                      tone="outline"
                      loading={busy === "conclude"}
                      onClick={() => void act("conclude")}
                    >
                      Conclude Session
                    </Button>
                  </>
                )}
                {(session.status === "planned" ||
                  session.status === "lobby") && (
                  <Button
                    tone="danger"
                    loading={busy === "cancel"}
                    onClick={() => void act("cancel")}
                  >
                    Cancel Session
                  </Button>
                )}
                {(session.status === "active" || session.status === "paused") &&
                  !operational && (
                    <RouterButtonLink
                      tone="primary"
                      href={`/campaigns/instances/${encodeURIComponent(instance.id)}/run/${encodeURIComponent(session.id)}${suffix}`}
                    >
                      {session.status === "active" ? "Continue" : "Resume"}
                    </RouterButtonLink>
                  )}
              </div>
            </section>
            {(!operational ||
              session.status === "lobby" ||
              session.status === "paused") && (
              <section
                className="rounded-box border border-base-300 bg-base-200 p-6 text-base-content"
                aria-labelledby="readiness-heading"
              >
                <h2 id="readiness-heading" className="text-2xl font-semibold">
                  Readiness
                </h2>
                <ul className="mt-4 grid gap-3">
                  {readiness.checks.map((check) => (
                    <li key={check.key} className="flex gap-3">
                      <Badge outline>{statusLabel(check.status)}</Badge>
                      <span>
                        <span className="block font-medium">{check.label}</span>
                        <span className="block text-sm text-base-content/60">
                          {check.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section
              className={`rounded-box border border-base-300 bg-base-200 p-6 text-base-content ${operational ? "lg:col-span-1" : "lg:col-span-2"}`}
              aria-labelledby="participants-heading"
            >
              <h2 id="participants-heading" className="text-2xl font-semibold">
                Participants
              </h2>
              <ul
                className={`mt-4 grid gap-3 ${operational ? "" : "md:grid-cols-2"}`}
              >
                {session.participants.map((participant) => (
                  <li
                    key={participant.participationId}
                    className="rounded-box border border-base-300 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{participant.name}</span>
                      <Badge outline>{statusLabel(participant.role)}</Badge>
                    </div>
                    <p className="mt-2 text-sm">
                      {participant.required ? "Required" : "Optional"} ·{" "}
                      {statusLabel(participant.response)} ·{" "}
                      {participant.present ? "Present" : "Not present"}
                    </p>
                    <p className="mt-1 text-xs text-base-content/60">
                      {participant.readinessDetail}
                    </p>
                    {participant.present && participant.role !== "gm" && (
                      <Button
                        className="mt-3"
                        tone="outline"
                        size="sm"
                        loading={
                          busy === `eject-${participant.participationId}`
                        }
                        onClick={() => void ejectParticipant(participant)}
                      >
                        Remove from Session
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section
              className="rounded-box border border-base-300 bg-base-200 p-6 text-base-content lg:col-span-2"
              aria-labelledby="session-events-heading"
            >
              <h2
                id="session-events-heading"
                className="text-2xl font-semibold"
              >
                Session history
              </h2>
              <p className="mt-2 text-sm text-base-content/60">
                An ordered, append-only account of planning and play activity.
              </p>
              {events?.items.length ? (
                <ol className="mt-5 space-y-3">
                  {events.items.map((item) => (
                    <li
                      key={item.sequence}
                      className="rounded-box border border-base-300 p-4"
                    >
                      <p className="font-medium">{item.summary}</p>
                      <p className="mt-1 text-xs text-base-content/60">
                        {dateLabel(item.occurredAt)} · {item.actorName}
                        {item.campaignTime ? ` · ${item.campaignTime}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm text-base-content/60">
                  No Session history has been recorded yet.
                </p>
              )}
            </section>
            {!operational && session.status === "concluded" && (
              <section
                className="rounded-box border border-base-300 bg-base-200 p-6 text-base-content lg:col-span-2"
                aria-labelledby="summary-heading"
              >
                <h2 id="summary-heading" className="text-2xl font-semibold">
                  Session summary
                </h2>
                <p className="mt-2 text-sm text-base-content/60">
                  Approved summaries are immutable. Saving again creates an
                  amendment instead of overwriting history.
                </p>
                {summaryConflict && (
                  <div className="mt-4" role="status">
                    <p>
                      The summary changed elsewhere. Your unsaved text is
                      preserved. Load the saved summary to review it before
                      making an amendment.
                    </p>
                    <Button
                      tone="outline"
                      className="mt-2"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Discard your unsaved summary and load the saved version?",
                          )
                        )
                          return;
                        summaryDraft.current.dirty = false;
                        void refresh();
                      }}
                    >
                      Load saved summary
                    </Button>
                  </div>
                )}
                <form
                  className="mt-5 grid gap-5"
                  onSubmit={(event) => void saveSummary(event)}
                >
                  <Label>
                    Narrative summary
                    <Textarea
                      className="mt-2 w-full"
                      maxLength={20000}
                      value={summaryNarrative}
                      onChange={(event) => {
                        setSummaryNarrative(event.currentTarget.value);
                        summaryDraft.current.dirty =
                          event.currentTarget.value !==
                            summaryDraft.current.narrative ||
                          privateGmNotes !== summaryDraft.current.notes;
                      }}
                    />
                  </Label>
                  <Label>
                    Private GM notes
                    <Textarea
                      className="mt-2 w-full"
                      maxLength={10000}
                      value={privateGmNotes}
                      onChange={(event) => {
                        setPrivateGmNotes(event.currentTarget.value);
                        summaryDraft.current.dirty =
                          summaryNarrative !== summaryDraft.current.narrative ||
                          event.currentTarget.value !==
                            summaryDraft.current.notes;
                      }}
                    />
                  </Label>
                  <Button
                    type="submit"
                    tone="primary"
                    loading={busy === "summary"}
                    disabled={summaryConflict}
                  >
                    {session.summaryStatus === "draft"
                      ? "Approve summary"
                      : "Record amendment"}
                  </Button>
                </form>
              </section>
            )}
          </fieldset>
        )}
    </main>
  );
}
