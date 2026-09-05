import { FormEvent, useState } from "react";
import { Button, FieldError, TextInput } from "@aow/ui";
import { loginAsGm } from "./api";
import { useInternalNavigate } from "./navigation";

export function LoginPage() {
  const navigate = useInternalNavigate();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await loginAsGm(token.trim());
      await navigate("/", { replace: true });
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
            <h1 className="mt-2 text-3xl font-semibold">GM sign in</h1>
            <p className="mt-2 text-sm leading-6 text-base-content/55">
              Sign in to manage the campaign and its participants.
            </p>
          </div>
          <TextInput
            required
            minLength={16}
            autoComplete="off"
            type="password"
            label="GM access token"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
          />
          {message && <FieldError>{message}</FieldError>}
          <Button type="submit" tone="primary" loading={busy}>
            Sign in
          </Button>
        </form>
      </section>
    </main>
  );
}
