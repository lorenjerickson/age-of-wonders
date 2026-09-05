import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_gm/campaigns/new")({
  component: () => <Navigate to="/campaigns/definitions/new" replace />,
});
