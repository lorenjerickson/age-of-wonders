import { createFileRoute, notFound } from "@tanstack/react-router";
import { readLocation } from "../server/functions";

export const Route = createFileRoute(
  "/_authenticated/world/atlas/locations/$locationId",
)({
  loader: async ({ params }) => {
    const result = await readLocation({
      data: { locationId: params.locationId },
    });
    if (!result.found) throw notFound();
    return result.location;
  },
  component: LocationPage,
  notFoundComponent: () => (
    <section className="panel stack">
      <h1>Location not found</h1>
      <p className="muted">
        This location is unavailable or is outside the current World.
      </p>
    </section>
  ),
});

function LocationPage() {
  const location = Route.useLoaderData();
  return (
    <article className="panel stack">
      <p className="muted">Protected request-time SSR</p>
      <h1 data-testid="location-name">
        {location.name?.trim() || "Untitled location"}
      </h1>
      <dl>
        <dt>Kind</dt>
        <dd>{location.kind?.trim() || "Location"}</dd>
        <dt>Revision</dt>
        <dd>{location.revision}</dd>
      </dl>
      <p>
        The initial HTML for this route is loaded from Nest after forwarding the
        incoming HTTP-only session cookie.
      </p>
    </article>
  );
}
