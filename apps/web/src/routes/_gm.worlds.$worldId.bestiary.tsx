import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { BestiaryPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/bestiary")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname === `/worlds/${encodeURIComponent(worldId)}/bestiary` ? (
    <BestiaryPage />
  ) : (
    <Outlet />
  );
}
