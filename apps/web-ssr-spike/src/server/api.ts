import { getRequestHeaders } from "@tanstack/react-start/server";

export interface CurrentUser {
  displayName: string;
  role: "gm" | "player" | "spectator";
}

export interface DomainRecord {
  id: string;
  kind: string | null;
  name: string | null;
  revision: number;
}

export class UpstreamApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamApiError";
  }
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3000/api").replace(
    /\/$/,
    "",
  );
}

function safeMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object" || !("message" in body)) {
    return fallback;
  }
  const message = body.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return fallback;
}

export async function serverApiRequest<T>(path: string): Promise<T> {
  const incoming = getRequestHeaders();
  const headers = new Headers({ Accept: "application/json" });
  const cookie = incoming.get("cookie");
  const requestId = incoming.get("x-request-id");
  if (cookie) headers.set("cookie", cookie);
  if (requestId) headers.set("x-request-id", requestId);

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new UpstreamApiError(
      response.status,
      safeMessage(body, `API request failed (${response.status})`),
    );
  }
  return response.json() as Promise<T>;
}

export function upstreamApiUrl(requestUrl: string) {
  const incoming = new URL(requestUrl);
  const suffix = incoming.pathname.replace(/^\/api(?=\/|$)/, "");
  return `${apiBaseUrl()}${suffix}${incoming.search}`;
}
