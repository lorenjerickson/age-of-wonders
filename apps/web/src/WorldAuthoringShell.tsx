import { createContext, useContext, useState, type ReactNode } from "react";
import { Alert, Badge, Button, StatusIndicator } from "@aow/ui";
import {
  ApiRequestError,
  getEffectiveWorldModels,
  restoreWorldDefinition,
  saveWorldDefinitionDraft,
  startWorldDefinitionDraft,
  type WorldDefinitionDetail,
  type WorldDefinitionDraft,
  type WorldDraftRecord,
} from "./api";
import { RouterButtonLink } from "./navigation";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
  draftContextLabel,
  draftWithoutWorldPlacement,
  draftWithIndexedRecord,
  mergeSavedDraft,
  projectEffectiveModels,
  worldDraftStartLabel,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "stale" | "error";

interface WorldAuthoringContextValue {
  definition: WorldDefinitionDetail;
  draft?: WorldDefinitionDraft;
  saveState: SaveState;
  message: string;
  canEdit: boolean;
  saveDraft(next: WorldDefinitionDraft): Promise<boolean>;
  saveRecord(record: WorldDraftRecord): Promise<boolean>;
  removeWorldPlacement(sourceId: string): Promise<boolean>;
  adoptDraft(next: WorldDefinitionDraft): void;
  refreshEffectiveModels(): Promise<void>;
  markDirty(): void;
}

const WorldAuthoringContext = createContext<WorldAuthoringContextValue | null>(
  null,
);

// eslint-disable-next-line react-refresh/only-export-components
export function useWorldAuthoring() {
  const value = useContext(WorldAuthoringContext);
  if (!value)
    throw new Error("World authoring components require WorldAuthoringShell");
  return value;
}

export function WorldAuthoringProvider({
  definition,
  initialDraft,
  children,
}: {
  definition: WorldDefinitionDetail;
  initialDraft?: WorldDefinitionDraft;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const canEdit =
    definition.status.toLocaleLowerCase() !== "archived" &&
    draft?.status !== "stale";

  async function saveDraft(next: WorldDefinitionDraft) {
    if (!draft || draft.status === "stale" || !canEdit) return false;
    setSaveState("saving");
    setMessage("");
    try {
      const saved = await saveWorldDefinitionDraft(definition.id, {
        storageRevision: draft.storageRevision,
        revisionName: next.revisionName,
        content: next.content,
        records: next.records,
      });
      setDraft(mergeSavedDraft(saved, draft));
      setSaveState("saved");
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setDraft((current) => current && { ...current, status: "stale" });
        setSaveState("stale");
        setMessage(
          "This draft changed elsewhere or its published base advanced. Review Versions before saving again.",
        );
      } else {
        setSaveState("error");
        setMessage(
          "Changes could not be saved. Your draft remains on this page so you can try again.",
        );
      }
      return false;
    }
  }

  async function saveRecord(record: WorldDraftRecord) {
    if (!draft) return false;
    return saveDraft(draftWithIndexedRecord(draft, record));
  }

  async function removeWorldPlacement(sourceId: string) {
    if (!draft) return false;
    return saveDraft(draftWithoutWorldPlacement(draft, sourceId));
  }

  function adoptDraft(next: WorldDefinitionDraft) {
    setDraft(next);
    setSaveState("saved");
    setMessage("");
  }

  function markDirty() {
    if (canEdit && saveState !== "saving" && saveState !== "stale")
      setSaveState("dirty");
  }

  async function refreshEffectiveModels() {
    const effective = await getEffectiveWorldModels(definition.id);
    setDraft(
      (current) =>
        current && {
          ...current,
          effectiveModels: projectEffectiveModels(effective),
        },
    );
  }

  return (
    <WorldAuthoringContext.Provider
      value={{
        definition,
        draft,
        saveState,
        message,
        canEdit,
        saveDraft,
        saveRecord,
        removeWorldPlacement,
        adoptDraft,
        refreshEffectiveModels,
        markDirty,
      }}
    >
      {children}
    </WorldAuthoringContext.Provider>
  );
}

