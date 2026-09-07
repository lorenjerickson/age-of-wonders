import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/item-compendium/items/$itemId",
)({ component: ItemRoute });
function ItemRoute() {
  const itemId = Route.useParams().itemId;
  return (
    <DraftRecordEditor
      key={itemId}
      kind="items"
      sourceId={itemId === "new" ? undefined : itemId}
    />
  );
}
