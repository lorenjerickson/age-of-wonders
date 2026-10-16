import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AstraCodex } from "../AstraCodex";
export const Route = createFileRoute("/_gm/worlds/$worldId/item-compendium")({
  component: SectionRoute,
});

function SectionRoute() {
  const { worldId } = Route.useParams();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  return pathname ===
    `/worlds/${encodeURIComponent(worldId)}/item-compendium` ? (
    <AstraCodex />
  ) : (
    <Outlet />
  );
}
