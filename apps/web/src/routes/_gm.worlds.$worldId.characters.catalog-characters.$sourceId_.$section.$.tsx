import { createFileRoute, useLocation } from "@tanstack/react-router";
import { RuleNodePage } from "../RuleNodePage";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/catalog-characters/$sourceId_/$section/$",
)({ component: Page });
function Page() {
  const { worldId, sourceId } = Route.useParams();
  const path = useLocation().pathname.split("/").slice(6).join("/");
  return (
    <RuleNodePage
      catalog="character-template"
      itemId={sourceId}
      path={path}
      basePath={`/worlds/${encodeURIComponent(worldId)}/characters/catalog-characters/${encodeURIComponent(sourceId)}`}
    />
  );
}
