import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Signing in…");
    const body = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/gm-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: body.get("token") }),
    });
    if (!response.ok) {
      setMessage("Sign-in failed.");
      return;
    }
    window.location.assign("/world/atlas/locations/location-1");
  }

  return (
    <main className="shell stack">
      <h1>Sign in to the spike</h1>
      <form className="panel stack" onSubmit={submit}>
        <label className="field">
          GM bootstrap token
          <input name="token" minLength={16} required type="text" />
        </label>
        <button type="submit">Sign in</button>
        <p aria-live="polite">{message}</p>
      </form>
      <Link to="/">Return to overview</Link>
    </main>
  );
}
