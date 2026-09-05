import { useEffect, useState } from "react";
import { Button, Checkbox } from "@aow/ui";
import { InternalLink } from "./navigation";
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
        Progress is stored locally for this GM. These first activities are
        self-confirmed until server-backed completion records are available.
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
  const { completed, ready, setComplete } = useQuickStartProgress(gmScope);
  const done = ready && completed.has(activityKey);
  const stepStorageKey = `${quickStartStorageKey(gmScope)}.steps.${activityKey}`;
  const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(
    new Set(),
  );
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
              onChange={(event) => setStep(index, event.target.checked)}
              label={
                <span>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step}
                </span>
              }
              className="mt-1"
              wrapperClassName="min-h-11 cursor-pointer items-start gap-3"
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
      </div>
      <InternalLink className="btn btn-outline mt-6 w-full" href="/quick-start">
        Back to Quick Start
      </InternalLink>
    </aside>
  );
}
