import { createFileRoute } from "@tanstack/react-router";
import { CharacterDefinitionEditor } from "../WorldAuthoringPages";
import type { CharacterOptionKind } from "../characterOptionModel";

export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/$definitionKind/$definitionId",
)({ component: CharacterDefinitionRoute });

function CharacterDefinitionRoute() {
  const { definitionKind, definitionId } = Route.useParams();
  const kind = singularKind(definitionKind);
  if (!kind) return <Unavailable />;
  return (
    <CharacterDefinitionEditor
      key={`${kind}:${definitionId}`}
      kind={kind}
      sourceId={definitionId === "new" ? undefined : definitionId}
    />
  );
}

function singularKind(
  value: string,
): Exclude<CharacterOptionKind, "heritage"> | undefined {
  return value === "skills"
    ? "skill"
    : value === "professions"
      ? "profession"
      : value === "backgrounds"
        ? "background"
        : undefined;
}

function Unavailable() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold">Character option unavailable</h1>
    </main>
  );
}
