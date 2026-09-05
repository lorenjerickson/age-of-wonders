import { createFileRoute } from "@tanstack/react-router";
import { upstreamApiUrl } from "../server/api";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("ready") !== "1") {
          return Response.json({ status: "ok", service: "web" });
        }
        try {
          const upstream = await fetch(
            upstreamApiUrl(`${url.origin}/api/health`),
            { signal: AbortSignal.timeout(2_000) },
          );
          return Response.json(
            {
              status: upstream.ok ? "ok" : "degraded",
              service: "web",
              api: upstream.ok ? "connected" : "unavailable",
            },
            { status: upstream.ok ? 200 : 503 },
          );
        } catch {
          return Response.json(
            { status: "degraded", service: "web", api: "unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
