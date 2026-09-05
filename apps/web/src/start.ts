import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

function requestIdFor(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._-]{1,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

const requestMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const startedAt = performance.now();
    const requestId = requestIdFor(request);
    const pathname = new URL(request.url).pathname;
    try {
      const result = await next();
      result.response.headers.set("x-request-id", requestId);
      result.response.headers.set(
        "server-timing",
        `app;dur=${(performance.now() - startedAt).toFixed(1)}`,
      );
      if (!result.response.headers.has("cache-control")) {
        const publicStaticRoute =
          pathname === "/login" ||
          pathname === "/join" ||
          pathname === "/join/campaign";
        result.response.headers.set(
          "cache-control",
          publicStaticRoute
            ? "public, max-age=0, must-revalidate"
            : "private, no-store",
        );
      }
      console.info(
        JSON.stringify({
          event: "request.complete",
          method: request.method,
          path: pathname,
          requestId,
          status: result.response.status,
          durationMs: Number((performance.now() - startedAt).toFixed(1)),
        }),
      );
      return result;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request.error",
          method: request.method,
          path: pathname,
          requestId,
          durationMs: Number((performance.now() - startedAt).toFixed(1)),
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      throw error;
    }
  },
);

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestMiddleware, csrfMiddleware],
}));
