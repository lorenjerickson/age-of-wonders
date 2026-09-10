import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AtlasPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/atlas")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname === `/worlds/${encodeURIComponent(worldId)}/atlas` ? (
    <AtlasPage />
  ) : (
    <Outlet />
  );
}
