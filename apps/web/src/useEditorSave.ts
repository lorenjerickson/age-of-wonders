import { useState } from "react";
import { createEditorSaveState } from "./editorSaveState";

export function useEditorSave(snapshot: string) {
  const [operation] = useState(() => createEditorSaveState(snapshot));
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  return {
    saving,
    dirty: snapshot !== savedSnapshot,
    hasChanges: () => operation.hasChanges(snapshot),
    markSaved(value: string) {
      operation.markSaved(value);
      setSavedSnapshot(value);
    },
    run: (save: () => Promise<void>) => operation.run(async () => {
      setSaving(true);
      try {
        await save();
      } finally {
        setSaving(false);
      }
    }),
  };
}
