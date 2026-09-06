export const ROUTE_POLICIES = [
  {
    family: "authentication",
    pattern: "/login",
    audience: "public",
    rendering: "prerender",
  },
  {
    family: "campaign invitation",
    pattern: "/join|/join/instance|/join/session",
    audience: "public",
    rendering: "prerender-client-exchange",
  },
  { family: "home", pattern: "/", audience: "gm", rendering: "ssr" },
  {
    family: "quick start",
    pattern: "/quick-start",
    audience: "gm",
    rendering: "ssr-client-progress",
  },
  {
    family: "resource browse",
    pattern: "/worlds|campaigns|players|settings",
    audience: "gm",
    rendering: "ssr",
  },
  {
    family: "authoring editor",
    pattern: "/worlds|campaigns/...",
    audience: "gm",
    rendering: "client-island",
  },
  {
    family: "session canvas",
    pattern: "/session-canvas-lab",
    audience: "gm",
    rendering: "client-island",
  },
  {
    family: "player character",
    pattern: "/play[/characters/:id]",
    audience: "player",
    rendering: "client-island",
  },
] as const;

export function invitationTokenFromHash(hash: string): string | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  const token = parameters.get("invite") ?? parameters.get("token");
  return token?.trim() || undefined;
}
