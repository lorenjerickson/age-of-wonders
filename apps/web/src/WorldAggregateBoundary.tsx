import { useLoaderData } from "@tanstack/react-router";
import { humanWorldName } from "./worldDefinitionModel";

export function WorldAggregateBoundary({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const world = useLoaderData({ from: "/_gm/worlds/$worldId" });
  const worldName = world.found
    ? humanWorldName(world.definition.name)
    : "This World Definition";
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {worldName}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-base-content/65">
        {description}
      </p>
      <div className="alert mt-10 max-w-2xl border border-base-300 bg-base-200">
        <span>
          Complete-revision editing for this World Definition collection is
          not enabled yet. The legacy mutable record editor is intentionally
          unavailable from this workspace.
        </span>
      </div>
    </main>
  );
}
