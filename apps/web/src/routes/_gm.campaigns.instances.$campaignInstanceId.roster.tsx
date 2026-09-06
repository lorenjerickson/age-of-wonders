import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute(
  "/_gm/campaigns/instances/$campaignInstanceId/roster",
)({ component: Outlet });
