import { createFileRoute } from "@tanstack/react-router";
import { upstreamApiUrl } from "../server/api";

type StreamingRequestInit = RequestInit & { duplex?: "half" };

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

async function proxy({ request }: { request: Request }) {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);

  const publicOrigin = process.env.PUBLIC_WEB_ORIGIN;
  if (publicOrigin && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    headers.set("origin", publicOrigin);
  }
  const requestUrl = new URL(request.url);
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.slice(0, -1));

  const init: StreamingRequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstream = await fetch(upstreamApiUrl(request.url), init);
  const responseHeaders = new Headers(upstream.headers);
  for (const name of HOP_BY_HOP_HEADERS) responseHeaders.delete(name);
  responseHeaders.set("x-aow-proxy", "tanstack-start");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: proxy,
      GET: proxy,
      HEAD: proxy,
      OPTIONS: proxy,
      PATCH: proxy,
      POST: proxy,
      PUT: proxy,
    },
  },
});
