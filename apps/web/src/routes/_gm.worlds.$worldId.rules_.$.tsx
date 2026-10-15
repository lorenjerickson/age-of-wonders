import { createFileRoute } from "@tanstack/react-router";
import { WorldRulesPage } from "../WorldRulesPage";
export const Route = createFileRoute("/_gm/worlds/$worldId/rules_/$")({
  component: WorldRulesPage,
});
