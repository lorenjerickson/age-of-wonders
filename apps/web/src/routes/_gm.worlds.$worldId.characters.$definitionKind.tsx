import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/$definitionKind",
)({ component: CharacterDefinitionKindLayout });

function CharacterDefinitionKindLayout() {
  return <Outlet />;
}
