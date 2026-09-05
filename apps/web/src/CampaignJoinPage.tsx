import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, StatusIndicator } from "@aow/ui";
import {
  acceptCampaignInvitation,
  exchangeCampaignInvitation,
  type PublicCampaignInvitation,
} from "./api";
import { invitationTokenFromHash } from "./appRoutes";
import { useInternalNavigate } from "./navigation";

export function CampaignJoinPage() {
  const navigate = useInternalNavigate();
  const [invitation, setInvitation] = useState<PublicCampaignInvitation>();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const invitationToken = invitationTokenFromHash(window.location.hash);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!invitationToken) {
      setMessage("This invitation is unavailable or has expired.");
      setBusy(false);
      return;
    }
    setToken(invitationToken);
    void exchangeCampaignInvitation(invitationToken).then(
      (result) => {
        setInvitation(result);
        setBusy(false);
      },
      () => {
        setMessage("This invitation is unavailable or has expired.");
        setBusy(false);
      },
    );
  }, []);

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await acceptCampaignInvitation(token);
      await navigate(
        result.draftId
          ? `/play/characters/${encodeURIComponent(result.draftId)}`
          : "/play/characters",
        { replace: true },
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not join the campaign.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-5 py-10 text-base-content">
      <section className="card w-full max-w-xl border border-base-300 bg-base-200 shadow-2xl">
        <div className="card-body gap-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Campaign invitation
          </p>
          {busy && !invitation ? (
            <StatusIndicator
              tone="info"
              pulse
              label="Checking your invitation…"
            />
          ) : invitation ? (
            <form className="grid gap-5" onSubmit={accept}>
              <div>
                <h1 className="text-3xl font-semibold">
                  Join {invitation.campaignName}
                </h1>
                <p className="mt-2 leading-7 text-base-content/60">
                  You have been invited as a player. Confirm your entry to begin
                  character creation.
                </p>
              </div>
              <div className="rounded-box border border-base-300 bg-base-100 p-4">
                <span className="text-xs font-semibold tracking-wide text-base-content/45 uppercase">
                  Joining as
                </span>
                <p className="mt-1 font-medium">
                  {invitation.invitedName ??
                    invitation.displayName ??
                    "Invited player"}
                </p>
              </div>
              {message && <Alert tone="error">{message}</Alert>}
              <Button
                type="submit"
                tone="primary"
                loading={busy}
                disabled={!token}
              >
                Join campaign
              </Button>
            </form>
          ) : (
            <div>
              <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
              <Alert tone="error" className="mt-3">
                {message}
              </Alert>
              <p className="mt-3 text-sm text-base-content/45">
                Ask the GM to send a new invitation.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
