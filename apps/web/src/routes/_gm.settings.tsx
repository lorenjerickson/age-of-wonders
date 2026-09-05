import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_gm/settings")({
  component: SettingsLanding,
});

function SettingsLanding() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Hosted system
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-base-content/65">
        Installation readiness, integrations, plugins, credentials, storage,
        backups, security, and updates belong here—not inside a World or
        Campaign.
      </p>
      <section className="card mt-10 max-w-2xl border border-base-300 bg-base-200">
        <div className="card-body">
          <h2 className="card-title">Current system configuration</h2>
          <p className="text-base-content/60">
            Existing system records remain available while the full Settings
            taxonomy is introduced.
          </p>
          <div className="card-actions mt-3">
            <Link className="btn btn-outline" to="/systems">
              View systems and readiness
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
