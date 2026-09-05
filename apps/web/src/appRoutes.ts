export const ROUTE_POLICIES = [
  {
    family: "authentication",
    pattern: "/login",
    audience: "public",
    rendering: "prerender",
  },
  {
    family: "campaign invitation",
    pattern: "/join[/campaign]",
    audience: "public",
    rendering: "prerender-client-exchange",
  },
  { family: "home", pattern: "/", audience: "gm", rendering: "ssr" },
  {
    family: "resource browse",
    pattern: "/worlds|campaigns|locations|creatures|items|systems|sessions",
    audience: "gm",
    rendering: "ssr",
  },
  {
    family: "simple resource detail",
    pattern: "/locations|items|systems/:id",
    audience: "gm",
    rendering: "ssr-island",
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
