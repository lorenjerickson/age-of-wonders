import { ShellTools } from "./AppShellTools";
import { NavigationLiveData } from "./navigationLiveData";
import { ContextualBreadcrumbs } from "./ContextualNavigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker, useLocation, useRouter } from "@tanstack/react-router";
import {
  Disclosure,
  Input,
  Fieldset,
  Alert,
  Badge,
  Button,
  StatusIndicator,
} from "@aow/ui";
import {
  ApiRequestError,
  restoreCampaignDefinition,
  saveCampaignDefinitionDraft,
  startCampaignDefinitionDraft,
  type CampaignDefinitionDetail,
  type CampaignDefinitionDraft,
} from "./api";
import {
  campaignDefinitionNavigationForPath,
  campaignPlotTree,
  type CampaignPlotNode,
  campaignDraftWithoutRecord,
  campaignDraftWithRecord,
  type CampaignDraftRecord,
} from "./campaignAuthoringModel";
import { InternalLink, RouterButtonLink } from "./navigation";
import { quickStartSuffix } from "./quickStartModel";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "stale" | "error";

interface CampaignAuthoringContextValue {
  definition: CampaignDefinitionDetail;
  draft?: CampaignDefinitionDraft;
  saveState: SaveState;
  getSaveState(): SaveState;
  message: string;
  canEdit: boolean;
  saveDraft(next: CampaignDefinitionDraft): Promise<boolean>;
  saveRecord(record: CampaignDraftRecord): Promise<boolean>;
  removeRecord(resourceType: string, sourceId: string): Promise<boolean>;
  markDirty(): void;
  discardLocalChanges(): void;
  adoptDraft(draft: CampaignDefinitionDraft): void;
}

const CampaignAuthoringContext =
  createContext<CampaignAuthoringContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useCampaignDefinitionAuthoring() {
  const value = useContext(CampaignAuthoringContext);
  if (!value)
    throw new Error("Campaign authoring requires its workspace shell");
  return value;
}

export function CampaignDefinitionAuthoringProvider({
  definition,
  initialDraft,
  children,
}: {
  definition: CampaignDefinitionDetail;
  initialDraft?: CampaignDefinitionDraft;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const setNavigationCampaign = useContext(NavigationLiveData)?.setCampaign;
  useEffect(() => {
    setNavigationCampaign?.({
      campaignId: definition.id,
      records: draft?.records ?? [],
      locations: draft?.capturedWorldContent?.locations,
    });
    return () => setNavigationCampaign?.(undefined);
  }, [definition.id, draft, setNavigationCampaign]);
  const [saveState, updateSaveState] = useState<SaveState>("idle");
  const saveStateRef = useRef<SaveState>("idle");
  function setSaveState(next: SaveState | ((current: SaveState) => SaveState)) {
    const value =
      typeof next === "function" ? next(saveStateRef.current) : next;
    saveStateRef.current = value;
    updateSaveState(value);
  }
  const [message, setMessage] = useState("");
  const canEdit =
    definition.status.toLowerCase() !== "archived" && draft?.status !== "stale";

  async function saveDraft(next: CampaignDefinitionDraft) {
    if (saveStateRef.current === "saving") return false;
    if (!draft || draft.status === "stale" || !canEdit) return false;
    setSaveState("saving");
    setMessage("");
    try {
      const saved = await saveCampaignDefinitionDraft(definition.id, next);
      setDraft(saved);
      setSaveState("saved");
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setDraft((current) => current && { ...current, status: "stale" });
        setSaveState("stale");
        setMessage(
          "This draft changed elsewhere or its published base advanced. Reload before continuing.",
        );
      } else {
        setSaveState("error");
        setMessage(
          "The Campaign draft was not saved. Your changes remain on this page.",
        );
      }
      return false;
    }
  }

  async function saveRecord(record: CampaignDraftRecord) {
    if (!draft) return false;
    const records = campaignDraftWithRecord(draft.records, record);
    const memberIds = (resourceType: string) =>
      records
        .filter((candidate) => candidate.resourceType === resourceType)
        .map(({ sourceId }) => sourceId);
    return saveDraft({
      ...draft,
      records,
      content: {
        ...draft.content,
        plotDefinitionIds: memberIds("plots"),
        placementDefinitionIds: memberIds("campaign-placements"),
      },
    });
  }

  async function removeRecord(resourceType: string, sourceId: string) {
    if (!draft) return false;
    const records = campaignDraftWithoutRecord(
      draft.records,
      resourceType,
      sourceId,
    );
    const memberIds = (type: string) =>
      records
        .filter((candidate) => candidate.resourceType === type)
        .map((candidate) => candidate.sourceId);
    return saveDraft({
      ...draft,
      records,
      content: {
        ...draft.content,
        plotDefinitionIds: memberIds("plots"),
        placementDefinitionIds: memberIds("campaign-placements"),
      },
    });
  }

  return (
    <CampaignAuthoringContext.Provider
      value={{
        definition,
        draft,
        saveState,
        getSaveState: () => saveStateRef.current,
        message,
        canEdit,
        saveDraft,
        saveRecord,
        removeRecord,
        markDirty: () => {
          if (canEdit && saveState !== "saving" && saveState !== "stale")
            setSaveState("dirty");
        },
        discardLocalChanges: () => {
          setSaveState((current) =>
            current === "dirty" || current === "error" ? "saved" : current,
          );
          setMessage("");
        },
        adoptDraft: (next) => {
          setDraft(next);
          setSaveState("saved");
          setMessage("");
        },
      }}
    >
      {children}
    </CampaignAuthoringContext.Provider>
  );
}

