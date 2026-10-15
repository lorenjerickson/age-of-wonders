import { createFileRoute } from "@tanstack/react-router";
import { AstraWorldLibrary } from "../AstraWorkspace";
export const Route = createFileRoute("/_gm/worlds/")({
  component: AstraWorldLibrary,
});
