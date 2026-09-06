import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_player/play/")({
  component: PlayerLanding,
});

function PlayerLanding() {
  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-6 text-base-content">
      <section className="max-w-lg text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Player workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Choose a campaign</h1>
        <p className="mt-3 text-base-content/60">
          Open a Campaign Instance invitation or Session invitation to continue
          with the characters and play available there.
        </p>
      </section>
    </main>
  );
}
