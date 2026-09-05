import { createFileRoute, useLoaderData } from "@tanstack/react-router";

export const Route = createFileRoute("/_gm/worlds/$worldId/characters")({
  component: WorldCharactersLanding,
});

function WorldCharactersLanding() {
  const world = useLoaderData({ from: "/_gm/worlds/$worldId" });
  const worldName = world.found
    ? world.definition.name?.trim() || "Unnamed World Definition"
    : "this World";
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {worldName}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Characters</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-base-content/65">
        Skills, Professions, Backgrounds, Heritages, and editable character
        models will be organized here through progressive disclosure.
      </p>
      <div className="alert mt-10 max-w-2xl border border-base-300 bg-base-200">
        <span>
          Advanced model and taxonomy editing is not enabled in this slice.
          Existing definitions remain unchanged.
        </span>
      </div>
    </main>
  );
}
