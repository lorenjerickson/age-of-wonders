import { createFileRoute, useLocation } from "@tanstack/react-router";
import { ItemMechanicsPage } from "../ItemMechanicsPage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/item-compendium/items/$itemId_/$section/$",
)({ component: Page });
function Page() {
  const { itemId } = Route.useParams();
  const path = useLocation().pathname.split("/").slice(6).join("/");
  return <ItemMechanicsPage itemId={itemId} path={path} />;
}
