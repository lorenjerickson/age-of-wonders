import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/world/atlas")({
  component: () => (
    <section className="stack" data-section="atlas">
      <p className="muted">Atlas / Locations</p>
      <Outlet />
    </section>
  ),
});
