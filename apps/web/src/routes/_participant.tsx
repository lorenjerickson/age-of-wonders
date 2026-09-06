import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { readSession } from "../server/readModels";

export const Route = createFileRoute("/_participant")({
  beforeLoad: async ({ location }) => {
    const session = await readSession();
    if (
      !session.authenticated ||
      !["player", "spectator"].includes(session.user.role)
    ) {
      throw redirect({ to: "/join", search: { returnTo: location.href } });
    }
    return { user: session.user };
  },
  component: Outlet,
});
