import { createFileRoute, useLocation } from "@tanstack/react-router";
import { RuleNodePage } from "../RuleNodePage";
import {
  characterAuthorBase,
  characterAuthorKind,
} from "../characterAuthoringModel";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/$definitionKind/$definitionId_/$section/$",
)({ component: Page });
function Page() {
  const { worldId, definitionKind, definitionId } = Route.useParams();
  const path = useLocation().pathname.split("/").slice(6).join("/");
  const kind = characterAuthorKind(definitionKind);
  if (!kind) return <main className="p-4">Character option unavailable.</main>;
  return (
    <RuleNodePage
      catalog={kind}
      itemId={definitionId}
      path={path}
      basePath={`${characterAuthorBase(worldId, kind)}/${encodeURIComponent(definitionId)}`}
    />
  );
}