export function CampaignDefinitionUnsavedNavigationGuard() {
  const { saveState, getSaveState, discardLocalChanges } =
    useCampaignDefinitionAuthoring();
  const unsaved = saveState === "dirty" || saveState === "error";
  useBlocker({
    shouldBlockFn: () => {
      const current = getSaveState();
      if (current === "saving") return true;
      if (current !== "dirty" && current !== "error") return false;
      if (!window.confirm("Leave without saving your Campaign draft changes?"))
        return true;
      discardLocalChanges();
      return false;
    },
    enableBeforeUnload: unsaved,
  });
  return null;
}

export function CampaignDefinitionContextBar() {
  const { definition, draft, saveState, message, canEdit, adoptDraft } =
    useCampaignDefinitionAuthoring();
  const router = useRouter();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const name = definition.name.trim() || "Unnamed Campaign Definition";

  async function startEditing() {
    if (!definition.currentRevisionId) return;
    setBusy(true);
    setActionError("");
    try {
      adoptDraft(
        await startCampaignDefinitionDraft(
          definition.id,
          definition.currentRevisionId,
        ),
      );
      await router.invalidate();
    } catch {
      setActionError(
        "A working draft could not be started. Reload and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (definition.metadataRevision === undefined) return;
    setBusy(true);
    setActionError("");
    try {
      await restoreCampaignDefinition(
        definition.id,
        definition.metadataRevision,
      );
      await router.invalidate();
    } catch {
      setActionError(
        "The Campaign Definition could not be restored. Reload and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const currentRevision = definition.revisions?.find(
    ({ id }) => id === definition.currentRevisionId,
  );
  const world = draft?.capturedWorld ?? currentRevision?.capturedWorld;
  const worldName = world?.worldName ?? world?.name;
  return (
    <>
      <ShellTools>
        <header
          data-campaign-context
          className="flex flex-col items-start gap-3 p-4"
        >
          <div className="min-w-0 basis-full sm:flex-1">
            <p className="truncate font-semibold" title={name}>
              {name}
            </p>
            <p className="text-xs text-base-content/60">
              {draft
                ? `${draft.baseRevisionId ? "Working draft" : "Initial draft"} · ${worldName || "Unavailable captured World"} revision ${world?.revisionNumber ?? "unavailable"}`
                : currentRevision
                  ? `Published Campaign revision ${currentRevision.revisionNumber} · read only`
                  : "Unpublished · read only"}
            </p>
          </div>
          {draft?.status === "stale" && (
            <Badge tone="warning">Needs rebase</Badge>
          )}
          <StatusIndicator
            tone={
              saveState === "error" || saveState === "stale"
                ? "error"
                : saveState === "saving"
                  ? "warning"
                  : saveState === "saved"
                    ? "success"
                    : "neutral"
            }
            pulse={saveState === "saving"}
            label={
              saveState === "saving"
                ? "Saving draft"
                : saveState === "saved"
                  ? "Draft saved"
                  : saveState === "dirty"
                    ? "Unsaved changes"
                    : saveState === "stale"
                      ? "Draft needs review"
                      : saveState === "error"
                        ? "Draft not saved"
                        : draft
                          ? "Working draft"
                          : "Read only"
            }
          />
          {definition.status.toLowerCase() === "archived" && (
            <Badge tone="warning">Archived · read only</Badge>
          )}
          {definition.status.toLowerCase() === "archived" && (
            <Button size="sm" loading={busy} onClick={() => void restore()}>
              Restore Definition
            </Button>
          )}
          {!draft && canEdit && definition.currentRevisionId && (
            <Button
              size="sm"
              loading={busy}
              onClick={() => void startEditing()}
            >
              Start editing
            </Button>
          )}
          {draft && canEdit && (
            <RouterButtonLink
              href={`/campaigns/definitions/${encodeURIComponent(definition.id)}/versions/draft/review${guideSuffix}`}
              tone="primary"
              size="sm"
            >
              Review &amp; publish
            </RouterButtonLink>
          )}
        </header>
      </ShellTools>
      <ContextualBreadcrumbs
        data={{
          campaignName: definition.name,
          records: draft?.records,
          locations: draft?.capturedWorldContent?.locations,
        }}
      />
      {(message || actionError) && (
        <Alert tone="error" className="m-4" aria-live="polite">
          <div>
            <p>{message || actionError}</p>
            {saveState === "stale" && (
              <Button
                tone="outline"
                size="sm"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Reload latest draft
              </Button>
            )}
          </div>
        </Alert>
      )}
    </>
  );
}

export function CampaignDefinitionSecondaryNavigation({
  campaignDefinitionId,
  campaignName,
  gmScope,
}: {
  campaignDefinitionId: string;
  campaignName: string;
  gmScope: string;
}) {
  const location = useLocation();
  const authoring = useContext(CampaignAuthoringContext);
  const suffix = quickStartSuffix(location.searchStr);
  const base = `/campaigns/definitions/${encodeURIComponent(campaignDefinitionId)}`;
  const [query, setQuery] = useState("");
  const tree = campaignPlotTree(authoring?.draft?.records ?? []);
  const groups = campaignDefinitionNavigationForPath(
    campaignDefinitionId,
    location.pathname,
  );
  function outline(nodes: readonly CampaignPlotNode[], depth = 0): ReactNode {
    return nodes.map((node) => (
      <li key={node.id}>
        {(!query || node.name.toLowerCase().includes(query.toLowerCase())) && (
          <InternalLink
            className={`flex min-h-11 items-center rounded-box border border-base-300 px-3 py-2 text-sm ${location.pathname.includes(`/plots/${encodeURIComponent(node.id)}`) ? "bg-primary/10 text-primary" : "hover:bg-base-200"}`}
            href={`${base}/plots/${encodeURIComponent(node.id)}${suffix}`}
          >
            {depth > 0 && (
              <span className="mr-2 text-base-content/40" aria-hidden="true">
                ↳
              </span>
            )}
            {node.name}
          </InternalLink>
        )}
        {node.children.length > 0 && (
          <ul className="mt-2 space-y-2">
            {outline(node.children, depth + 1)}
          </ul>
        )}
      </li>
    ));
  }
  return (
    <aside
      data-campaign-navigation
      className="hidden border-r border-base-300 bg-base-100 p-4 lg:block"
      data-gm-scope={gmScope}
    >
      <p
        className="mb-4 truncate text-sm font-semibold uppercase"
        title={campaignName}
      >
        {campaignName}
      </p>
      <nav aria-label={`${campaignName} authoring`} className="space-y-2">
        {[
          ["Plots", "/plots"],
          ["Story library", "/placements"],
          ["Campaign settings", ""],
        ].map(([label, path]) => (
          <InternalLink
            key={label}
            className={`flex min-h-11 items-center rounded-box border border-base-300 px-3 text-sm ${location.pathname === `${base}${path}` ? "bg-primary/10 text-primary" : "hover:bg-base-200"}`}
            href={`${base}${path}${suffix}`}
            aria-current={
              location.pathname === `${base}${path}` ? "page" : undefined
            }
          >
            {label}
          </InternalLink>
        ))}
      </nav>
      <h2 className="mt-6 text-xs font-semibold uppercase">Plot outline</h2>
      <Input
        className="input mt-3 min-h-11 w-full"
        type="search"
        aria-label="Search plots"
        placeholder="Search plots…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <nav aria-label="Plot outline">
        <ul className="mt-3 space-y-2">{outline(tree)}</ul>
      </nav>
      <InternalLink
        className="btn btn-outline mt-3 min-h-11 w-full"
        href={`${base}/plots/new${suffix}`}
      >
        + Add plot
      </InternalLink>
      <Disclosure
        className="mt-5 border-t border-base-300 pt-3"
        summary="Campaign tools"
      >
        <nav aria-label="Additional campaign tools">
          <ul className="space-y-2">
            {groups
              .flatMap((group) => group.children)
              .map((child) => (
                <li key={child.href}>
                  <InternalLink
                    className="flex min-h-11 items-center px-3 text-sm"
                    href={`${child.href}${suffix}`}
                  >
                    {child.label}
                  </InternalLink>
                </li>
              ))}
          </ul>
        </nav>
      </Disclosure>
      <InternalLink
        className="link mt-4 inline-flex min-h-11 items-center text-sm"
        href={`/campaigns${suffix}`}
      >
        Back to Campaigns
      </InternalLink>
    </aside>
  );
}

export function CampaignDraftRequired({ children }: { children: ReactNode }) {
  const { definition, draft, canEdit, saveState } =
    useCampaignDefinitionAuthoring();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  if (draft && canEdit)
    return (
      <Fieldset className="min-w-0" disabled={saveState === "saving"}>
        {children}
      </Fieldset>
    );
  if (draft?.status === "stale") {
    return (
      <Alert tone="warning" className="mt-8">
        <div>
          <p>
            This draft changed elsewhere or its published base advanced. Its
            authoring controls are read only until you reload the latest draft.
          </p>
          <Button
            tone="outline"
            size="sm"
            className="mt-3"
            onClick={() => window.location.reload()}
          >
            Reload latest draft
          </Button>
        </div>
      </Alert>
    );
  }
  if (definition.status.toLowerCase() === "archived") {
    return (
      <Alert tone="warning" className="mt-8">
        This Campaign Definition is archived. Restore it to resume authoring.
      </Alert>
    );
  }
  return (
    <Alert tone="warning" className="mt-8">
      <div>
        <p>
          This published Campaign Definition is read only until you start a
          working draft.
        </p>
        <RouterButtonLink
          href={`/campaigns/definitions/${encodeURIComponent(definition.id)}/versions${guideSuffix}`}
          tone="outline"
          size="sm"
          className="mt-3"
        >
          Open Versions
        </RouterButtonLink>
      </div>
    </Alert>
  );
}
