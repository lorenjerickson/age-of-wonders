import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots")({ component: Outlet });
