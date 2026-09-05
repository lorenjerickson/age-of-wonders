import { createFileRoute } from "@tanstack/react-router";
import { DraftRecordEditor } from "../WorldAuthoringPages";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/item-compendium/items/$itemId",
)({ component: ItemRoute });
function ItemRoute() {
  return (
    <DraftRecordEditor
      kind="items"
      sourceId={
        Route.useParams().itemId === "new"
          ? undefined
          : Route.useParams().itemId
      }
    />
  );
}
