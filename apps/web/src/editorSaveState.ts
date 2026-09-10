/** Save completion must be visible to navigation before React's next render. */
export function createEditorSaveState(initialSnapshot: string) {
  let savedSnapshot = initialSnapshot;
  let pending = false;
  return {
    hasChanges: (snapshot: string) => snapshot !== savedSnapshot,
    markSaved(snapshot: string) {
      savedSnapshot = snapshot;
    },
    async run(operation: () => Promise<void>) {
      if (pending) return;
      pending = true;
      try {
        await operation();
      } finally {
        pending = false;
      }
    },
  };
}
