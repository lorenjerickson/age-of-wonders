import { useWorldAuthoring } from "./WorldAuthoringShell";
import {
  MODEL_STRUCTURE_KINDS,
  type ModelStructureKind,
} from "./modelStructureModel";
import { WorldModelReadOnly } from "./WorldModelEditor";

export function WorldModelStructureEditor(_props: { context?: string }) {
  const { draft } = useWorldAuthoring();
  const options = (draft?.effectiveModels?.elements ?? []).filter(({ kind }) =>
    MODEL_STRUCTURE_KINDS.includes(kind as ModelStructureKind),
  );
  return <WorldModelReadOnly title="Schema structure" options={options} />;
}
