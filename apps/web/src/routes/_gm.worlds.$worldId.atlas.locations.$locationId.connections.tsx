import { createFileRoute, redirect } from "@tanstack/react-router";
import { locationHref } from "../locationWorkspaceModel";
export const Route = createFileRoute(
  "/_gm/worlds/$worldId/atlas/locations/$locationId/connections",
)({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `${locationHref(params.worldId, params.locationId)}/hierarchy${location.searchStr}`,
      replace: true,
    });
  },
});
