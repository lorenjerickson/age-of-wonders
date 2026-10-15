import { createFileRoute, useLocation } from "@tanstack/react-router";
import { RuleNodePage } from "../RuleNodePage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/bestiary/catalog-monsters/$sourceId_/$section/$",
)({ component: Page });
function Page() {
  const { worldId, sourceId } = Route.useParams();
  const path = useLocation().pathname.split("/").slice(6).join("/");
  return (
    <RuleNodePage
      catalog="monster"
      itemId={sourceId}
      path={path}
      basePath={`/worlds/${encodeURIComponent(worldId)}/bestiary/catalog-monsters/${encodeURIComponent(sourceId)}`}
    />
  );
}
