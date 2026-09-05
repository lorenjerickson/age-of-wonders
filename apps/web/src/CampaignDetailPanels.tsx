import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function CampaignUnavailable({
  kind,
}: {
  kind: "Definition" | "Instance";
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-xs font-semibold tracking-[0.18em] text-error uppercase">
        Campaign {kind} unavailable
      </p>
      <h1 className="mt-3 text-3xl font-semibold">
        This Campaign {kind} could not be opened
      </h1>
      <p className="mt-4 text-base-content/65">
        Return to the Campaign library to choose an available destination.
      </p>
      <Link className="btn btn-outline mt-7" to="/campaigns">
        Back to Campaigns
      </Link>
    </main>
  );
}

export function FactPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card border border-base-300 bg-base-200">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <dl className="mt-3 space-y-3">{children}</dl>
      </div>
    </section>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-base-300 pb-2 last:border-0">
      <dt className="text-sm text-base-content/50">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
