import { Alert } from "@aow/ui";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import type { WorldModelOption } from "./api";

/** Compatibility destinations retain the adopted definitions without World mutation controls. */
export function WorldModelEditor({
  kind,
}: {
  kind: "attributes" | "equipment-slots" | "profession-ranks";
  context?: string;
}) {
  const { draft } = useWorldAuthoring();
  const options =
    kind === "attributes"
      ? draft?.effectiveModels?.attributes
      : kind === "equipment-slots"
        ? draft?.effectiveModels?.equipmentSlots
        : draft?.effectiveModels?.professionRanks;
  return (
    <WorldModelReadOnly
      title={
        kind === "attributes"
          ? "Attributes"
          : kind === "equipment-slots"
            ? "Equipment slots"
            : "Profession ranks"
      }
      options={options ?? []}
    />
  );
}

export function WorldModelReadOnly({
  title,
  options,
}: {
  title: string;
  options: readonly WorldModelOption[];
}) {
  const { draft } = useWorldAuthoring();
  const ids = new Set(
    (draft?.effectiveModels?.elements ?? []).flatMap((option) =>
      [
        option.elementId,
        option.registryId,
        option.revisionId,
        option.sourceReleaseId,
      ].filter((id): id is string => Boolean(id)),
    ),
  );
  const label = (text: string, fallback: string) =>
    protectedComparisonText(text, ids) ? fallback : text;
  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-6 py-8 lg:px-10">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-4">
        These definitions are read only in World editing. Existing data remains
        available to Characters, Creatures and other World content.
      </p>
      {options.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <li
              key={option.key}
              className="rounded-box border border-base-300 p-4"
            >
              <h2 className="font-semibold">
                {label(option.name, "Unnamed definition")}
              </h2>
              {option.description && (
                <p className="mt-2">
                  {label(option.description, "Description unavailable")}
                </p>
              )}
              {option.payload?.valueMetadata &&
                typeof option.payload.valueMetadata === "object" &&
                !Array.isArray(option.payload.valueMetadata) && (
                  <dl className="mt-3 text-sm">
                    {[
                      ["aow:minimum", "Minimum"],
                      ["aow:maximum", "Maximum"],
                      ["aow:default", "Default"],
                    ].map(([key, title]) => {
                      const value = (
                        option.payload!.valueMetadata as Record<string, unknown>
                      )[key!];
                      return typeof value === "number" ? (
                        <div key={key} className="flex gap-2">
                          <dt>{title}</dt>
                          <dd>{value}</dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                )}
            </li>
          ))}
        </ul>
      ) : (
        <Alert className="mt-6">No adopted definitions are available.</Alert>
      )}
    </main>
  );
}
