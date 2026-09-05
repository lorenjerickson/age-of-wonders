import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/world")({
  component: () => (
    <section className="stack" data-workspace="world">
      <header>
        <p className="muted">World workspace</p>
      </header>
      <Outlet />
    </section>
  ),
});
