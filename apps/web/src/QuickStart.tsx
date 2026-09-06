import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button, Checkbox } from "@aow/ui";
import { InternalLink } from "./navigation";
import {
  getCampaignInstance,
  getCampaignSession,
  getCampaignSessionReadiness,
} from "./api";
import {
  parseQuickStartProgress,
  quickStartActivityIsComplete,
  QUICK_START_ACTIVITIES,
  quickStartActivity,
  quickStartStorageKey,
  type QuickStartActivityKey,
} from "./quickStartModel";

function useQuickStartProgress(gmScope: string) {
  const storageKey = quickStartStorageKey(gmScope);
  const [completed, setCompleted] = useState<
    ReadonlySet<QuickStartActivityKey>
  >(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCompleted(parseQuickStartProgress(localStorage.getItem(storageKey)));
    } catch {
      setCompleted(new Set());
    }
    setReady(true);
  }, [storageKey]);

  function setComplete(key: QuickStartActivityKey, value: boolean) {
    setCompleted((current) => {
      const next = new Set(current);
      if (value) next.add(key);
      else next.delete(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next].sort()));
      } catch {
        // The guide remains usable when browser storage is unavailable.
      }
      return next;
    });
  }

  return { completed, ready, setComplete };
}

export function QuickStartPage({ gmScope }: { gmScope: string }) {
  const { completed, ready, setComplete } = useQuickStartProgress(gmScope);
  return (
    <main className="mx-auto max-w-5xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Learn the product
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Quick Start
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-base-content/65">
        Work through real setup tasks in their canonical World, Campaign, and
        Players workspaces. Guidance travels with you and brings you back here.
      </p>
      <p className="mt-3 max-w-3xl text-sm text-base-content/50">
        Progress is scoped locally to this GM. The Session tutorial derives its
        steps from saved Campaign Instance state; earlier authoring activities
        remain self-confirmed until their completion records are available.
      </p>
      <ol className="mt-10 space-y-4">
        {QUICK_START_ACTIVITIES.map((activity, index) => {
          const done = ready && completed.has(activity.key);
          return (
            <li
              key={activity.key}
              className="card border border-base-300 bg-base-200"
            >
              <div className="card-body gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-primary uppercase">
                    Activity {index + 1} · {done ? "Complete" : "Not complete"}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {activity.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-base-content/60">
                    {activity.description}
                  </p>
                </div>
                <InternalLink className="btn btn-primary" href={activity.href}>
                  {done ? "Review activity" : "Start activity"}
                </InternalLink>
                {done && (
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => setComplete(activity.key, false)}
                  >
                    Mark incomplete
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

export function QuickStartGuide({
  activityKey,
  gmScope,
}: {
  activityKey: QuickStartActivityKey;
  gmScope: string;
}) {
  const activity = quickStartActivity(activityKey)!;
  const location = useLocation();
  const { completed, ready, setComplete } = useQuickStartProgress(gmScope);
  const done = ready && completed.has(activityKey);
  const stepStorageKey = `${quickStartStorageKey(gmScope)}.steps.${activityKey}`;
  const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const authoritative = activityKey === "plan-session";
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(stepStorageKey) ?? "[]",
      );
      setCompletedSteps(
        new Set(
          Array.isArray(parsed)
            ? parsed.filter(
                (value): value is number =>
                  Number.isInteger(value) &&
                  value >= 0 &&
                  value < activity.steps.length,
              )
            : [],
        ),
      );
    } catch {
      setCompletedSteps(new Set());
    }
  }, [activity.steps.length, stepStorageKey]);
  useEffect(() => {
    if (!authoritative) return;
    let cancelled = false;
    const match = location.pathname.match(
      /^\/campaigns\/instances\/([^/]+)(?:\/sessions\/([^/]+))?/,
    );
    const instanceId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    const sessionId = match?.[2] ? decodeURIComponent(match[2]) : undefined;
    if (!instanceId) {
      setCompletedSteps(new Set());
      return;
    }
    if (!sessionId) {
      setCompletedSteps(new Set([0]));
      return;
    }
    void getCampaignInstance(instanceId)
      .then((instance) => {
        const campaignDefinitionId =
          instance.currentSnapshot?.campaignDefinition.definitionId;
        if (!campaignDefinitionId) {
          throw new Error("Campaign Definition context is unavailable.");
        }
        return Promise.all([
          getCampaignSession(campaignDefinitionId, instanceId, sessionId),
          getCampaignSessionReadiness(
            campaignDefinitionId,
            instanceId,
            sessionId,
          ),
        ]);
      })
      .then(
        ([session, readiness]) => {
          if (cancelled) return;
          const invitees = session.participants.filter(
            ({ role }) => role === "player" || role === "spectator",
          );
          const next = new Set<number>([0, 1]);
          if (session.participants.some(({ role }) => role === "player")) {
            next.add(2);
          }
          if (
            session.status !== "planned" &&
            invitees.length > 0 &&
            invitees.every(({ response }) => response !== "not-requested")
          ) {
            next.add(3);
          }
          if (
            readiness.ready ||
            ["active", "paused", "concluded"].includes(session.status)
          ) {
            next.add(4);
          }
          setCompletedSteps(next);
          setComplete(
            activityKey,
            quickStartActivityIsComplete(next, activity.steps.length),
          );
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [activity.steps.length, activityKey, authoritative, location.pathname]);
  function setStep(index: number, checked: boolean) {
    setCompletedSteps((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      try {
        localStorage.setItem(stepStorageKey, JSON.stringify([...next].sort()));
      } catch {
        /* local progress remains usable */
      }
      setComplete(
        activityKey,
        quickStartActivityIsComplete(next, activity.steps.length),
      );
      return next;
    });
  }
  return (
    <aside
      aria-labelledby="quick-start-guide-title"
      className="border-t border-primary/20 bg-primary/[0.06] p-5 xl:min-h-full xl:border-t-0 xl:border-l"
    >
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
        Quick Start guide
      </p>
      <h2 id="quick-start-guide-title" className="mt-2 text-lg font-semibold">
        {activity.title}
      </h2>
      <ol className="mt-5 space-y-3 text-sm leading-6 text-base-content/75">
        {activity.steps.map((step, index) => (
          <li key={step}>
            <Checkbox
              checked={completedSteps.has(index)}
              disabled={authoritative}
              onChange={(event) =>
                !authoritative && setStep(index, event.target.checked)
              }
              label={
                <span>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step}
                </span>
              }
              className="mt-1"
              wrapperClassName={`min-h-11 items-start gap-3 ${authoritative ? "cursor-default" : "cursor-pointer"}`}
            />
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-box border border-base-300 bg-base-100/60 p-4">
        <p className="text-xs font-semibold uppercase">Activity progress</p>
        <p className="mt-2 text-sm" aria-live="polite">
          {done
            ? "All steps complete."
            : `${completedSteps.size} of ${activity.steps.length} steps complete.`}
        </p>
        {authoritative && (
          <p className="mt-2 text-xs text-base-content/55">
            Session steps update from the saved Campaign Instance and Session.
          </p>
        )}
      </div>
      <InternalLink className="btn btn-outline mt-6 w-full" href="/quick-start">
        Back to Quick Start
      </InternalLink>
    </aside>
  );
}