export function WorldContextBar() {
  const {
    definition,
    draft,
    saveState,
    message,
    canEdit,
    adoptDraft,
    refreshEffectiveModels,
  } = useWorldAuthoring();
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const currentRevision = definition.currentRevisionId
    ? definition.revisions.find(
        (revision) => revision.id === definition.currentRevisionId,
      )
    : undefined;
  async function restore() {
    if (definition.metadataRevision === undefined) return;
    setRestoring(true);
    setRestoreError("");
    try {
      await restoreWorldDefinition(definition.id, definition.metadataRevision);
      await router.invalidate();
    } catch {
      setRestoreError(
        "The World lifecycle changed before it could be restored. Reload and try again.",
      );
      setRestoring(false);
    }
  }
  async function startEditing() {
    if (!currentRevision) return;
    setStarting(true);
    setStartError("");
    try {
      const started = await startWorldDefinitionDraft(
        definition.id,
        currentRevision.id,
      );
      adoptDraft(started);
      await refreshEffectiveModels();
      await router.invalidate();
    } catch {
      setStartError(
        "A working draft could not be started from the current published revision. Reload and try again.",
      );
      setStarting(false);
    }
  }
  return (
    <>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100/95 px-6 py-3 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {definition.name.trim() || "Unnamed World Definition"}
          </p>
          <p className="text-xs text-base-content/50">
            {draft ? draftContextLabel(draft) : "Published content · read only"}
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
        {definition.status.toLocaleLowerCase() === "archived" && (
          <Badge tone="warning">Archived · read only</Badge>
        )}
        {definition.status.toLocaleLowerCase() === "archived" && (
          <Button
            tone="primary"
            size="sm"
            loading={restoring}
            disabled={definition.metadataRevision === undefined}
            onClick={() => void restore()}
          >
            Restore World
          </Button>
        )}
        {!draft && canEdit && currentRevision && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-base-content/60">
              {worldDraftStartLabel(currentRevision)}
            </span>
            <Button
              tone="primary"
              size="sm"
              loading={starting}
              onClick={() => void startEditing()}
            >
              Start editing
            </Button>
          </div>
        )}
        {draft && canEdit && (
          <RouterButtonLink
            href={`/worlds/${encodeURIComponent(definition.id)}/versions/draft/review${guideSuffix}`}
            tone="primary"
            size="sm"
          >
            Review &amp; publish
          </RouterButtonLink>
        )}
      </header>
      {message && (
        <Alert tone="error" className="m-4" aria-live="polite">
          <div>
            <p>{message}</p>
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
      {restoreError && (
        <Alert tone="error" className="m-4" aria-live="polite">
          {restoreError}
        </Alert>
      )}
      {startError && (
        <Alert tone="error" className="m-4" aria-live="polite">
          {startError}
        </Alert>
      )}
    </>
  );
}

export function DraftRequired({ children }: { children: ReactNode }) {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const guideSuffix = worldWorkspaceSuffix(useLocation().searchStr);
  if (draft && canEdit) return children;
  if (draft?.status === "stale") {
    return (
      <Alert tone="warning" className="mt-8">
        <div>
          <p>
            This World draft changed elsewhere or its published base advanced.
            Authoring is read only until you reload the latest draft.
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
  if (definition.status.toLocaleLowerCase() === "archived") {
    return (
      <Alert tone="warning" className="mt-8">
        This World is archived and read only. Restore it from the World header
        before editing.
      </Alert>
    );
  }
  return (
    <Alert tone="warning" className="mt-8">
      <div>
        <p>
          This World has no working draft, so published content is read only.
        </p>
        <RouterButtonLink
          href={`/worlds/${encodeURIComponent(definition.id)}/versions${guideSuffix}`}
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
