import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_gm/campaigns/definitions/$campaignDefinitionId/plots/$plotDefinitionId/$collection/$childId/claims")({component:Outlet});
