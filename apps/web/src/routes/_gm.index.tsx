import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "../App";
import { readLanding } from "../server/readModels";

export const Route = createFileRoute("/_gm/")({
  loader: () => readLanding(),
  component: HomeRoute,
});

function HomeRoute() {
  const { healthy, worlds, campaigns } = Route.useLoaderData();
  return (
    <LandingPage
      initialHealthy={healthy}
      initialWorlds={worlds}
      initialCampaigns={campaigns}
    />
  );
}
