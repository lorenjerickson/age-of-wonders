import { CharacterAuthorPage } from "../CharacterAuthorPage";
import { characterAuthorKind } from "../characterAuthoringModel";
import { createFileRoute } from "@tanstack/react-router";
import { CharacterDefinitionsPage } from "../WorldAuthoringPages";
import type { CharacterOptionKind } from "../characterOptionModel";

export const Route = createFileRoute(
  "/_gm/worlds/$worldId/characters/$definitionKind/",
)({ component: CharacterDefinitionsRoute });

function CharacterDefinitionsRoute() {
  const { definitionKind } = Route.useParams();
  const authorKind = characterAuthorKind(definitionKind);
  if (authorKind) return <CharacterAuthorPage kind={authorKind} />;
  const kind = singularKind(definitionKind);
  if (!kind) return <Unavailable />;
  return <CharacterDefinitionsPage kind={kind} />;
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
      <h1 className="text-3xl font-semibold">Character library unavailable</h1>
      <p className="mt-4 text-base-content/60">
        Choose Skills, Professions, Backgrounds, or Models &amp; Taxonomies from
        Characters.
      </p>
    </main>
  );
}
