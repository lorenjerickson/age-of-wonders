import type { ParticipantSpatialBinding } from "@aow/common";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, StatusIndicator } from "@aow/ui";
import {
  ApiRequestError,
  getParticipantSpatialBinding,
  getMyAuthenticationProviders,
  getParticipantCampaignSession,
  getParticipantCampaignSessionEvents,
  type ParticipantCampaignSessionEvents,
  type ParticipantCampaignSessionProjection,
} from "./api";

import { useSessionPresence } from "./useSessionPresence";

function sessionAction(status: ParticipantCampaignSessionProjection["status"]) {
  if (status === "active") return "Continue Session";
  if (status === "paused") return "Resume presence";
  return "Join lobby";
}

export function CampaignSessionParticipantPage({
  campaignInstanceId,
  sessionId,
}: {
  campaignInstanceId: string;
  sessionId: string;
}) {
  const [session, setSession] =
    useState<ParticipantCampaignSessionProjection>();
  const [events, setEvents] = useState<ParticipantCampaignSessionEvents>();
  const [spatial, setSpatial] = useState<ParticipantSpatialBinding>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [nextSession, nextEvents] = await Promise.all([
        getParticipantCampaignSession(campaignInstanceId, sessionId),
        getParticipantCampaignSessionEvents(campaignInstanceId, sessionId),
      ]);
      if (sequence !== loadSequence.current) return;
      setSession(nextSession);
      setSpatial(undefined);
      if (nextSession.role === "player" && nextSession.status === "active") {
        const binding = await getParticipantSpatialBinding(
          campaignInstanceId,
          sessionId,
        );
        if (sequence !== loadSequence.current) return;
        setSpatial(binding);
      }
      setEvents(nextEvents);
      setMessage("");
    } catch (caught) {
      if (sequence !== loadSequence.current) return;
      setSession(undefined);
      setEvents(undefined);
      setSpatial(undefined);
      setMessage(
        caught instanceof ApiRequestError
          ? caught.message
          : "The Session could not be loaded.",
      );
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }, [campaignInstanceId, sessionId]);

  useEffect(() => {
    setSpatial(undefined);
    setSession(undefined);
    setEvents(undefined);
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [load]);

  useEffect(() => {
    void getMyAuthenticationProviders().then(
      (result) => setAuth0(result.auth0),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const {
    present,
    join: joinPresence,
    leave: leavePresence,
    error: presenceError,
  } = useSessionPresence({ campaignInstanceId, sessionId, onRefresh: load });

  async function updatePresence() {
    setBusy(true);
    try {
      await (present ? leavePresence() : joinPresence());
    } catch {
      // The lease hook exposes the presence error independently of page refresh.
    } finally {
      setBusy(false);
    }
  }

  if (busy && !session) {
    return (
      <main className="grid min-h-dvh place-items-center bg-neutral text-neutral-content">
        <StatusIndicator tone="info" pulse label="Opening Session…" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-neutral px-5 py-8 text-neutral-content lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-content/15 pb-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              {session?.campaignInstanceName ?? "Campaign Instance"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {session?.sessionName ?? "Session"}
            </h1>
            {session && (
              <p className="mt-2 text-neutral-content/60">
                Participating as {session.role} · {session.status}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {auth0?.configured && !auth0.linked && (
              <a
                className="btn btn-outline"
                href={`/api/auth/auth0/link?returnTo=${encodeURIComponent(`/play/instances/${campaignInstanceId}/sessions/${sessionId}`)}`}
              >
                Connect Auth0
              </a>
            )}
            {session &&
              ["lobby", "active", "paused"].includes(session.status) && (
                <Button
                  tone={present ? "outline" : "primary"}
                  loading={busy}
                  onClick={() => void updatePresence()}
                >
                  {present ? "Leave Session" : sessionAction(session.status)}
                </Button>
              )}
          </div>
        </header>

        {message && <Alert tone="error">{message}</Alert>}
        {presenceError && <Alert tone="error">{presenceError}</Alert>}
        {session?.role === "player" && session.status === "active" && (
          <section className="rounded-box border border-neutral-content/15 p-5">
            <h2 className="text-xl font-semibold">Your map actor</h2>
            <p className="mt-2">
              {spatial?.status === "awaiting-visibility"
                ? `${spatial.actor.name} is bound to your Character. The map is waiting for authoritative visibility.`
                : spatial?.status === "unavailable" &&
                    spatial.reason === "no-active-character"
                  ? "Activate a Character before entering the map."
                  : "Your actor needs a valid map placement before the map can open."}
            </p>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <section className="rounded-box border border-neutral-content/15 bg-neutral-focus/35 p-5">
            <h2 className="text-xl font-semibold">Session activity</h2>
            <div className="mt-4 grid gap-3" aria-live="polite">
              {events?.items.length ? (
                events.items.map((event) => (
                  <article
                    key={event.sequence}
                    className="rounded-box border border-neutral-content/10 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{event.summary}</p>
                      <time className="text-xs text-neutral-content/50">
                        {new Date(event.occurredAt).toLocaleString()}
                      </time>
                    </div>
                    {event.actorName && (
                      <p className="mt-1 text-sm text-neutral-content/60">
                        {event.actorName}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <p className="text-neutral-content/55">
                  Session activity will appear here when play begins.
                </p>
              )}
            </div>
          </section>

          <aside className="rounded-box border border-neutral-content/15 bg-neutral-focus/35 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Participants</h2>
              <Badge tone={present ? "success" : "neutral"}>
                {present ? "You are present" : "Not joined"}
              </Badge>
            </div>
            <ul className="mt-4 grid gap-3">
              {session?.participants.map((participant, index) => (
                <li
                  key={`${participant.name}-${participant.role}-${index}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    {participant.name}
                    <span className="ml-2 text-xs text-neutral-content/50">
                      {participant.role}
                    </span>
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${participant.present ? "bg-success" : "bg-neutral-content/20"}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {participant.present ? "Present" : "Not present"}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
