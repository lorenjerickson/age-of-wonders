import { createFileRoute } from "@tanstack/react-router";
import { WorldModelFacets } from "../WorldModelFacets";
import { WorldModelEditor } from "../WorldAuthoringPages";
import { WorldModelStructureEditor } from "../WorldModelStructureEditor";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/model/$definitionKind/$definitionId",
)({ component: ModelRoute });
function ModelRoute() {
  return (
    <WorldModelFacets>
      <ModelContent />
    </WorldModelFacets>
  );
}
function ModelContent() {
  const kind = Route.useParams().definitionKind;
  if (kind === "structure") return <WorldModelStructureEditor />;
  return kind === "attributes" ||
    kind === "equipment-slots" ||
    kind === "profession-ranks" ? (
    <WorldModelEditor kind={kind} />
  ) : (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold">Model unavailable</h1>
      <p className="mt-4 text-base-content/60">
        Choose Schema Structure, Attributes, Equipment Slots, or Profession
        Ranks from Model &amp; Taxonomies.
      </p>
    </main>
  );
}
