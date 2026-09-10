import { ContextualBreadcrumbs } from "./ContextualNavigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useBlocker, useLocation, useRouter } from "@tanstack/react-router";
import { Alert, Badge, Button, StatusIndicator } from "@aow/ui";
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
  campaignDraftWithoutRecord,
  campaignDraftWithRecord,
  type CampaignDraftRecord,
} from "./campaignAuthoringModel";
import { InternalLink, RouterButtonLink } from "./navigation";
import { quickStartStorageKey, quickStartSuffix } from "./quickStartModel";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "stale" | "error";

interface CampaignAuthoringContextValue {
  definition: CampaignDefinitionDetail;
  draft?: CampaignDefinitionDraft;
  saveState: SaveState;
  message: string;
  canEdit: boolean;
  saveDraft(next: CampaignDefinitionDraft): Promise<boolean>;
  saveRecord(record: CampaignDraftRecord): Promise<boolean>;
  removeRecord(resourceType: string, sourceId: string): Promise<boolean>;
  markDirty(): void;
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const canEdit =
    definition.status.toLowerCase() !== "archived" && draft?.status !== "stale";

  async function saveDraft(next: CampaignDefinitionDraft) {
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
        message,
        canEdit,
        saveDraft,
        saveRecord,
        removeRecord,
        markDirty: () => {
          if (canEdit && saveState !== "saving" && saveState !== "stale")
            setSaveState("dirty");
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
  const { saveState } = useCampaignDefinitionAuthoring();
  const unsaved = saveState === "dirty" || saveState === "error";
  useBlocker({
    shouldBlockFn: () =>
      unsaved &&
      !window.confirm("Leave without saving your Campaign draft changes?"),
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

  const currentRevision =
    definition.revisions?.find(
      ({ id }) => id === definition.currentRevisionId,
    );
  const world = draft?.capturedWorld ?? currentRevision?.capturedWorld;
  const worldName = world?.worldName ?? world?.name;
  return (
    <>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100/95 px-6 py-3 pl-16 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
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
          <Button size="sm" loading={busy} onClick={() => void startEditing()}>
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
      <ContextualBreadcrumbs />
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
  const groups = campaignDefinitionNavigationForPath(
    campaignDefinitionId,
    location.pathname,
  );
  const guideSuffix = quickStartSuffix(location.searchStr);
  const activeKey = groups.find(({ active }) => active)?.key;
  const storageKey = `${quickStartStorageKey(gmScope)}.campaign-definition-navigation.${encodeURIComponent(campaignDefinitionId)}`;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(activeKey ? [activeKey] : []),
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      if (Array.isArray(saved))
        setExpanded(new Set(saved.filter((key) => typeof key === "string")));
    } catch {
      /* preference storage is optional */
    }
  }, [storageKey]);
  useEffect(() => {
    if (activeKey) setExpanded((current) => new Set([...current, activeKey]));
  }, [activeKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {
      /* navigation remains usable */
    }
  }, [expanded, storageKey]);

  const base = `/campaigns/definitions/${encodeURIComponent(campaignDefinitionId)}`;
  return (
    <aside className="border-b border-base-300 bg-base-100/70 p-4 lg:min-h-full lg:border-r lg:border-b-0 lg:p-5">
      <div className="mb-5 min-w-0 px-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Campaign Definition
        </p>
        <p className="mt-2 truncate text-lg font-semibold" title={campaignName}>
          {campaignName}
        </p>
        <p className="mt-1 text-xs text-base-content/60">Authoring workspace</p>
      </div>
      <nav aria-label={`${campaignName} overview`} className="mb-3 px-1">
        <ul className="menu gap-1 p-0">
          <li>
            <InternalLink
              href={`${base}${guideSuffix}`}
              aria-current={location.pathname === base ? "page" : undefined}
            >
              Overview
            </InternalLink>
          </li>
        </ul>
      </nav>
      <Button
        tone="outline"
        className="mb-3 min-h-11 w-full justify-between lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="campaign-definition-navigation"
        onClick={() => setMobileOpen((open) => !open)}
      >
        Campaign navigation{" "}
        <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </Button>
      <nav
        id="campaign-definition-navigation"
        aria-label={`${campaignName} authoring`}
        className={mobileOpen ? "block" : "hidden lg:block"}
      >
        <ul className="space-y-1">
          {groups.map((group) => {
            const open = expanded.has(group.key);
            const contentId = `campaign-navigation-${group.key}`;
            return (
              <li key={group.key} className="rounded-box">
                <div
                  className={`flex items-center rounded-lg ${group.active ? "bg-primary/10 text-primary" : "hover:bg-base-200"}`}
                >
                  <InternalLink
                    href={`${group.children[0]?.href ?? base}${guideSuffix}`}
                    className="min-w-0 flex-1 px-3 py-2 text-sm font-semibold"
                  >
                    {group.label}
                  </InternalLink>
                  <Button
                    tone="ghost"
                    size="xs"
                    className="mr-1"
                    aria-expanded={open}
                    aria-controls={contentId}
                    aria-label={`${open ? "Collapse" : "Expand"} ${group.label} navigation`}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true">{open ? "−" : "+"}</span>
                  </Button>
                </div>
                {open && (
                  <ul id={contentId} className="mt-1 space-y-1 px-2 pb-2">
                    {group.children.map((child) => (
                      <li key={child.label}>
                        <InternalLink
                          href={`${child.href}${guideSuffix}`}
                          aria-current={
                            location.pathname === child.href ||
                            location.pathname.startsWith(`${child.href}/`)
                              ? "page"
                              : undefined
                          }
                          className="block rounded-md px-3 py-1.5 text-sm text-base-content/65 hover:bg-base-200 hover:text-base-content"
                        >
                          {child.label}
                        </InternalLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <InternalLink
        className="link mt-5 inline-block px-2 text-sm"
        href={`/campaigns${guideSuffix}`}
      >
        Back to Campaigns
      </InternalLink>
    </aside>
  );
}

export function CampaignDraftRequired({ children }: { children: ReactNode }) {
  const { definition, draft, canEdit } = useCampaignDefinitionAuthoring();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  if (draft && canEdit) return children;
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
