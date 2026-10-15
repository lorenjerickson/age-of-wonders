import { createFileRoute } from "@tanstack/react-router";
import { PlayersLanding } from "./_gm.players";
export const Route = createFileRoute("/_gm/players_/$playerId")({
  component: PlayerProfile,
});
function PlayerProfile() {
  return <PlayersLanding playerId={Route.useParams().playerId} />;
}
