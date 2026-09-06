import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, StatusIndicator } from "@aow/ui";
import {
  ApiRequestError,
  getMyAuthenticationProviders,
  getParticipantCampaignSession,
  getParticipantCampaignSessionEvents,
  heartbeatCampaignSession,
  joinCampaignSession,
  leaveCampaignSession,
  type ParticipantCampaignSessionEvents,
  type ParticipantCampaignSessionProjection,
} from "./api";

function presenceKey(sessionId: string) {
  const storageKey = `aow.session.${sessionId}.presence`;
  let value = sessionStorage.getItem(storageKey);
  if (!value) {
    value = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    sessionStorage.setItem(storageKey, value);
  }
  return value;
}

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
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  const connectionKey = useRef("");

  const load = useCallback(async () => {
    try {
      const [nextSession, nextEvents] = await Promise.all([
        getParticipantCampaignSession(campaignInstanceId, sessionId),
        getParticipantCampaignSessionEvents(campaignInstanceId, sessionId),
      ]);
      setSession(nextSession);
      setEvents(nextEvents);
      setMessage("");
    } catch (caught) {
      setMessage(
        caught instanceof ApiRequestError
          ? caught.message
          : "The Session could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, [campaignInstanceId, sessionId]);

  useEffect(() => void load(), [load]);

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

  useEffect(() => {
    if (!present) return;
    const timer = window.setInterval(() => {
      void heartbeatCampaignSession(
        campaignInstanceId,
        sessionId,
        connectionKey.current,
      ).then(load, () => setPresent(false));
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [campaignInstanceId, load, present, sessionId]);

  useEffect(
    () => () => {
      if (!present || !connectionKey.current) return;
      void leaveCampaignSession(
        campaignInstanceId,
        sessionId,
        connectionKey.current,
      );
    },
    [campaignInstanceId, present, sessionId],
  );

  async function join() {
    setBusy(true);
    setMessage("");
    try {
      connectionKey.current = presenceKey(sessionId);
      await joinCampaignSession(
        campaignInstanceId,
        sessionId,
        connectionKey.current,
      );
      setPresent(true);
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof ApiRequestError
          ? caught.message
          : "The Session could not be joined.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!connectionKey.current) return;
    setBusy(true);
    try {
      await leaveCampaignSession(
        campaignInstanceId,
        sessionId,
        connectionKey.current,
      );
      setPresent(false);
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof ApiRequestError
          ? caught.message
          : "Your Session presence could not be updated.",
      );
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
                  onClick={() => void (present ? leave() : join())}
                >
                  {present ? "Leave Session" : sessionAction(session.status)}
                </Button>
              )}
          </div>
        </header>

        {message && <Alert tone="error">{message}</Alert>}

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
