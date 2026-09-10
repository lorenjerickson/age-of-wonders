import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ItemCompendiumPage } from "../WorldAuthoringPages";
export const Route = createFileRoute("/_gm/worlds/$worldId/item-compendium")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname ===
    `/worlds/${encodeURIComponent(worldId)}/item-compendium` ? (
    <ItemCompendiumPage />
  ) : (
    <Outlet />
  );
}
