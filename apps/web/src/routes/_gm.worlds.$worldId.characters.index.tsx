import { createFileRoute } from "@tanstack/react-router";
import { AstraCodex } from "../AstraCodex";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters/")({
  component: () => <AstraCodex collection="characters" />,
});
