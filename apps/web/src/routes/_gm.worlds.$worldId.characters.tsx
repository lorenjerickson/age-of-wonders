import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters")({
  component: WorldCharactersLanding,
});

function WorldCharactersLanding() {
  return <Outlet />;
}
