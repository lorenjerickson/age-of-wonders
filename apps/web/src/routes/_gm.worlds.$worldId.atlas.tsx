import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AstraAtlas } from "../AstraAtlas";
export const Route = createFileRoute("/_gm/worlds/$worldId/atlas")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname === `/worlds/${encodeURIComponent(worldId)}/atlas` ? (
    <AstraAtlas />
  ) : (
    <Outlet />
  );
}
