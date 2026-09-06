import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMyAuthenticationProviders } from "../api";

export const Route = createFileRoute("/join/")({
  component: InvitationLanding,
});

function InvitationLanding() {
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  useEffect(() => {
    void getMyAuthenticationProviders().then(
      (result) => setAuth0(result.auth0),
      () => undefined,
    );
  }, []);
  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-5 py-10 text-base-content">
      <section className="card w-full max-w-xl border border-base-300 bg-base-200 shadow-2xl">
        <div className="card-body gap-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Invitation required
          </p>
          <h1 className="text-3xl font-semibold">Open your invitation link</h1>
          <p className="leading-7 text-base-content/60">
            Campaign Instance and Session invitations include the destination
            needed to join safely. Ask your Game Master for a current link if
            you arrived here directly.
          </p>
          {auth0?.configured && !auth0.linked && (
            <a
              className="btn btn-primary w-fit"
              href="/api/auth/auth0/link?returnTo=%2Fjoin"
            >
              Connect Auth0
            </a>
          )}
          <Link className="btn btn-outline w-fit" to="/login">
            Return to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
