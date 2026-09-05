import { createFileRoute } from "@tanstack/react-router";
import { SessionsPage } from "../App";
import { readSessions } from "../server/readModels";

export const Route = createFileRoute("/_gm/sessions")({
  loader: () => readSessions(),
  component: SessionsRoute,
});

function SessionsRoute() {
  const { campaign, sessions } = Route.useLoaderData();
  return <SessionsPage initialCampaign={campaign} initialSessions={sessions} />;
}
