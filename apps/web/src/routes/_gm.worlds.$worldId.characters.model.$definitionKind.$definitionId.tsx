import { createFileRoute } from "@tanstack/react-router";
import { WorldModelEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/model/$definitionKind/$definitionId",
)({ component: ModelRoute });
function ModelRoute() {
  const kind = Route.useParams().definitionKind;
  return kind === "attributes" ||
    kind === "equipment-slots" ||
    kind === "profession-ranks" ? (
    <WorldModelEditor kind={kind} />
  ) : (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold">Model unavailable</h1>
      <p className="mt-4 text-base-content/60">
        Choose Attributes, Equipment Slots, or Profession Ranks from Model &amp;
        Taxonomies.
      </p>
    </main>
  );
}
