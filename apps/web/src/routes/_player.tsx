import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { readSession } from "../server/readModels";

export const Route = createFileRoute("/_player")({
  beforeLoad: async ({ location }) => {
    const session = await readSession();
    if (!session.authenticated || session.user.role !== "player") {
      throw redirect({ to: "/join", search: { returnTo: location.href } });
    }
    return { user: session.user };
  },
  component: Outlet,
});
