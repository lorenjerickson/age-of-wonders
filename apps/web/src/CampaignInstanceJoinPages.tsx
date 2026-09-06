import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Alert, Button, StatusIndicator, Textarea } from "@aow/ui";
import {
  acceptCampaignInstanceInvitation,
  resolveCampaignInstanceInvitation,
  resolveCampaignSessionInvitation,
  respondToCampaignSessionInvitation,
  type PublicCampaignInstanceInvitation,
  type PublicCampaignSessionInvitation,
} from "./api";
import { invitationTokenFromHash } from "./appRoutes";
import { useInternalNavigate } from "./navigation";

function useFragmentInvitation<Invitation>(
  resolve: (token: string) => Promise<Invitation>,
) {
  const [invitation, setInvitation] = useState<Invitation>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const token = useRef("");
  useEffect(() => {
    const value = invitationTokenFromHash(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    if (!value) {
      setMessage("This invitation is unavailable or has expired.");
      setBusy(false);
      return;
    }
    token.current = value;
    void resolve(value)
      .then(setInvitation, () =>
        setMessage("This invitation is unavailable or has expired."),
      )
      .finally(() => setBusy(false));
  }, [resolve]);
  return { invitation, message, setMessage, busy, setBusy, token };
}

function InvitationFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-5 py-10 text-base-content">
      <section className="card w-full max-w-xl border border-base-300 bg-base-200 shadow-2xl">
        <div className="card-body gap-5">{children}</div>
      </section>
    </main>
  );
}

export function CampaignInstanceJoinPage() {
  const navigate = useInternalNavigate();
  const state = useFragmentInvitation<PublicCampaignInstanceInvitation>(
    resolveCampaignInstanceInvitation,
  );
  async function accept(event: FormEvent) {
    event.preventDefault();
    state.setBusy(true);
    try {
      await acceptCampaignInstanceInvitation(state.token.current);
      await navigate("/play/characters", { replace: true });
    } catch (caught) {
      state.setMessage(
        caught instanceof Error
          ? caught.message
          : "The Campaign Instance could not be joined.",
      );
      state.setBusy(false);
    }
  }
  return (
    <InvitationFrame>
      {state.busy && !state.invitation ? (
        <StatusIndicator tone="info" pulse label="Checking your invitation…" />
      ) : state.invitation ? (
        <form className="grid gap-5" onSubmit={(event) => void accept(event)}>
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Campaign Instance invitation
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              Join {state.invitation.campaignInstanceName}
            </h1>
            <p className="mt-2 text-base-content/60">
              You are invited as{" "}
              {state.invitation.role === "spectator"
                ? "a Spectator"
                : "a Player"}
              .
            </p>
          </div>
          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <p className="font-medium">{state.invitation.invitedName}</p>
          </div>
          {state.message && <Alert tone="error">{state.message}</Alert>}
          <Button type="submit" tone="primary" loading={state.busy}>
            Accept invitation
          </Button>
        </form>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
          <Alert tone="error">{state.message}</Alert>
        </>
      )}
    </InvitationFrame>
  );
}

export function CampaignSessionJoinPage() {
  const navigate = useInternalNavigate();
  const state = useFragmentInvitation<PublicCampaignSessionInvitation>(
    resolveCampaignSessionInvitation,
  );
  const [responseMessage, setResponseMessage] = useState("");
  async function respond(response: "accepted" | "declined") {
    state.setBusy(true);
    try {
      const result = await respondToCampaignSessionInvitation(
        state.token.current,
        response,
        responseMessage,
      );
      await navigate(response === "accepted" ? result.lobbyHref : "/join", {
        replace: true,
      });
    } catch (caught) {
      state.setMessage(
        caught instanceof Error
          ? caught.message
          : "Your response could not be saved.",
      );
      state.setBusy(false);
    }
  }
  return (
    <InvitationFrame>
      {state.busy && !state.invitation ? (
        <StatusIndicator
          tone="info"
          pulse
          label="Checking your Session invitation…"
        />
      ) : state.invitation ? (
        <div className="grid gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Session invitation
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {state.invitation.sessionName}
            </h1>
            <p className="mt-2 text-base-content/60">
              {state.invitation.campaignInstanceName} · invited as{" "}
              {state.invitation.role}
            </p>
          </div>
          <Textarea
            aria-label="Optional availability message"
            placeholder="Optional availability message"
            value={responseMessage}
            maxLength={1000}
            onChange={(event) => setResponseMessage(event.currentTarget.value)}
          />
          {state.message && <Alert tone="error">{state.message}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button
              tone="primary"
              loading={state.busy}
              onClick={() => void respond("accepted")}
            >
              Accept Session
            </Button>
            <Button
              tone="outline"
              loading={state.busy}
              onClick={() => void respond("declined")}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
          <Alert tone="error">{state.message}</Alert>
        </>
      )}
    </InvitationFrame>
  );
}
