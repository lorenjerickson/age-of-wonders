import { FormEvent, useEffect, useState } from "react";
import { Button, FieldError, TextInput } from "@aow/ui";
import { establishAdministrator, getBootstrapStatus, loginAsGm } from "./api";
import { useInternalNavigate } from "./navigation";

export function LoginPage() {
  const navigate = useInternalNavigate();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState<boolean | undefined>();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [grantGameMaster, setGrantGameMaster] = useState(true);

  useEffect(() => {
    void getBootstrapStatus()
      .then((result) => setSetupRequired(result.setupRequired))
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

  return (
    <main className="grid min-h-dvh place-items-center bg-base-100 px-5 text-base-content">
      <section className="card w-full max-w-md border border-base-300 bg-base-200 shadow-2xl">
        <form className="card-body gap-5" onSubmit={submit}>
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Age of Wonders
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {setupRequired
                ? "Establish administrator"
                : "Administrator sign in"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-base-content/55">
              {setupRequired
                ? "Create the installation operator identity before authoring or play begins."
                : "Sign in to administer the installation and, when authorized, manage worlds and campaigns."}
            </p>
          </div>
          {setupRequired && (
            <>
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
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary mt-0.5"
                  checked={grantGameMaster}
                  onChange={(event) =>
                    setGrantGameMaster(event.currentTarget.checked)
                  }
                />
                <span>
                  Also grant this person Game Master access to author and play.
                </span>
              </label>
            </>
          )}
          <TextInput
            required
            minLength={16}
            autoComplete="off"
            type="password"
            label={
              setupRequired
                ? "First-launch access token"
                : "Administrator access token"
            }
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
          />
          {message && <FieldError>{message}</FieldError>}
          <Button
            type="submit"
            tone="primary"
            loading={busy}
            disabled={setupRequired === undefined}
          >
            {setupRequired ? "Complete first launch" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
