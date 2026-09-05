import { useState, type ReactNode } from "react";
import { InternalLink } from "./navigation";

const DEFINITION_SECTIONS = [
  "Plots",
  "Placements",
  "Preparation defaults",
  "Versions & migrations",
] as const;

const INSTANCE_SECTIONS = [
  "Plot state",
  "Placements & staging",
  "Roster",
  "Sessions",
  "Versions & migrations",
] as const;

export function CampaignWorkspaceShell({
  kind,
  name,
  context,
  children,
}: {
  kind: "Definition" | "Instance";
  name: string;
  context: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections =
    kind === "Definition" ? DEFINITION_SECTIONS : INSTANCE_SECTIONS;
  return (
    <div
      className={`min-h-full lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] ${
        kind === "Definition" ? "bg-primary/[0.025]" : "bg-secondary/[0.025]"
      }`}
    >
      <aside className="border-b border-base-300 bg-base-100/75 p-4 lg:min-h-full lg:border-r lg:border-b-0 lg:p-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Campaign {kind}
        </p>
        <p className="mt-2 truncate text-lg font-semibold" title={name}>
          {name}
        </p>
        <p className="mt-1 text-xs leading-5 text-base-content/45">{context}</p>
        <button
          type="button"
          className="btn btn-outline mt-4 min-h-11 w-full justify-between lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls="campaign-workspace-navigation"
          onClick={() => setMobileOpen((value) => !value)}
        >
          Campaign navigation
          <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
        </button>
        <nav
          id="campaign-workspace-navigation"
          aria-label={`${name} ${kind} navigation`}
          className={`mt-4 ${mobileOpen ? "block" : "hidden lg:block"}`}
        >
          <ul className="menu gap-1 p-0">
            <li>
              <span aria-current="page" className="menu-active font-semibold">
                Overview
              </span>
            </li>
            {sections.map((section) => (
              <li key={section}>
                <span className="justify-between text-base-content/55">
                  {section}
                  <span className="text-[0.65rem] tracking-wide uppercase">
                    Planned
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <InternalLink className="link mt-5 inline-block text-sm" href="/campaigns">
            Back to Campaigns
          </InternalLink>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
