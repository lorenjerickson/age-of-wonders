import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_gm/players")({
  component: PlayersLanding,
});

function PlayersLanding() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        People
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Players</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-base-content/65">
        Player profiles and server standing will live here. Campaign
        invitations, memberships, and Characters remain managed in the Campaign
        Instance where they belong.
      </p>
      <div className="alert mt-10 max-w-2xl border border-base-300 bg-base-200">
        <span>
          The directory is being realigned with invitation-based profiles. No
          legacy participant records have been moved or hidden.
        </span>
      </div>
    </main>
  );
}
