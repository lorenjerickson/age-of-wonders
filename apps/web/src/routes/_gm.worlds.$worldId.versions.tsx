import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { WorldVersionsPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/versions")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname === `/worlds/${encodeURIComponent(worldId)}/versions` ? (
    <WorldVersionsPage />
  ) : (
    <Outlet />
  );
}
