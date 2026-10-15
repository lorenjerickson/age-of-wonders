import type { WorldDraftRecord } from "./api";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";

export const characterAuthorKinds = ["profession", "background"] as const;
export type CharacterAuthorKind = (typeof characterAuthorKinds)[number];
export function characterAuthorKind(
  segment: string,
): CharacterAuthorKind | undefined {
  return characterAuthorKinds.find((kind) => `${kind}s` === segment);
}
export function characterAuthorTitle(kind: CharacterAuthorKind) {
  return kind[0].toUpperCase() + kind.slice(1);
}
export function characterAuthorBase(
  worldId: string,
  kind: CharacterAuthorKind,
) {
  return `/worlds/${encodeURIComponent(worldId)}/characters/${kind}s`;
}
export function characterAuthorRecord(
  records: readonly WorldDraftRecord[],
  kind: CharacterAuthorKind,
  id: string,
) {
  const matches = records.filter(
    (r) => r.resourceType === "definitions" && r.sourceId === id,
  );
  if (matches.length !== 1 || mechanicsObject(matches[0].payload).kind !== kind)
    throw new Error(
      "This Character option is unavailable or ambiguous. Existing content is preserved.",
    );
  const record = matches[0];
  const payload = mechanicsObject(record.payload);
  if (
    payload !== record.payload ||
    payload.identity !== mechanicsObject(payload.identity) ||
    payload.components !== mechanicsObject(payload.components) ||
    (payload.conformance !== undefined &&
      payload.conformance !== mechanicsObject(payload.conformance))
  )
    throw new Error(
      "This Character option contains unsupported data. Existing content is preserved.",
    );
  return record;
}
export function characterAuthorName(
  record: WorldDraftRecord,
  recordIds: ReadonlySet<string>,
  fallback = "Unnamed option",
) {
  const name = mechanicsObject(mechanicsObject(record.payload).identity).name;
  return typeof name === "string" &&
    name.trim() &&
    !protectedComparisonText(name, recordIds)
    ? name
    : fallback;
}
export function newCharacterAuthor(
  kind: CharacterAuthorKind,
  id: string,
): MechanicsObject {
  const components: MechanicsObject =
    kind === "profession"
      ? {
          expertiseOrder: [],
          expertiseLevels: [],
          acquisition: [],
          actions: [],
        }
      : {};
  return {
    kind,
    identity: {
      id,
      name: "",
      key: `custom:${kind}-${id}`,
      source: {
        namespace: "aow",
        edition: "homebrew:age-of-wonders",
        license: "private",
      },
    },
    components,
  };
}
