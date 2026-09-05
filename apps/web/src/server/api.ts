import { getRequestHeaders } from "@tanstack/react-start/server";

interface ApiErrorBody {
  message?: string | string[];
}

export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServerApiError";
  }
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3000/api").replace(
    /\/$/,
    "",
  );
}

function errorMessage(body: ApiErrorBody, status: number) {
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  return `API request failed (${status})`;
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
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ServerApiError(
      response.status,
      errorMessage(body, response.status),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function upstreamApiUrl(requestUrl: string) {
  const incoming = new URL(requestUrl);
  const suffix = incoming.pathname.replace(/^\/api(?=\/|$)/, "");
  return `${apiBaseUrl()}${suffix}${incoming.search}`;
}
