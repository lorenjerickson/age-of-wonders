import { createFileRoute } from "@tanstack/react-router";
import { QuickStartPage } from "../QuickStart";

export const Route = createFileRoute("/_gm/quick-start")({
  component: QuickStartRoute,
});

function QuickStartRoute() {
  return <QuickStartPage />;
}
