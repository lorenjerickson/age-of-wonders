import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Badge, Button, Checkbox } from "@aow/ui";
import type {
  QuickStartActivityKey,
  QuickStartActivityView,
} from "@aow/common";
import { InternalLink } from "./navigation";
import {
  getQuickStartActivity,
  getQuickStartOverview,
  updateQuickStartProgress,
} from "./api";
import { quickStartActivity } from "./quickStartModel";

export function QuickStartPage() {
  const [activities, setActivities] = useState<
    readonly QuickStartActivityView[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getQuickStartOverview().then(
      ({ activities: loaded }) => active && setActivities(loaded),
      () => active && setError("Quick Start progress could not be loaded."),
    );
    return () => {
      active = false;
    };
  }, []);
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
        Progress belongs to your GM identity. Verified steps update from the
        records named on each activity; Quick Start does not keep copies of
        World, Campaign, Player, or Session data.
      </p>
      {error && (
        <p className="mt-6 text-error" role="alert">
          {error}
        </p>
      )}
      <ol className="mt-10 space-y-4">
        {activities.map((activity, index) => (
          <li
            key={activity.definition.key}
            className="card border border-base-300 bg-base-200"
          >
            <div className="card-body gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-primary uppercase">
                  Activity {index + 1} ·{" "}
                  {activity.complete ? "Complete" : "In progress"}
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {activity.definition.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-base-content/60">
                  {activity.definition.description}
                </p>
                <p className="mt-3 text-sm">
                  {activity.completedStepCount} of {activity.steps.length} steps
                  complete
                  {activity.targetLabels.length
                    ? ` · ${activity.targetLabels.join(" · ")}`
                    : ""}
                </p>
              </div>
              <InternalLink
                className="btn btn-primary"
                href={resumeHref(activity)}
              >
                {activity.complete
                  ? "Review activity"
                  : activity.lastCanonicalRoute
                    ? "Resume activity"
                    : "Start activity"}
              </InternalLink>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

export function QuickStartGuide({
  activityKey,
}: {
  activityKey: QuickStartActivityKey;
}) {
  const fallback = quickStartActivity(activityKey)!;
  const location = useLocation();
  const [activity, setActivity] = useState<QuickStartActivityView>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () =>
      getQuickStartActivity(activityKey).then(
        (result) => active && setActivity(result),
        () => active && setError("Progress is temporarily unavailable."),
      );
    void updateQuickStartProgress(activityKey, {
      lastCanonicalRoute: location.pathname,
    }).then(
      (result) => active && setActivity(result),
      () => void refresh(),
    );
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activityKey, location.pathname]);

  async function setSelfConfirmation(stepKey: string, checked: boolean) {
    if (!activity) return;
    const keys = activity.steps
      .filter(
        (step) =>
          step.verification === "self" &&
          (step.key === stepKey ? checked : step.status === "complete"),
      )
      .map(({ key }) => key);
    setActivity(
      await updateQuickStartProgress(activityKey, {
        selfConfirmedStepKeys: keys,
      }),
    );
  }

  async function setCollapsed(collapsed: boolean) {
    setActivity(await updateQuickStartProgress(activityKey, { collapsed }));
  }

  if (activity?.collapsed)
    return (
      <aside className="border-t border-primary/20 bg-primary/[0.06] p-4 xl:min-h-full xl:border-t-0 xl:border-l">
        <Button tone="outline" onClick={() => void setCollapsed(false)}>
          Open Quick Start guide
        </Button>
      </aside>
    );

  const steps =
    activity?.steps ??
    fallback.steps.map((label, index) => ({
      key: `loading-${index}`,
      label,
      verification: "system" as const,
      status: "not-started" as const,
      detail: "Checking saved progress…",
    }));
  return (
    <aside
      aria-labelledby="quick-start-guide-title"
      className="border-t border-primary/20 bg-primary/[0.06] p-5 xl:min-h-full xl:border-t-0 xl:border-l"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Quick Start guide
        </p>
        <Button tone="ghost" size="sm" onClick={() => void setCollapsed(true)}>
          Collapse
        </Button>
      </div>
      <h2 id="quick-start-guide-title" className="mt-2 text-lg font-semibold">
        {activity?.definition.title ?? fallback.title}
      </h2>
      {activity?.targetLabels.length ? (
        <p className="mt-2 text-sm text-base-content/60">
          Working with {activity.targetLabels.join(" · ")}
        </p>
      ) : null}
      <ol className="mt-5 space-y-4 text-sm leading-6 text-base-content/75">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="rounded-box border border-base-300 bg-base-100/50 p-3"
          >
            <div className="flex items-start gap-3">
              {step.verification === "self" ? (
                <Checkbox
                  checked={step.status === "complete"}
                  onChange={(event) =>
                    void setSelfConfirmation(step.key, event.target.checked)
                  }
                  label={
                    <span>
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.label}
                    </span>
                  }
                  wrapperClassName="min-h-11 items-start"
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-base-content/55">
                    {step.detail}
                  </p>
                </div>
              )}
              <Badge
                tone={
                  step.status === "complete"
                    ? "success"
                    : step.status === "current"
                      ? "warning"
                      : "neutral"
                }
              >
                {step.status.replace("-", " ")}
              </Badge>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-box border border-base-300 bg-base-100/60 p-4">
        <p className="text-xs font-semibold uppercase">Activity progress</p>
        <p className="mt-2 text-sm" aria-live="polite">
          {activity?.complete
            ? "All steps complete."
            : `${activity?.completedStepCount ?? 0} of ${steps.length} steps complete.`}
        </p>
        <p className="mt-2 text-xs text-base-content/55">
          System-verified steps refresh from saved application state.
        </p>
        {error && <p className="mt-2 text-xs text-error">{error}</p>}
      </div>
      <InternalLink className="btn btn-outline mt-6 w-full" href="/quick-start">
        Back to Quick Start
      </InternalLink>
    </aside>
  );
}

function resumeHref(activity: QuickStartActivityView) {
  const route = activity.lastCanonicalRoute;
  if (!route) return activity.definition.href;
  return `${route}?quickStart=${encodeURIComponent(activity.definition.key)}`;
}
