import { useEffect, useState, type FormEvent } from "react";
import { Button, Disclosure, TextInput } from "@aow/ui";
import { useLocation } from "@tanstack/react-router";
import { getBootstrapStatus, loginAsGm, type CurrentUser } from "./api";
import { astraRequest } from "./astraApi";
import { useInternalNavigate } from "./navigation";
import "./Astra.css";
export function AstraLogin() {
  const navigate = useInternalNavigate();
  const location = useLocation();
  const [accountName, setAccountName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"login" | "setup" | "migrate">("login");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    getBootstrapStatus()
      .then((r) => {
        if (r.setupRequired) setMode("setup");
        setReady(true);
      })
      .catch(() => {
        setError("The server could not be reached. Please reload to retry.");
      });
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (mode !== "login" && password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      let user: CurrentUser;
      if (mode === "setup") {
        const result = await astraRequest<{ user: CurrentUser }>(
          "/auth/bootstrap",
          {
            token,
            displayName,
            email,
            phone,
            grantGameMaster: true,
            accountName,
            password,
          },
        );
        user = result.user;
      } else if (mode === "migrate") {
        const result = await loginAsGm(token);
        user = result.user;
        const status = await astraRequest<{ configured: boolean }>(
          "/auth/credentials/me",
        );
        if (status.configured && !currentPassword) {
          setAlreadyConfigured(true);
          setError(
            "Password sign-in is already configured. Enter your current password to change it, or return to sign in.",
          );
          return;
        }
        await astraRequest("/auth/credentials", {
          accountName,
          password,
          ...(status.configured ? { currentPassword } : {}),
        });
      } else {
        const result = await astraRequest<{ user: CurrentUser }>(
          "/auth/login",
          { accountName, password },
        );
        user = result.user;
      }
      setPassword("");
      setCurrentPassword("");
      setConfirmPassword("");
      setToken("");
      const destination = new URLSearchParams(location.searchStr).get(
        "returnTo",
      );
      await navigate(
        destination?.startsWith("/") &&
          !destination.startsWith("//") &&
          !destination.includes("\\") &&
          !/[\r\n]/.test(destination) &&
          !destination.startsWith("/login")
          ? destination
          : user.role === "administrator"
            ? "/settings"
            : user.role === "player"
              ? "/play"
              : user.role === "spectator"
                ? "/join"
                : "/",
        { replace: true },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="astra-login">
      <section className="astra-login-art">
        <img src="/astra/login-landscape.svg" alt="" />
        <div className="astra-brand">
          <span>✧</span>ASTRA
        </div>
        <div className="astra-login-story">
          <h1>
            Worlds worth
            <br />
            getting lost in.
          </h1>
          <p>A LITTLE IMAGINATION. ENDLESS POSSIBILITY.</p>
        </div>
      </section>
      <section className="astra-login-main">
        <form className="astra-login-form" onSubmit={submit}>
          <div>
            <div className="astra-eyebrow">THE GAME MASTER’S WORKSPACE</div>
            <h1>
              {mode === "login"
                ? "Welcome back."
                : mode === "setup"
                  ? "A new beginning."
                  : "Set up your account."}
            </h1>
            <p>
              {mode === "login"
                ? "Your world is right where you left it. Sign in to continue the story."
                : "Create your account name and password to enter your workspace."}
            </p>
          </div>
          {mode !== "login" && (
            <TextInput
              label="Administrator access token"
              type="password"
              autoComplete="off"
              minLength={16}
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          )}
          {mode === "setup" && (
            <>
              <TextInput
                label="Your name"
                required
                maxLength={120}
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <TextInput
                label="Email address"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextInput
                label="Phone (international format)"
                type="tel"
                required
                autoComplete="tel"
                pattern="[+][1-9][0-9]{7,14}"
                help="For example, +14155550100."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </>
          )}
          <TextInput
            label="Account name"
            autoComplete="username"
            required
            minLength={3}
            maxLength={64}
            pattern={mode === "login" ? undefined : "[A-Za-z0-9._\\-]{3,64}"}
            help={
              mode === "login"
                ? undefined
                : "Letters, numbers, dots, underscores, or hyphens."
            }
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          {mode === "migrate" && alreadyConfigured && (
            <TextInput
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          )}
          <TextInput
            label={mode === "login" ? "Password" : "New password"}
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={mode === "login" ? 1 : 12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            help={mode !== "login" ? "Use at least 12 characters." : undefined}
          />
          {mode !== "login" && (
            <TextInput
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          )}
          {error && (
            <p role="alert" className="astra-error">
              {error}
            </p>
          )}
          <Button type="submit" tone="primary" disabled={!ready || busy}>
            {busy ? "Signing in…" : "Enter workspace →"}
          </Button>
          <small>Your worlds are saved on this Astra server.</small>
          {mode === "login" && (
            <Disclosure summary="Existing administrator account?">
              <p>Use your existing access token once to create a password.</p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode("migrate");
                  setPassword("");
                  setError("");
                }}
              >
                Set up password sign-in
              </Button>
            </Disclosure>
          )}
          {mode === "migrate" && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("login");
                setToken("");
                setPassword("");
                setCurrentPassword("");
                setConfirmPassword("");
                setError("");
              }}
            >
              Back to sign in
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}
