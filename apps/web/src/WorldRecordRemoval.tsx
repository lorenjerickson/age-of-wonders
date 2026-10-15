import { useRef, useState } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button } from "@aow/ui";
import {
  ApiRequestError,
  deleteWorldAuthoredRecord,
  type WorldDraftRecord,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { useInternalNavigate } from "./navigation";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";

/** The API owns root/reference and exact-kind removal policy. */
export function WorldRecordRemoval({
  record,
  path,
  returnPath,
  disabled = false,
}: {
  record: WorldDraftRecord;
  path: string;
  returnPath: string;
  disabled?: boolean;
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const navigate = useInternalNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: () => busy && !leaving.current,
    enableBeforeUnload: busy,
  });
  if (!canEdit || !draft?.id) return null;
  async function remove() {
    if (!draft?.id || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const saved = await deleteWorldAuthoredRecord(
        definition.id,
        path,
        record.sourceId,
        {
          expectedDraftId: draft.id,
          expectedStorageRevision: draft.storageRevision,
        },
      );
      adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
      leaving.current = true;
      await navigate(`${returnPath}${suffix}`);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.status === 409
          ? "This entry is still in use, is the required World root, or the draft changed elsewhere. Remove its references or reload before trying again."
          : "This entry could not be removed. Your World draft remains unchanged. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-5 space-y-3" aria-label="Remove entry">
      {confirming ? (
        <>
          <p>
            Remove this entry from the working draft? Published revisions stay
            unchanged. Entries still used by this World cannot be removed.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              tone="danger"
              className="min-h-11"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              {busy ? "Removing…" : "Remove from draft"}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
            >
              Keep entry
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          tone="outline"
          className="min-h-11"
          disabled={disabled}
          onClick={() => setConfirming(true)}
        >
          Remove entry
        </Button>
      )}
      {disabled && (
        <p className="text-sm">
          Save or cancel your changes before removing this entry.
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
