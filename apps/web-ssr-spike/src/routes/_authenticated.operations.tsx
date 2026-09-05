import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/_authenticated/operations")({
  component: OperationsPage,
});

function OperationsPage() {
  const [message, setMessage] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Uploading…");
    const response = await fetch("/api/media?purpose=ssr-spike", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    setMessage(response.ok ? "Upload succeeded." : "Upload failed.");
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      setMessage("Logout failed.");
      return;
    }
    window.location.assign("/login");
  }

  return (
    <main className="stack">
      <header>
        <p className="muted">Same-origin API fixture</p>
        <h1>Mutation and multipart upload</h1>
      </header>
      <form className="panel stack" onSubmit={upload}>
        <label className="field">
          Test file
          <input name="file" required type="file" />
        </label>
        <button type="submit">Upload through /api</button>
      </form>
      <section className="panel stack">
        <h2>Session mutation</h2>
        <button type="button" onClick={logout}>
          Log out through /api
        </button>
      </section>
      <p aria-live="polite">{message}</p>
    </main>
  );
}
