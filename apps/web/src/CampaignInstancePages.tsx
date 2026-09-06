import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useBlocker, useLocation, useRouter } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from "@aow/ui";
import {
  ApiRequestError,
  applyCampaignInstanceMigration,
  applyCampaignInstanceRestore,
  configureCampaignInstanceAgent,
  createCampaignInstance,
  createCampaignInstanceInvitation,
  decideCampaignInstancePlacement,
  getCampaignDefinition,
  getCampaignInstancePlacements,
  getCampaignInstanceEmbodiments,
  getCampaignInstanceAvailableAgents,
  getCampaignInstancePlots,
  getCampaignInstancePreparation,
  getCampaignInstanceRoster,
  getCampaignInstanceSessions,
  getCampaignInstanceVersions,
  listCampaignDefinitions,
  previewCampaignInstanceMigration,
  previewCampaignInstanceRestore,
  saveCampaignInstancePreparation,
  updateCampaignInstanceAgent,
  updateCampaignInstanceInvitation,
  updateCampaignInstancePlot,
  type CampaignDefinitionDetail,
  type CampaignDefinitionSummary,
  type CampaignInstanceMigrationPreview,
  type CampaignInstanceAvailableAgents,
  type CampaignInstancePlacementProjection,
  type CampaignInstancePlotProjection,
  type CampaignInstancePreparation,
  type CampaignInstanceRoster,
  type CampaignInstanceSessions,
  type CampaignInstanceVersions,
} from "./api";
import { dateLabel, statusLabel } from "./campaignLibraryModel";
import {
  CampaignInstanceLifecycleActions,
  useCampaignInstance,
} from "./CampaignInstanceWorkspace";
import {
  campaignInstanceInvitationCanRetry,
  mergeMigrationPreviewPages,
  migrationPreviewIsComplete,
  placementCommand,
} from "./campaignInstanceModel";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";
import { quickStartSuffix } from "./quickStartModel";
import { campaignReturnSuffix } from "./worldAuthoringModel";
import type {
  AgentId,
  CampaignDefinitionSnapshotId,
  CampaignInstanceSessionProjection,
  CampaignInstanceMigrationMappingRequest,
  CampaignInstanceSnapshotId,
  NamespacedKey,
} from "@aow/common";

const pageClass = "mx-auto max-w-6xl px-6 py-12 lg:px-10";

function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.18em] text-secondary uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-4 max-w-3xl text-base-content/65">{children}</div>
    </>
  );
}

function LoadState({ loading, error }: { loading: boolean; error: string }) {
  if (loading)
    return (
      <p className="mt-8 text-sm text-base-content/60" aria-live="polite">
        Loading…
      </p>
    );
  return <AsyncErrorSummary error={error} className="mt-8" />;
}

