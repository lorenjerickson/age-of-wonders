import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button, Checkbox, FieldError, TextInput } from "@aow/ui";
import {
  establishAdministrator,
  getAuthenticationProviders,
  getBootstrapStatus,
  loginAsGm,
} from "./api";
import { useInternalNavigate } from "./navigation";

export function LoginPage() {
  const navigate = useInternalNavigate();
  const location = useLocation();
  const authReturnTo =
    new URLSearchParams(location.searchStr).get("returnTo") ?? "/";
  const [setupFormOpen, setSetupFormOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState<boolean | undefined>();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [grantGameMaster, setGrantGameMaster] = useState(true);
  const [auth0Configured, setAuth0Configured] = useState(false);

  useEffect(() => {
    void Promise.all([getBootstrapStatus(), getAuthenticationProviders()])
      .then(([bootstrap, providers]) => {
        setSetupRequired(bootstrap.setupRequired);
        setAuth0Configured(providers.auth0.configured);
      })
      .catch(() => {
        setSetupRequired(false);
        setMessage("The server setup status could not be loaded.");
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = setupRequired
        ? await establishAdministrator({
            token: token.trim(),
            displayName: displayName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            grantGameMaster,
          })
        : await loginAsGm(token.trim());
      await navigate(result.user.role === "administrator" ? "/settings" : "/", {
        replace: true,
      });
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not sign in.",
      );
      setBusy(false);
    }
  }

  if (setupRequired && !setupFormOpen)
    return (
      <main className="grid min-h-dvh place-items-center bg-base-100 p-4 text-base-content">
        <section className="w-full max-w-lg rounded-xl bg-base-200 px-6 py-12 sm:px-10 sm:py-20">
          <p className="font-semibold text-primary">Age of Wonders</p>
          <p className="mt-6 text-xs uppercase text-base-content/60">
            First-time setup
          </p>
          <h1 className="mt-6 text-3xl font-semibold">A new beginning.</h1>
          <p className="mt-6 text-base-content/70">
            Create the root administrator account to set up and manage this
            installation.
          </p>
          <p className="mt-5 text-sm text-base-content/60">
            This account manages access, configuration, and recovery. Choose
            someone who will be responsible for the installation.
          </p>
          <Button
            tone="primary"
            className="mt-6 min-h-11"
            onClick={() => setSetupFormOpen(true)}
          >
            Create administrator
          </Button>
        </section>
      </main>
    );

  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 p-4 text-base-content">
      <section className="card w-full max-w-2xl bg-base-200">
        <form className="card-body gap-5 p-5 sm:p-10" onSubmit={submit}>
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              {setupRequired ? "First-time setup" : "Age of Wonders"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {setupRequired
                ? "Create your administrator"
                : "Administrator sign in"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-base-content/55">
              {setupRequired
                ? "Establish the root account for this installation. All identity fields are required."
                : "Sign in to administer the installation and, when authorized, manage worlds and campaigns."}
            </p>
          </div>
          {setupRequired && (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextInput
                required
                maxLength={120}
                autoComplete="name"
                label="Administrator name"
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
              <TextInput
                required
                type="email"
                maxLength={320}
                autoComplete="email"
                label="Email address"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <TextInput
                required
                type="tel"
                pattern="^\+[1-9][0-9]{7,14}$"
                autoComplete="tel"
                label="Phone (international format)"
                help="For example, +14155550100"
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
              <Checkbox
                className="sm:col-span-2"
                tone="primary"
                checked={grantGameMaster}
                label="Also grant this person Game Master access to author and play."
                onChange={(event) =>
                  setGrantGameMaster(event.currentTarget.checked)
                }
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <TextInput
              className="flex-1"
              required
              minLength={16}
              autoComplete="off"
              type={showToken ? "text" : "password"}
              label={
                setupRequired
                  ? "First-launch access token"
                  : "Administrator access token"
              }
              value={token}
              onChange={(event) => setToken(event.currentTarget.value)}
            />
            <Button
              type="button"
              tone="outline"
              className="min-h-11"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? "Hide" : "Show"}
            </Button>
          </div>
          {setupRequired && (
            <Checkbox
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              label="I understand that the root administrator controls access and configuration. I am responsible for protecting this account, managing permissions, and maintaining a recovery plan."
            />
          )}
          {message && <FieldError>{message}</FieldError>}
          <Button
            type="submit"
            tone="primary"
            loading={busy}
            disabled={
              setupRequired === undefined ||
              Boolean(setupRequired && !acknowledged)
            }
          >
            {setupRequired ? "Create administrator" : "Sign in"}
          </Button>
          {setupRequired && (
            <Button
              type="button"
              tone="ghost"
              disabled={busy}
              onClick={() => setSetupFormOpen(false)}
            >
              Cancel
            </Button>
          )}
          {!setupRequired && auth0Configured && (
            <>
              <div className="divider text-xs text-base-content/45">or</div>
              <a
                className="btn btn-outline"
                href={`/api/auth/auth0/start?returnTo=${encodeURIComponent(authReturnTo)}`}
              >
                Continue with Auth0
              </a>
              <p className="text-xs leading-5 text-base-content/50">
                Your Auth0 account must already be linked to this profile.
              </p>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
