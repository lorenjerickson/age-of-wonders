import { SessionCombatPanel } from "./SessionCombatPanel";
import { SessionWorkspace } from "./SessionWorkspace";
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
      <main className="grid min-h-dvh place-items-center bg-neutral text-base-content">
        <StatusIndicator tone="info" pulse label="Opening Session…" />
      </main>
    );
  }

  return (
    <main>
      <SessionWorkspace
        title={session?.sessionName ?? "Session"}
        participantLabel={
          spatial?.status === "awaiting-visibility"
            ? spatial.actor.name
            : "Context"
        }
        players={
          <>
            <p>
              {session?.campaignInstanceName ?? "Campaign"} ·{" "}
              {session?.role ?? "Participant"}
            </p>
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
            {message && <Alert tone="error">{message}</Alert>}
            {presenceError && <Alert tone="error">{presenceError}</Alert>}
            {session?.role === "player" && session.status === "active" && (
              <section className="rounded-box border border-base-300/15 p-5">
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

            {session?.role === "player" &&
              ["active", "paused"].includes(session.status) && (
                <SessionCombatPanel
                  key={`${campaignInstanceId}/${sessionId}`}
                  campaignInstanceId={campaignInstanceId}
                  sessionId={sessionId}
                  blocked={session.status !== "active"}
                />
              )}
            <section className="rounded-box border border-base-300/15 bg-base-200 p-5">
              <h2 className="text-xl font-semibold">Session activity</h2>
              <div className="mt-4 grid gap-3" aria-live="polite">
                {events?.items.length ? (
                  events.items.map((event) => (
                    <article
                      key={event.sequence}
                      className="rounded-box border border-base-300/10 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{event.summary}</p>
                        <time className="text-xs text-base-content/50">
                          {new Date(event.occurredAt).toLocaleString()}
                        </time>
                      </div>
                      {event.actorName && (
                        <p className="mt-1 text-sm text-base-content/60">
                          {event.actorName}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="text-base-content/55">
                    Session activity will appear here when play begins.
                  </p>
                )}
              </div>
            </section>

            <aside className="rounded-box border border-base-300/15 bg-base-200 p-5">
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
                      <span className="ml-2 text-xs text-base-content/50">
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
          </>
        }
      >
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-xl font-semibold">
              {session?.status === "paused"
                ? "Session paused"
                : "Waiting for the scene"}
            </h2>
            <p className="mt-3 opacity-70">
              {session?.status === "active"
                ? "A map is not available for your view yet. Your Session activity and participants are available in Context."
                : "Join the Session to follow the table. Open Context for participants and activity."}
            </p>
          </div>
        </div>
      </SessionWorkspace>
    </main>
  );
}