export function AsyncErrorSummary({
  error,
  className = "mt-6",
}: {
  error: string;
  className?: string;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const lastFocusedError = useRef("");
  useEffect(() => {
    if (!error) {
      lastFocusedError.current = "";
      return;
    }
    if (lastFocusedError.current === error) return;
    lastFocusedError.current = error;
    const frame = requestAnimationFrame(() => {
      if (lastFocusedError.current === error) summaryRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);
  if (!error) return null;
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      aria-atomic="true"
      className={`${className} rounded-box focus:outline-2 focus:outline-offset-2 focus:outline-primary`}
    >
      <Alert tone="error">
        <p className="font-semibold">There was a problem</p>
        <p className="mt-1">{error}</p>
      </Alert>
    </div>
  );
}

export function CampaignInstanceCreatePage() {
  const navigate = useInternalNavigate();
  const location = useLocation();
  const suffix = quickStartSuffix(location.searchStr);
  const requestedDefinitionId =
    new URLSearchParams(location.searchStr.replace(/^\?/, "")).get(
      "campaignDefinitionId",
    ) ?? "";
  const [definitions, setDefinitions] = useState<CampaignDefinitionSummary[]>(
    [],
  );
  const [definitionId, setDefinitionId] = useState(requestedDefinitionId);
  const [definition, setDefinition] = useState<CampaignDefinitionDetail>();
  const [snapshotId, setSnapshotId] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const allowCreatedNavigation = useRef(false);
  const creationDirty = Boolean(definitionId || snapshotId || name.trim());
  useBlocker({
    shouldBlockFn: () =>
      creationDirty &&
      !allowCreatedNavigation.current &&
      !window.confirm("Leave without creating this Campaign Instance?"),
    enableBeforeUnload: creationDirty,
  });
  useEffect(() => {
    void listCampaignDefinitions().then(
      ({ items }) =>
        setDefinitions(
          items.filter(
            ({ currentRevision, status }) =>
              Boolean(currentRevision) && status.toLowerCase() !== "archived",
          ),
        ),
      () => setMessage("Published Campaign Definitions could not be loaded."),
    );
  }, []);
  useEffect(() => {
    setDefinition(undefined);
    setSnapshotId("");
    if (!definitionId) return;
    void getCampaignDefinition(definitionId).then(setDefinition, () =>
      setMessage(
        "That Campaign Definition’s published versions could not be loaded.",
      ),
    );
  }, [definitionId]);
  const versions = useMemo(
    () =>
      (definition?.revisions ?? []).flatMap((revision) =>
        revision.snapshot
          ? [
              {
                snapshotId: revision.snapshot.id,
                revisionNumber: revision.revisionNumber,
                name: revision.name,
                publishedAt: revision.publishedAt,
                world: revision.capturedWorld,
              },
            ]
          : [],
      ),
    [definition],
  );
  const selected = versions.find(
    (version) => version.snapshotId === snapshotId,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !snapshotId) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await createCampaignInstance({
        name: name.trim(),
        campaignDefinitionSnapshotId:
          snapshotId as CampaignDefinitionSnapshotId,
        idempotencyKey: idempotencyKey.current,
      });
      allowCreatedNavigation.current = true;
      await navigate(
        `/campaigns/instances/${encodeURIComponent(created.id)}${suffix}`,
      );
    } catch {
      setMessage(
        "The Campaign Instance could not be created. Your selections remain available.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={pageClass}>
      <PageIntro
        eyebrow="Campaign Instance · New"
        title="Create Campaign Instance"
      >
        <p>
          Create one independent played realization from an exact published
          Campaign Definition revision and its required World revision.
        </p>
      </PageIntro>
      <AsyncErrorSummary error={message} />
      <form className="mt-8 space-y-6" onSubmit={submit}>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body gap-5">
            <h2 className="card-title">1. Choose the captured Definition</h2>
            <Label>
              Campaign Definition
              <Select
                className="mt-2 w-full"
                value={definitionId}
                onChange={(event) => setDefinitionId(event.currentTarget.value)}
                required
              >
                <option value="">Choose a published Campaign Definition</option>
                {definitions.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name || "Unnamed Campaign Definition"}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              Published revision
              <Select
                className="mt-2 w-full"
                value={snapshotId}
                onChange={(event) => setSnapshotId(event.currentTarget.value)}
                disabled={!definition}
                required
              >
                <option value="">Choose an exact revision</option>
                {versions.map((version) => (
                  <option key={version.snapshotId} value={version.snapshotId}>
                    {version.name || "Unnamed Campaign Definition"} · Campaign
                    revision {version.revisionNumber} ·{" "}
                    {version.world.name ||
                      version.world.worldName ||
                      "Unnamed World"}{" "}
                    revision {version.world.revisionNumber}
                  </option>
                ))}
              </Select>
            </Label>
            {selected && (
              <div
                className="rounded-box border border-base-300 bg-base-100 p-4"
                aria-live="polite"
              >
                <p className="font-semibold">Captured compatible pair</p>
                <p className="mt-2 text-sm">
                  {selected.name || "Unnamed Campaign Definition"} · Campaign
                  revision {selected.revisionNumber}
                </p>
                <p className="mt-1 text-sm">
                  {selected.world.name ||
                    selected.world.worldName ||
                    "Unnamed World"}{" "}
                  · World revision {selected.world.revisionNumber}
                </p>
                <p className="mt-1 text-xs text-base-content/55">
                  Published {dateLabel(selected.publishedAt)}. Later authoring
                  changes do not alter this Instance unless you migrate it.
                </p>
              </div>
            )}
          </div>
        </section>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body gap-5">
            <h2 className="card-title">2. Name this played realization</h2>
            <Label>
              Campaign Instance name
              <Input
                className="mt-2 w-full"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={120}
                required
              />
            </Label>
          </div>
        </section>
        <div className="flex flex-wrap gap-3">
          <Button
            tone="primary"
            loading={busy}
            disabled={!name.trim() || !snapshotId}
          >
            Create Campaign Instance
          </Button>
          <InternalLink
            className="btn btn-outline"
            href={`/campaigns${suffix}`}
          >
            Cancel
          </InternalLink>
        </div>
      </form>
    </main>
  );
}

export function CampaignInstanceOverviewPage() {
  const { instance, readiness, continuation } = useCampaignInstance();
  const snapshot = instance.currentSnapshot;
  const location = useLocation();
  const suffix = quickStartSuffix(location.searchStr);
  const base = `/campaigns/instances/${encodeURIComponent(instance.id)}`;
  return (
    <main className={pageClass}>
      <PageIntro
        eyebrow="Campaign Instance · Overview"
        title={instance.name || "Unnamed Campaign Instance"}
      >
        <p>
          Prepare and continue this played realization without changing its
          captured Campaign Definition or World.
        </p>
      </PageIntro>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Readiness</h2>
            {readiness ? (
              <>
                <p className="mt-1 text-sm">
                  {readiness.readyToActivate
                    ? "Ready to activate"
                    : "Preparation still required"}
                </p>
                <ul className="mt-4 space-y-3">
                  {readiness.checks.map((check) => (
                    <li key={check.key} className="flex items-start gap-3">
                      <Badge
                        tone={
                          check.status === "ready"
                            ? "success"
                            : check.status === "blocked"
                              ? "warning"
                              : "neutral"
                        }
                        outline
                      >
                        {statusLabel(check.status)}
                      </Badge>
                      <span>
                        <span className="block font-medium">{check.label}</span>
                        {check.detail && (
                          <span className="mt-1 block text-sm text-base-content/55">
                            {check.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-base-content/55">
                Readiness is being evaluated.
              </p>
            )}
          </div>
        </section>
        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Next action</h2>
            <p className="mt-2 text-sm text-base-content/60">
              {continuation?.detail ??
                (continuation?.session
                  ? continuation.session.name
                  : "No resumable Session is linked yet.")}
            </p>
            {continuation && (
              <RouterButtonLink
                className="mt-4"
                href={`${base}/sessions${suffix}`}
                tone="primary"
              >
                {continuation.kind === "plan-session"
                  ? "Plan Session"
                  : continuation.label}
              </RouterButtonLink>
            )}
          </div>
        </section>
        {snapshot && (
          <section className="card border border-base-300 bg-base-200 lg:col-span-2">
            <div className="card-body">
              <h2 className="card-title">Captured compatible pair</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-medium">
                    {snapshot.campaignDefinition.name ||
                      "Unnamed Campaign Definition"}
                  </p>
                  <p className="text-sm text-base-content/55">
                    Campaign revision{" "}
                    {snapshot.campaignDefinition.revisionNumber}
                  </p>
                  <RouterButtonLink
                    className="mt-3"
                    size="sm"
                    tone="outline"
                    href={`${snapshot.campaignDefinition.authoringHref}${campaignReturnSuffix(location.searchStr, location.pathname, instance.name)}`}
                  >
                    Open Campaign Authoring
                  </RouterButtonLink>
                </div>
                <div>
                  <p className="font-medium">
                    {snapshot.worldDefinition.name || "Unnamed World"}
                  </p>
                  <p className="text-sm text-base-content/55">
                    World revision {snapshot.worldDefinition.revisionNumber}
                  </p>
                  <RouterButtonLink
                    className="mt-3"
                    size="sm"
                    tone="outline"
                    href={`${snapshot.worldDefinition.authoringHref}${campaignReturnSuffix(location.searchStr, location.pathname, instance.name)}`}
                  >
                    Open World Authoring
                  </RouterButtonLink>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      <InstancePreparationForm />
      <CampaignInstanceLifecycleActions />
    </main>
  );
}

function InstancePreparationForm() {
  const { instance, refresh } = useCampaignInstance();
  const [preparation, setPreparation] = useState<CampaignInstancePreparation>();
  const [startingContext, setStartingContext] = useState("");
  const [stagingNotes, setStagingNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    void getCampaignInstancePreparation(instance.id).then(
      (value) => {
        setPreparation(value);
        setStartingContext(value.preparation.startingContext ?? "");
        setStagingNotes(value.preparation.mapVariations ?? "");
      },
      () => setError("Instance preparation could not be loaded."),
    );
  }, [instance.id]);
  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !window.confirm("Leave without saving Instance preparation changes?"),
    enableBeforeUnload: dirty,
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preparation) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await saveCampaignInstancePreparation(instance.id, {
        expectedRuntimeRevision: preparation.runtimeRevision,
        preparation: {
          ...preparation.preparation,
          startingContext: startingContext.trim(),
          mapVariations: stagingNotes.trim(),
        },
      });
      setPreparation(saved);
      setDirty(false);
      setStatus("Instance preparation saved.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "Preparation changed elsewhere. Your edits remain here; reload to compare before saving again."
          : "Preparation was not saved. Your edits remain here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-10" aria-labelledby="instance-preparation-heading">
      <h2 id="instance-preparation-heading" className="text-2xl font-semibold">
        Instance preparation
      </h2>
      <p className="mt-2 text-sm text-base-content/60">
        These values began from captured Definition defaults and now belong only
        to this Instance.
      </p>
      <AsyncErrorSummary error={error} className="mt-4" />
      {status && (
        <Alert tone="success" className="mt-4" aria-live="polite">
          {status}
        </Alert>
      )}
      {preparation && (
        <form
          className="mt-5 grid gap-5 rounded-box border border-base-300 bg-base-200 p-5"
          onSubmit={save}
        >
          <Label>
            Starting context
            <Textarea
              className="mt-2 min-h-28 w-full"
              value={startingContext}
              onChange={(event) => {
                setStartingContext(event.currentTarget.value);
                setDirty(true);
              }}
            />
          </Label>
          <Label>
            Instance staging notes
            <Textarea
              className="mt-2 min-h-28 w-full"
              value={stagingNotes}
              onChange={(event) => {
                setStagingNotes(event.currentTarget.value);
                setDirty(true);
              }}
            />
          </Label>
          <Button
            className="justify-self-start"
            loading={busy}
            disabled={!dirty}
          >
            Save Instance preparation
          </Button>
        </form>
      )}
    </section>
  );
}

export function CampaignInstancePlotsPage() {
  const { instance } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstancePlotProjection>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    void getCampaignInstancePlots(instance.id)
      .then(setData, () =>
        setError("Instance Plot progress could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [instance.id]);
  async function update(
    plotId: string,
    input: Omit<import("@aow/common").UpdateCampaignInstancePlotRequest, "expectedRuntimeRevision">,
    busyKey = plotId,
  ) {
    if (!data) return;
    setBusy(busyKey);
    setError("");
    try {
      await updateCampaignInstancePlot(instance.id, plotId, {
        expectedRuntimeRevision: data.runtimeRevision,
        ...input,
      });
      setData(await getCampaignInstancePlots(instance.id));
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "Plot progress changed elsewhere. Reload to compare before applying your change again."
          : "Plot progress was not saved.",
      );
    } finally {
      setBusy("");
    }
  }
  const renderPlots = (plots: CampaignInstancePlotProjection["roots"]): ReactNode => (
    <ul className="mt-8 space-y-4">
      {plots.map((plot) => (
        <li
          key={plot.plotDefinitionId}
          className="rounded-box border border-base-300 bg-base-200 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{plot.name || "Unnamed Plot"}</p>
              <p className="mt-2 text-xs text-base-content/50">
                Captured Plot structure · Instance progress only
              </p>
            </div>
            <Label className="min-w-40">
              Progress
              <Select
                className="mt-2"
                value={plot.status}
                disabled={busy === plot.plotDefinitionId}
                onChange={(event) =>
                  void update(
                    plot.plotDefinitionId,
                    {
                      status: event.currentTarget.value as import("@aow/common").CampaignInstancePlotProgressStatus,
                    },
                  )
                }
              >
                {[
                  "not-started",
                  "active",
                  "completed",
                  "failed",
                  "abandoned",
                ].map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </Select>
            </Label>
          </div>
          {plot.objectiveProgress.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label={`${plot.name} objectives`}>
              {plot.objectiveProgress.map((objective) => {
                const objectiveBusyKey = `${plot.plotDefinitionId}:${objective.objectiveId}`;
                return (
                  <li
                    key={objective.objectiveId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-base-100 p-3"
                  >
                    <span className="text-sm font-medium">
                      {objective.objectiveName || "Unnamed objective"}
                    </span>
                    <Label className="min-w-40">
                      Objective progress
                      <Select
                        className="mt-1"
                        value={objective.status}
                        disabled={busy === objectiveBusyKey}
                        onChange={(event) =>
                          void update(
                            plot.plotDefinitionId,
                            {
                              objectiveProgress: [
                                {
                                  objectiveId: objective.objectiveId,
                                  status: event.currentTarget.value as import("@aow/common").PlotObjectiveProgressStatus,
                                  notes: objective.notes,
                                },
                              ],
                            },
                            objectiveBusyKey,
                          )
                        }
                      >
                        {["not-started", "active", "completed", "failed"].map(
                          (value) => (
                            <option key={value} value={value}>
                              {statusLabel(value)}
                            </option>
                          ),
                        )}
                      </Select>
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
          {plot.children.length > 0 && (
            <div className="mt-3 ml-5 border-l border-base-300 pl-4">
              {renderPlots(plot.children)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <main className={pageClass}>
      <PageIntro
        eyebrow="Campaign Instance · Preparation"
        title="Plots & staging"
      >
        <p>
          Track progress for captured root Plots and subplots. Their authored
          hierarchy remains read only.
        </p>
      </PageIntro>
      <LoadState loading={loading} error={error} />
      {data &&
        (data.roots.length ? (
          renderPlots(data.roots)
        ) : (
          <Alert className="mt-8">No captured Plots are available.</Alert>
        ))}
    </main>
  );
}

export function CampaignInstancePlacementsPage() {
  const { instance } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstancePlacementProjection>();
  const [embodiments, setEmbodiments] = useState<
    Awaited<ReturnType<typeof getCampaignInstanceEmbodiments>>
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [replacementSelections, setReplacementSelections] = useState<
    Record<string, string>
  >({});
  const replacementDirty = Object.values(replacementSelections).some(Boolean);
  useBlocker({
    shouldBlockFn: () =>
      replacementDirty &&
      !window.confirm("Leave without using or clearing the replacement selection?"),
    enableBeforeUnload: replacementDirty,
  });
  useEffect(() => {
    void Promise.all([
      getCampaignInstancePlacements(instance.id),
      getCampaignInstanceEmbodiments(instance.id),
    ])
      .then(([placements, creatures]) => {
        setData(placements);
        setEmbodiments(creatures);
      }, () => setError("Instance placements could not be loaded."))
      .finally(() => setLoading(false));
  }, [instance.id]);
  async function decide(
    id: string,
    action: "realize" | "defer" | "replace" | "remove",
  ) {
    if (!data) return;
    setBusy(id);
    setError("");
    try {
      const command = placementCommand(
        data.runtimeRevision,
        action,
        replacementSelections[id],
      );
      if (!command) return;
      await decideCampaignInstancePlacement(instance.id, id, command);
      setData(await getCampaignInstancePlacements(instance.id));
      if (action === "replace") {
        setReplacementSelections((current) => ({ ...current, [id]: "" }));
      }
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "Placement state changed elsewhere. Reload and review the latest decision."
          : "The placement decision was not saved.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <main className={pageClass}>
      <PageIntro eyebrow="Campaign Instance · Preparation" title="Placements">
        <p>
          Realize, defer, or remove captured placement plans in this Instance.
          Source plans remain unchanged.
        </p>
      </PageIntro>
      <LoadState loading={loading} error={error} />
      {data && (
        <div className="mt-8 space-y-4">
          {data.items.map((placement) => (
            <article
              key={placement.realizationId}
              className="card border border-base-300 bg-base-200"
            >
              <div className="card-body">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="card-title">
                      {placement.name || "Unnamed placement"}
                    </h2>
                    <p className="mt-1 text-sm text-base-content/60">
                      Source: {placement.sourceName || "Captured content"}
                      {placement.sourceLocationName
                        ? ` · ${placement.sourceLocationName}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      {placement.sourceTypeLabel} → {statusLabel(placement.status)}
                    </p>
                  </div>
                  <Badge outline>{statusLabel(placement.status)}</Badge>
                </div>
                <div className="card-actions mt-3">
                  {(["realize", "defer", "remove"] as const).map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      tone={action === "remove" ? "outline" : "ghost"}
                      disabled={busy === placement.realizationId}
                      onClick={() => void decide(placement.realizationId, action)}
                    >
                      {statusLabel(action)}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-base-300 pt-4">
                  <Label className="min-w-64 flex-1">
                    Replacement
                    <Select
                      className="mt-2 w-full"
                      value={replacementSelections[placement.realizationId] ?? ""}
                      onChange={(event) =>
                        setReplacementSelections((current) => ({
                          ...current,
                          [placement.realizationId]: event.currentTarget.value,
                        }))
                      }
                    >
                      <option value="">Choose a replacement</option>
                      <optgroup label="Existing Instance entities">
                        {data.replacementOptions.map((option) => (
                          <option
                            key={
                              option.kind === "existing-creature"
                                ? option.runtimeCreatureId
                                : option.runtimeItemId
                            }
                            value={`${option.kind}\u0000${
                              option.kind === "existing-creature"
                                ? option.runtimeCreatureId
                                : option.runtimeItemId
                            }`}
                          >
                            {option.name} · {option.typeLabel}
                            {option.context ? ` · ${option.context}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Label>
                  <Button
                    size="sm"
                    tone="outline"
                    disabled={
                      busy === placement.realizationId ||
                      !replacementSelections[placement.realizationId]
                    }
                    onClick={() =>
                      void decide(placement.realizationId, "replace")
                    }
                  >
                    Replace
                  </Button>
                </div>
                {data.replacementOptionsTruncated && (
                  <p className="mt-2 text-xs text-base-content/55">
                    Showing 200 of {data.totalReplacementOptions} eligible
                    Instance entities. Narrowing and paging will be added with
                    the larger runtime inventory surface.
                  </p>
                )}
              </div>
            </article>
          ))}
          {!data.items.length && (
            <Alert>No captured placement plans are available.</Alert>
          )}
          <section className="mt-10">
            <h2 className="text-2xl font-semibold">Creature embodiments</h2>
            <p className="mt-2 text-sm text-base-content/60">
              Each is mutable only within this Campaign Instance.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {(embodiments?.items ?? []).map((embodiment) => (
                <li
                  key={embodiment.runtimeCreatureId}
                  className="rounded-box border border-base-300 bg-base-200 p-4"
                >
                  <p className="font-semibold">
                    {embodiment.name || "Unnamed creature"}
                  </p>
                  <p className="mt-1 text-sm text-base-content/55">
                    From {embodiment.sourceName || "captured Creature"}
                    {embodiment.currentLocationName
                      ? ` · ${embodiment.currentLocationName}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-base-content/55">
                    {embodiment.policyLabel}
                    {embodiment.policyDefaulted ? " · legacy default" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}

export function CampaignInstanceRosterPage() {
  const { instance } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstanceRoster>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [role, setRole] = useState<"player" | "spectator">("player");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const invitationDirty = Boolean(
    invitedName.trim() || email.trim() || phone.trim() || role !== "player",
  );
  useBlocker({
    shouldBlockFn: () =>
      invitationDirty &&
      !window.confirm("Leave without sending or clearing this invitation?"),
    enableBeforeUnload: invitationDirty,
  });
  useEffect(() => {
    void getCampaignInstanceRoster(instance.id)
      .then(setData, () => setError("The Instance roster could not be loaded."))
      .finally(() => setLoading(false));
  }, [instance.id]);
  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!invitedName.trim() || (!email.trim() && !phone.trim())) return;
    setBusy("invite");
    setError("");
    try {
      await createCampaignInstanceInvitation(instance.id, {
        invitedName: invitedName.trim(),
        role,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setData(await getCampaignInstanceRoster(instance.id));
      setInvitedName("");
      setEmail("");
      setPhone("");
    } catch {
      setError(
        "The invitation was not created. The entered details remain available.",
      );
    } finally {
      setBusy("");
    }
  }
  async function invitationAction(id: string, action: "retry" | "revoke") {
    setBusy(id);
    setError("");
    try {
      await updateCampaignInstanceInvitation(instance.id, id, action);
      setData(await getCampaignInstanceRoster(instance.id));
    } catch {
      setError(
        `The invitation could not be ${action === "retry" ? "retried" : "revoked"}.`,
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <main className={pageClass}>
      <PageIntro eyebrow="Campaign Instance · Participation" title="Roster">
        <p>
          Manage durable Instance membership, invitations, and Character
          readiness separately from Session attendance.
        </p>
      </PageIntro>
      <LoadState loading={loading} error={error} />
      {data && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="members-heading">
            <h2 id="members-heading" className="text-2xl font-semibold">
              People
            </h2>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {data.memberships.map((member) => (
                <li
                  key={member.membershipId}
                  className="rounded-box border border-base-300 bg-base-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {member.displayName || "Unnamed member"}
                      </p>
                      <p className="mt-1 text-sm">
                        {statusLabel(member.role)} ·{" "}
                        {statusLabel(member.status)}
                      </p>
                    </div>
                    <Badge outline>{statusLabel(member.status)}</Badge>
                  </div>
                  {member.activeCharacterName && (
                    <p className="mt-3 text-sm">
                      Character: {member.activeCharacterName}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section
            className="grid gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_1.15fr]"
            aria-labelledby="invitations-heading"
          >
            <form
              className="rounded-box border border-base-300 bg-base-200 p-5"
              onSubmit={invite}
            >
              <h2 id="invitations-heading" className="text-xl font-semibold">
                Invite a person
              </h2>
              <div className="mt-4 grid gap-4">
                <Label>
                  Name
                  <Input
                    className="mt-2 w-full"
                    value={invitedName}
                    onChange={(event) =>
                      setInvitedName(event.currentTarget.value)
                    }
                    required
                  />
                </Label>
                <Label>
                  Role
                  <Select
                    className="mt-2 w-full"
                    value={role}
                    onChange={(event) =>
                      setRole(
                        event.currentTarget.value as "player" | "spectator",
                      )
                    }
                  >
                    <option value="player">Player</option>
                    <option value="spectator">Spectator</option>
                  </Select>
                </Label>
                <Label>
                  Email
                  <Input
                    className="mt-2 w-full"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                </Label>
                <Label>
                  Mobile phone
                  <Input
                    className="mt-2 w-full"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.currentTarget.value)}
                  />
                </Label>
                <Button tone="primary" loading={busy === "invite"}>
                  Send invitation
                </Button>
              </div>
            </form>
            <div>
              <h2 className="text-xl font-semibold">Invitations</h2>
              <ul className="mt-4 space-y-3">
                {data.invitations.map((invitation) => (
                  <li
                    key={invitation.invitationId}
                    className="rounded-box border border-base-300 bg-base-200 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {invitation.invitedName ||
                            `Invited ${statusLabel(invitation.role)}`}
                        </p>
                        <p className="mt-1 text-sm">
                          {statusLabel(invitation.status)} · expires{" "}
                          {dateLabel(invitation.expiresAt)}
                        </p>
                        {invitation.delivery.map((delivery) => (
                          <p
                            key={delivery.channel}
                            className="mt-1 text-xs text-base-content/55"
                          >
                            {statusLabel(delivery.channel)}{" "}
                            destination protected · {statusLabel(delivery.status)}
                          </p>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {invitation.status === "pending" && (
                          <Button
                            size="sm"
                            tone="ghost"
                            disabled={busy === invitation.invitationId}
                            onClick={() =>
                              void invitationAction(
                                invitation.invitationId,
                                "revoke",
                              )
                            }
                          >
                            Revoke
                          </Button>
                        )}
                        {campaignInstanceInvitationCanRetry(
                          invitation.status,
                        ) && (
                          <Button
                            size="sm"
                            tone="outline"
                            disabled={busy === invitation.invitationId}
                            onClick={() =>
                              void invitationAction(
                                invitation.invitationId,
                                "retry",
                              )
                            }
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {!data.invitations.length && (
                <p className="mt-3 text-sm text-base-content/55">
                  No invitations have been created.
                </p>
              )}
            </div>
          </section>
          <section aria-labelledby="characters-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="characters-heading" className="text-2xl font-semibold">
                  Characters
                </h2>
                <p className="mt-2 text-sm text-base-content/60">
                  Characters are bound to this Instance. Creation and import are
                  handled in the next product slice.
                </p>
              </div>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {data.characters.map((character) => (
                <li
                  key={character.characterId}
                  className="rounded-box border border-base-300 bg-base-200 p-4"
                >
                  <p className="font-semibold">
                    {character.name || "Unnamed Character"}
                  </p>
                  <p className="mt-1 text-sm">
                    Player: {character.playerName || "Player unavailable"}
                  </p>
                  <p className="mt-1 text-xs">
                    {statusLabel(character.status)} ·{" "}
                    {statusLabel(character.readiness)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">Agents</h2>
                <p className="mt-2 text-sm text-base-content/60">
                  Non-human processes have explicit, separate Observe and Act
                  grants.
                </p>
              </div>
              <RouterButtonLink
                href={`/campaigns/instances/${encodeURIComponent(instance.id)}/roster/agents${quickStartSuffix(useLocation().searchStr)}`}
                tone="outline"
              >
                Manage Agents
              </RouterButtonLink>
            </div>
            <p className="mt-3 text-sm">
              {data.agents.length} configured Agent
              {data.agents.length === 1 ? "" : "s"}.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

export function CampaignInstanceAgentsPage() {
  const { instance } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstanceRoster>();
  const [available, setAvailable] = useState<CampaignInstanceAvailableAgents>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [agentId, setAgentId] = useState("");
  const [observe, setObserve] = useState("");
  const [act, setAct] = useState("");
  const agentDraftDirty = Boolean(agentId || observe.trim() || act.trim());
  useBlocker({
    shouldBlockFn: () =>
      agentDraftDirty &&
      !window.confirm("Leave without configuring or clearing this Agent?"),
    enableBeforeUnload: agentDraftDirty,
  });
  useEffect(() => {
    void Promise.all([
      getCampaignInstanceRoster(instance.id),
      getCampaignInstanceAvailableAgents(instance.id),
    ]).then(
      ([roster, choices]) => {
        setData(roster);
        setAvailable(choices);
      },
      () => setError("Agents could not be loaded."),
    );
  }, [instance.id]);
  const capabilityKeys = (value: string) =>
    value
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry): entry is NamespacedKey =>
        /^[^:\s]+:[^:\s]+$/.test(entry),
      );
  const capabilitiesValid = [observe, act]
    .flatMap((value) => value.split("\n"))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .every((entry) => /^[^:\s]+:[^:\s]+$/.test(entry));
  async function configure(event: FormEvent) {
    event.preventDefault();
    if (!agentId || !capabilitiesValid) return;
    setBusy("new");
    setError("");
    try {
      await configureCampaignInstanceAgent(instance.id, {
        agentId: agentId as AgentId,
        observe: capabilityKeys(observe),
        act: capabilityKeys(act),
      });
      const [roster, choices] = await Promise.all([
        getCampaignInstanceRoster(instance.id),
        getCampaignInstanceAvailableAgents(instance.id),
      ]);
      setData(roster);
      setAvailable(choices);
      setAgentId("");
      setObserve("");
      setAct("");
    } catch {
      setError("The Agent was not configured. Review the capability grants.");
    } finally {
      setBusy("");
    }
  }
  async function action(
    id: string,
    current: "configured" | "authorized" | "active" | "paused",
    next: "authorized" | "paused" | "revoked",
  ) {
    setBusy(id);
    setError("");
    try {
      await updateCampaignInstanceAgent(instance.id, id, {
        expectedStatus: current,
        status: next,
      });
      setData(await getCampaignInstanceRoster(instance.id));
    } catch {
      setError("The Agent status was not changed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <main className={pageClass}>
      <PageIntro eyebrow="Campaign Instance · Participation" title="Agents">
        <p>
          Grant least-privilege observation and Agent-native actions. Agents
          never receive human roles or impersonation authority.
        </p>
      </PageIntro>
      <AsyncErrorSummary error={error} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          className="rounded-box border border-base-300 bg-base-200 p-5"
          onSubmit={configure}
        >
          <h2 className="text-xl font-semibold">Configure Agent</h2>
          <div className="mt-4 grid gap-4">
            <Label>
              Registered Agent
              <Select
                className="mt-2 w-full"
                value={agentId}
                onChange={(event) => setAgentId(event.currentTarget.value)}
                required
              >
                <option value="">Choose a registered Agent</option>
                {available?.items.map((agent) => (
                  <option
                    key={agent.agentId}
                    value={agent.agentId}
                    disabled={agent.status !== "active"}
                  >
                    {agent.name || "Unnamed registered Agent"}
                    {agent.status === "disabled" ? " (disabled)" : ""}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              Observe capabilities, one namespaced key per line
              <Textarea
                className="mt-2 min-h-28 w-full"
                value={observe}
                onChange={(event) => setObserve(event.currentTarget.value)}
                placeholder="narrative:events.read"
              />
            </Label>
            <Label>
              Act capabilities, one namespaced key per line
              <Textarea
                className="mt-2 min-h-28 w-full"
                value={act}
                onChange={(event) => setAct(event.currentTarget.value)}
                placeholder="narrative:suggestions.create"
                aria-describedby="agent-capability-help"
              />
            </Label>
            <p id="agent-capability-help" className="text-xs text-base-content/55">
              Capability keys use the form namespace:capability.
            </p>
            {!capabilitiesValid && (
              <Alert tone="warning">Every capability needs a namespace and name.</Alert>
            )}
            <Button
              tone="primary"
              loading={busy === "new"}
              disabled={!agentId || !capabilitiesValid}
            >
              Configure Agent
            </Button>
          </div>
        </form>
        <section aria-labelledby="configured-agents">
          <h2 id="configured-agents" className="text-xl font-semibold">
            Configured Agents
          </h2>
          <ul className="mt-4 space-y-3">
            {data?.agents.map((agent) => (
              <li
                key={agent.participationId}
                className="rounded-box border border-base-300 bg-base-200 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    {agent.name || "Unnamed Agent"}
                  </p>
                  <Badge outline>{statusLabel(agent.status)}</Badge>
                </div>
                <p className="mt-3 text-sm">
                  <strong>Observe:</strong>{" "}
                  {agent.observeCapabilities.join(", ") || "None"}
                </p>
                <p className="mt-2 text-sm">
                  <strong>Act:</strong>{" "}
                  {agent.actCapabilities.join(", ") || "None"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {agent.status === "configured" && (
                    <Button
                      size="sm"
                      disabled={busy === agent.participationId}
                      onClick={() =>
                        void action(
                          agent.participationId,
                          "configured",
                          "authorized",
                        )
                      }
                    >
                      Authorize
                    </Button>
                  )}
                  {["authorized", "active"].includes(agent.status) && (
                    <Button
                      size="sm"
                      tone="outline"
                      disabled={busy === agent.participationId}
                      onClick={() =>
                        void action(
                          agent.participationId,
                          agent.status as "authorized" | "active",
                          "paused",
                        )
                      }
                    >
                      Pause
                    </Button>
                  )}
                  {agent.status !== "revoked" && (
                    <Button
                      size="sm"
                      tone="ghost"
                      disabled={busy === agent.participationId}
                      onClick={() =>
                        void action(
                          agent.participationId,
                          agent.status as
                            | "configured"
                            | "authorized"
                            | "active"
                            | "paused",
                          "revoked",
                        )
                      }
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export function CampaignInstanceSessionsPage() {
  const { instance, continuation } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstanceSessions>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void getCampaignInstanceSessions(instance.id)
      .then(setData, () =>
        setError("Sessions could not be loaded for this Campaign Instance."),
      )
      .finally(() => setLoading(false));
  }, [instance.id]);
  const section = (
    title: string,
    sessions: readonly CampaignInstanceSessionProjection[],
  ) => (
    <section
      className="mt-9"
      aria-labelledby={`sessions-${title.toLowerCase()}`}
    >
      <h2
        id={`sessions-${title.toLowerCase()}`}
        className="text-2xl font-semibold"
      >
        {title}
      </h2>
      {sessions.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="rounded-box border border-base-300 bg-base-200 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">
                  {session.name || "Unnamed Session"}
                </p>
                <Badge outline>{statusLabel(session.status)}</Badge>
              </div>
              {session.scheduledFor && (
                <p className="mt-2 text-sm">{dateLabel(session.scheduledFor)}</p>
              )}
              <p className="mt-1 text-xs text-base-content/55">
                {session.participantCount ?? 0} participants · Session
                attendance is separate from Instance membership.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-base-content/55">
          No {title.toLowerCase()} Sessions.
        </p>
      )}
    </section>
  );
  return (
    <main className={pageClass}>
      <PageIntro eyebrow="Campaign Instance · History" title="Sessions">
        <p>
          Sessions belong only to this Instance. Planning and active Play
          controls arrive in the Session slice.
        </p>
      </PageIntro>
      {continuation?.detail && (
        <Alert tone="info" className="mt-6">
          {continuation.detail}
        </Alert>
      )}
      <LoadState loading={loading} error={error} />
      {data && (
        <>
          {section("Current", data.current)}
          {section("Planned", data.planned)}
          {section("History", data.history)}
        </>
      )}
    </main>
  );
}

export function CampaignInstanceVersionsPage() {
  const { instance } = useCampaignInstance();
  const [data, setData] = useState<CampaignInstanceVersions>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const suffix = quickStartSuffix(useLocation().searchStr);
  useEffect(() => {
    void getCampaignInstanceVersions(instance.id)
      .then(setData, () =>
        setError("Instance version history could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [instance.id]);
  return (
    <main className={pageClass}>
      <PageIntro
        eyebrow="Campaign Instance · History"
        title="Versions & migrations"
      >
        <p>
          This Instance remains pinned to its captured pair until you explicitly
          adopt a complete compatible direct successor.
        </p>
      </PageIntro>
      <LoadState loading={loading} error={error} />
      {data && (
        <>
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Snapshot history</h2>
                <p className="mt-2 text-sm text-base-content/60">
                  Earlier snapshots remain inspectable and are never rewritten.
                </p>
              </div>
              {data.migrationAvailable && data.migrationTargets.length > 0 && (
                <RouterButtonLink
                  href={`/campaigns/instances/${encodeURIComponent(instance.id)}/versions/migrate${suffix}`}
                  tone="primary"
                >
                  Review migration
                </RouterButtonLink>
              )}
            </div>
            <ol className="mt-5 space-y-3">
              {data.items.map((snapshot) => (
                <li
                  key={snapshot.snapshotId}
                  className="rounded-box border border-base-300 bg-base-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">
                      Instance snapshot {snapshot.snapshotNumber}
                    </p>
                    {snapshot.current && (
                      <Badge tone="success">Current</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm">
                    {snapshot.campaignDefinition.name} revision{" "}
                    {snapshot.campaignDefinition.revisionNumber} ·{" "}
                    {snapshot.worldDefinition.name} revision{" "}
                    {snapshot.worldDefinition.revisionNumber}
                  </p>
                  <p className="mt-1 text-xs text-base-content/55">
                    {statusLabel(snapshot.reason)} · adopted{" "}
                    {dateLabel(snapshot.adoptedAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          {data.migrationBlockedReason && (
            <Alert tone="warning" className="mt-8">
              {data.migrationBlockedReason}
            </Alert>
          )}
          {data.restoreTarget && (
            <section className="mt-8 rounded-box border border-base-300 bg-base-200 p-5">
              <h2 className="text-xl font-semibold">Restore direct predecessor</h2>
              <p className="mt-2 text-sm">
                Review restoring {data.restoreTarget.campaignDefinition.name}{" "}
                revision {data.restoreTarget.campaignDefinition.revisionNumber}
                {" "}with {data.restoreTarget.worldDefinition.name} revision{" "}
                {data.restoreTarget.worldDefinition.revisionNumber}.
              </p>
              <RouterButtonLink
                className="mt-4"
                href={`/campaigns/instances/${encodeURIComponent(instance.id)}/versions/migrate?restoreSnapshot=${encodeURIComponent(data.restoreTarget.snapshotId)}${suffix ? `&${suffix.slice(1)}` : ""}`}
                tone="outline"
              >
                Review restore
              </RouterButtonLink>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export function CampaignInstanceMigrationPage() {
  const { instance } = useCampaignInstance();
  const [versions, setVersions] = useState<CampaignInstanceVersions>();
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<CampaignInstanceMigrationPreview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [mappings, setMappings] = useState<
    CampaignInstanceMigrationMappingRequest[]
  >([]);
  const [mappingDirty, setMappingDirty] = useState(false);
  const router = useRouter();
  const restoreSnapshotId = new URLSearchParams(
    useLocation().searchStr,
  ).get("restoreSnapshot");
  const restoring = Boolean(restoreSnapshotId);
  useEffect(() => {
    void getCampaignInstanceVersions(instance.id).then(setVersions, () =>
      setError("Migration choices could not be loaded."),
    );
  }, [instance.id]);
  async function previewMigration(
    requestedMappings: readonly CampaignInstanceMigrationMappingRequest[] = mappings,
  ) {
    const sourceSnapshotId = versions?.items.find(({ current }) => current)?.snapshotId;
    if (!instance.runtime || !sourceSnapshotId) return;
    if (!restoring && !targetId) return;
    if (restoring && !restoreSnapshotId) return;
    setBusy(true);
    setError("");
    try {
      const pages: CampaignInstanceMigrationPreview[] = [];
      let changeOffset = 0;
      let conflictOffset = 0;
      let candidateOffset = 0;
      let hasMore = true;
      let candidateTotal = 0;
      while (hasMore) {
        const paging = {
          changeOffset,
          changeLimit: 50,
          conflictOffset,
          conflictLimit: 50,
          candidateOffset,
          candidateLimit: 50,
        };
        const nextPreview = await (restoring
          ? previewCampaignInstanceRestore(instance.id, {
              sourceSnapshotId,
              targetInstanceSnapshotId:
                restoreSnapshotId as CampaignInstanceSnapshotId,
              expectedRuntimeRevision: instance.runtime.revision,
              mappings: requestedMappings,
              ...paging,
            })
          : previewCampaignInstanceMigration(instance.id, {
              sourceSnapshotId,
              targetCampaignDefinitionSnapshotId:
                targetId as CampaignDefinitionSnapshotId,
              expectedRuntimeRevision: instance.runtime.revision,
              mappings: requestedMappings,
              ...paging,
            }));
        if (pages[0] && pages[0].planHash !== nextPreview.planHash) {
          throw new Error("Migration plan changed while its pages were loading.");
        }
        pages.push(nextPreview);
        candidateTotal = nextPreview.totalMappingCandidates;
        hasMore =
          nextPreview.nextChangeOffset !== undefined ||
          nextPreview.nextConflictOffset !== undefined;
        changeOffset =
          nextPreview.nextChangeOffset ?? nextPreview.totalChanges;
        conflictOffset =
          nextPreview.nextConflictOffset ?? nextPreview.totalConflicts;
        // Candidate choices are intentionally loaded one bounded page at a
        // time. Later change/conflict page requests suppress duplicate
        // candidate content until the GM asks for more.
        candidateOffset = candidateTotal;
      }
      const complete = mergeMigrationPreviewPages(pages);
      if (
        !complete ||
        complete.nextChangeOffset !== undefined ||
        complete.nextConflictOffset !== undefined ||
        complete.changes.length !== complete.totalChanges ||
        complete.conflicts.length !== complete.totalConflicts
      ) {
        throw new Error("Migration preview pages were incomplete.");
      }
      setPreview(complete);
      setMappings([...requestedMappings]);
      setMappingDirty(false);
      setReviewed(false);
    } catch {
      setError(
        "The complete migration preview could not be prepared. No Instance data changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadMoreCandidates() {
    const sourceSnapshotId = versions?.items.find(({ current }) => current)?.snapshotId;
    if (!preview || !instance.runtime || !sourceSnapshotId) return;
    setBusy(true);
    setError("");
    try {
      const paging = {
        changeOffset: preview.totalChanges,
        changeLimit: 50,
        conflictOffset: preview.totalConflicts,
        conflictLimit: 50,
        candidateOffset: preview.mappingCandidates.length,
        candidateLimit: 50,
      };
      const next = await (restoring && restoreSnapshotId
        ? previewCampaignInstanceRestore(instance.id, {
            sourceSnapshotId,
            targetInstanceSnapshotId:
              restoreSnapshotId as CampaignInstanceSnapshotId,
            expectedRuntimeRevision: instance.runtime.revision,
            mappings,
            ...paging,
          })
        : previewCampaignInstanceMigration(instance.id, {
            sourceSnapshotId,
            targetCampaignDefinitionSnapshotId:
              targetId as CampaignDefinitionSnapshotId,
            expectedRuntimeRevision: instance.runtime.revision,
            mappings,
            ...paging,
          }));
      if (next.planHash !== preview.planHash) {
        throw new Error("Migration plan changed while candidates were loading.");
      }
      const accumulated = mergeMigrationPreviewPages([preview, next]);
      if (!accumulated) throw new Error("Candidate page could not be merged.");
      setPreview(accumulated);
      setReviewed(false);
    } catch {
      setError(
        "More compatible successors could not be loaded. The current choices remain available.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    const sourceSnapshotId = versions?.items.find(({ current }) => current)?.snapshotId;
    if (!preview || !reviewed || !instance.runtime || !sourceSnapshotId) return;
    setBusy(true);
    try {
      if (restoring && restoreSnapshotId) {
        await applyCampaignInstanceRestore(instance.id, {
          sourceSnapshotId,
          targetInstanceSnapshotId:
            restoreSnapshotId as CampaignInstanceSnapshotId,
          expectedRuntimeRevision: instance.runtime.revision,
          planHash: preview.planHash,
          mappings,
        });
      } else {
        await applyCampaignInstanceMigration(instance.id, {
          sourceSnapshotId,
          targetCampaignDefinitionSnapshotId:
            targetId as CampaignDefinitionSnapshotId,
          expectedRuntimeRevision: instance.runtime.revision,
          planHash: preview.planHash,
          mappings,
        });
      }
      await router.navigate({
        to: `/campaigns/instances/${instance.id}/versions`,
      });
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 409
          ? "This preview is stale or a Session became active. Review a fresh complete preview before trying again."
          : "Migration was not applied. The current Instance snapshot remains unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={pageClass}>
      <PageIntro
        eyebrow="Campaign Instance · Migration"
        title={restoring ? "Review complete restore" : "Review complete revision adoption"}
      >
        <p>
          {restoring
            ? "Restore adopts the complete captured pair from the direct predecessor as a new Instance snapshot."
            : "Migration adopts one complete direct-successor Campaign revision and its required World snapshot. Changes cannot be selected individually."}
        </p>
      </PageIntro>
      <AsyncErrorSummary error={error} />
      {versions?.migrationBlockedReason ? (
        <Alert tone="warning" className="mt-8">
          {versions.migrationBlockedReason}
        </Alert>
      ) : restoring ? (
        <section className="mt-8 rounded-box border border-base-300 bg-base-200 p-5">
          <p className="text-sm">
            The selected direct predecessor will be restored only after a full preview.
          </p>
          <Button className="mt-4" tone="primary" loading={busy} onClick={() => void previewMigration()}>
            Preview complete restore
          </Button>
        </section>
      ) : (
        <section className="mt-8 rounded-box border border-base-300 bg-base-200 p-5">
          <Label>
            Compatible direct successor
            <Select
              className="mt-2 w-full"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.currentTarget.value);
                setPreview(undefined);
                setMappings([]);
                setMappingDirty(false);
              }}
            >
              <option value="">Choose a Campaign revision</option>
              {versions?.migrationTargets.map((target) => (
                  <option key={target.campaignDefinitionSnapshotId} value={target.campaignDefinitionSnapshotId}>
                    {target.campaignDefinition.name} revision{" "}
                    {target.campaignDefinition.revisionNumber} · {target.worldDefinition.name}{" "}
                    revision {target.worldDefinition.revisionNumber}
                  </option>
                ))}
            </Select>
          </Label>
          <Button
            className="mt-4"
            tone="primary"
            loading={busy}
            disabled={!targetId}
            onClick={() => void previewMigration()}
          >
            Preview complete migration
          </Button>
        </section>
      )}
      {preview && (
        <div className="mt-8 space-y-6">
          <section className="rounded-box border border-base-300 bg-base-200 p-5">
            <h2 className="text-xl font-semibold">Compatible pair</h2>
            <p className="mt-3 text-sm">
              From {preview.source.campaignDefinition.name} revision{" "}
              {preview.source.campaignDefinition.revisionNumber} /{" "}
              {preview.source.worldDefinition.name} revision{" "}
              {preview.source.worldDefinition.revisionNumber}
            </p>
            <p className="mt-1 text-sm">
              To {preview.target.campaignDefinition.name} revision{" "}
              {preview.target.campaignDefinition.revisionNumber} /{" "}
              {preview.target.worldDefinition.name} revision{" "}
              {preview.target.worldDefinition.revisionNumber}
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Complete change review</h2>
            <p className="mt-2 text-sm text-base-content/60">
              {preview.changes.length} of {preview.totalChanges} changes loaded.
            </p>
            <ul className="mt-4 space-y-2">
              {preview.changes.map((change, index) => (
                <li
                  key={`${change.typeLabel}-${change.subjectName}-${index}`}
                  className="rounded-box border border-base-300 bg-base-200 p-4"
                >
                  <p className="font-medium">{change.subjectName}</p>
                  <p className="mt-1 text-sm">
                    {change.typeLabel} ·{" "}
                    {statusLabel(change.change)}
                  </p>
                  {change.context && (
                    <p className="mt-1 text-sm text-base-content/55">
                      {change.context}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {preview.conflicts.length > 0 && (
            <Alert tone="warning">
              <div>
                <p className="font-semibold">
                  Migration has blocking conflicts
                </p>
                <ul className="mt-3 space-y-4">
                  {preview.conflicts.map((conflict) => {
                    const candidates = preview.mappingCandidates.filter(
                      ({ conflictKey }) => conflictKey === conflict.key,
                    );
                    const selected = conflict.sourceId
                      ? mappings.find(
                          (mapping) =>
                            mapping.resourceType === conflict.resourceType &&
                            mapping.sourceId === conflict.sourceId,
                        )
                      : undefined;
                    return (
                      <li key={conflict.key} className="rounded-box bg-base-100 p-4">
                        <p className="font-medium">{conflict.subjectName}</p>
                        <p className="mt-1 text-sm">{conflict.detail}</p>
                        {conflict.mappingRequired && conflict.sourceId && (
                          <Label className="mt-3 block">
                            Compatible successor for {conflict.subjectName}
                            <Select
                              className="mt-2 w-full"
                              value={selected?.targetId ?? ""}
                              onChange={(event) => {
                                const candidate = candidates.find(
                                  ({ targetId }) =>
                                    targetId === event.currentTarget.value,
                                );
                                setMappings((current) => [
                                  ...current.filter(
                                    (mapping) =>
                                      !(
                                        mapping.resourceType ===
                                          conflict.resourceType &&
                                        mapping.sourceId === conflict.sourceId
                                      ),
                                  ),
                                  ...(candidate
                                    ? [
                                        {
                                          resourceType: candidate.resourceType,
                                          sourceId: candidate.sourceId,
                                          targetId: candidate.targetId,
                                        },
                                      ]
                                    : []),
                                ]);
                                setMappingDirty(true);
                                setReviewed(false);
                              }}
                            >
                              <option value="">Choose a compatible successor</option>
                              {candidates.map((candidate) => (
                                <option
                                  key={`${candidate.conflictKey}:${candidate.targetId}`}
                                  value={candidate.targetId}
                                  disabled={mappings.some(
                                    (mapping) =>
                                      mapping.targetId === candidate.targetId &&
                                      !(
                                        mapping.resourceType ===
                                          candidate.resourceType &&
                                        mapping.sourceId === candidate.sourceId
                                      ),
                                  )}
                                >
                                  {candidate.targetName} · {candidate.targetTypeLabel}
                                  {candidate.context ? ` · ${candidate.context}` : ""}
                                </option>
                              ))}
                            </Select>
                          </Label>
                        )}
                        {conflict.mappingRequired && !candidates.length && (
                          <p className="mt-2 text-sm">
                            {preview.mappingCandidates.length <
                            preview.totalMappingCandidates
                              ? "No compatible successor for this conflict is loaded yet. Load more choices below."
                              : "No compatible successor is available in the target revision."}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {mappingDirty && (
                  <Button
                    className="mt-4"
                    tone="outline"
                    loading={busy}
                    onClick={() => void previewMigration(mappings)}
                  >
                    Re-preview selected mappings
                  </Button>
                )}
              </div>
            </Alert>
          )}
          {preview.totalMappingCandidates > 0 && (
            <section
              className="rounded-box border border-base-300 bg-base-200 p-5"
              aria-labelledby="migration-candidate-heading"
            >
              <h2 id="migration-candidate-heading" className="text-xl font-semibold">
                Compatible successors
              </h2>
              <p
                id="migration-candidate-count"
                className="mt-2 text-sm text-base-content/60"
                aria-live="polite"
              >
                {preview.mappingCandidates.length} of{" "}
                {preview.totalMappingCandidates} compatible successors loaded.
              </p>
              {preview.mappingCandidates.length <
                preview.totalMappingCandidates && (
                <Button
                  className="mt-4"
                  tone="outline"
                  loading={busy}
                  aria-describedby="migration-candidate-count"
                  onClick={() => void loadMoreCandidates()}
                >
                  Load more compatible successors
                </Button>
              )}
            </section>
          )}
          <Checkbox
            label={`I reviewed the complete all-or-nothing ${restoring ? "restore" : "migration"} plan`}
            checked={reviewed}
            disabled={!migrationPreviewIsComplete(preview)}
            help={
              migrationPreviewIsComplete(preview)
                ? undefined
                : "Load the remaining compatible successors before acknowledging the complete plan."
            }
            onChange={(event) => setReviewed(event.currentTarget.checked)}
          />
          <Button
            tone="primary"
            loading={busy}
            disabled={
              !preview.ready ||
              !reviewed ||
              mappingDirty ||
              !migrationPreviewIsComplete(preview)
            }
            onClick={() => void apply()}
          >
            Apply complete {restoring ? "restore" : "migration"}
          </Button>
        </div>
      )}
    </main>
  );
}
