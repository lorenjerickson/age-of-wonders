import { ComparisonPrerequisiteFields } from "./ComparisonPrerequisiteFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { isOpaqueItemBinding } from "./itemActionCostsModel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Field, Fieldset, Input, Select } from "@aow/ui";
import { ApiRequestError, saveWorldItem } from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";
import { useEditorSave } from "./useEditorSave";
import {
  itemMechanicsSaveInput,
  mechanicsName,
  mechanicsObject,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { moveEntry } from "./itemActionOutcomesModel";
import {
  itemPrerequisitesPatch,
  compoundPrerequisiteKinds,
  prerequisiteCollection,
  prerequisiteOwner,
  prerequisiteRoot,
  prerequisiteEntity,
  prerequisiteKinds,
  prerequisiteFields,
  newActionPrerequisite,
  parsePrerequisiteRoute,
  prerequisiteDefinitionOptions,
  type PrerequisiteDefinitionOption,
} from "./itemActionPrerequisitesModel";
const text = (value: unknown) => (typeof value === "string" ? value : "");
function without(value: MechanicsObject, key: string) {
  const next = { ...value };
  delete next[key];
  return next;
}
function NumericField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | string) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label} required={!optional}>
      <Input
        className="min-h-11"
        type="number"
        step="any"
        required={!optional}
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : e.target.valueAsNumber)
        }
      />
    </Field>
  );
}
export function PrerequisiteFields({
  value,
  onChange,
  isNew,
  recordIds,
  definitions,
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  isNew: boolean;
  recordIds: ReadonlySet<string>;
  definitions: readonly PrerequisiteDefinitionOption[];
}) {
  const kind = text(value.kind),
    distance = mechanicsObject(value.distance);
  const update = (key: string, next: MechanicsObject[string]) =>
    onChange({ ...value, [key]: next });
  const definitionIndex = definitions.findIndex(
    (option) => option.id === value.definitionId,
  );
  if (!prerequisiteKinds.includes(kind))
    return (
      <Alert tone="warning">
        This advanced Prerequisite is read only here. Its data is preserved; you
        can reorder or explicitly remove it.
      </Alert>
    );
  return (
    <div className="space-y-5">
      <Field label="Prerequisite kind">
        <Select
          className="min-h-11"
          disabled={!isNew}
          value={kind}
          onChange={(e) => onChange(newActionPrerequisite(e.target.value))}
        >
          {prerequisiteKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>
      {(prerequisiteFields[kind] ?? []).length > 0 && (
        <p>Use the authored bindings and values expected by this Action.</p>
      )}
      {compoundPrerequisiteKinds.includes(kind) && (
        <p>
          {kind === "all"
            ? "All child prerequisites must be satisfied."
            : kind === "any"
              ? "At least one child prerequisite must be satisfied."
              : "The child prerequisite must not be satisfied."}
          {isNew
            ? " Save this prerequisite to manage its children."
            : " Manage nested prerequisites to edit its children."}
        </p>
      )}
      {kind === "compare" && (
        <ComparisonPrerequisiteFields
          definitions={definitions}
          value={value}
          onChange={onChange}
          recordIds={recordIds}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {kind === "has-definition" && (
          <Field
            label="Definition"
            help="Choose a definition from this World draft. Existing references remain unchanged until you choose a replacement."
          >
            <Select
              className="min-h-11 w-full min-w-0"
              value={definitionIndex < 0 ? "" : String(definitionIndex)}
              onChange={(e) => {
                const selected = definitions[Number(e.target.value)];
                if (!selected || selected.id === value.definitionId) return;
                if (
                  value.definitionId !== undefined &&
                  !window.confirm("Replace the existing definition reference?")
                )
                  return;
                update("definitionId", selected.id);
              }}
            >
              <option value="" disabled>
                {value.definitionId === undefined
                  ? "Select a definition"
                  : "Existing definition unavailable — preserved"}
              </option>
              {definitions.map((option, index) => (
                <option key={option.id} value={String(index)}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(prerequisiteFields[kind] ?? []).map((key) => {
          const label =
            key === "damageType"
              ? "Damage type"
              : key.charAt(0).toUpperCase() + key.slice(1);
          const optional = kind === "is-attuned" && key === "item";
          const protectedValue =
            (kind === "has-definition" &&
              protectedComparisonText(value[key], recordIds)) ||
            isOpaqueItemBinding(value[key]) ||
            (typeof value[key] === "string" && recordIds.has(value[key]));
          return (
            <section key={key} className="space-y-3">
              {protectedValue ? (
                <>
                  <p>Existing {label.toLowerCase()} reference preserved.</p>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Replace the existing ${label.toLowerCase()} reference with an authored binding?`,
                        )
                      )
                        update(key, "");
                    }}
                  >
                    Replace {label.toLowerCase()} binding
                  </Button>
                </>
              ) : (
                <Field
                  label={label}
                  help={
                    optional
                      ? "Optional item binding. Existing values are preserved until edited or cleared."
                      : undefined
                  }
                >
                  <Input
                    className="min-h-11"
                    value={text(value[key])}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </Field>
              )}
              {optional && value[key] !== undefined && (
                <Button
                  className="min-h-11"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Clear this optional item binding?"))
                      onChange(without(value, key));
                  }}
                >
                  Clear item binding
                </Button>
              )}
            </section>
          );
        })}
      </div>
      {kind === "within-distance" && (
        <div className="grid gap-4 md:grid-cols-2">
          <NumericField
            label="Distance"
            value={distance.value}
            onChange={(n) => update("distance", { ...distance, value: n })}
          />
          <Field label="Distance unit" required>
            <Select
              required
              className="min-h-11"
              value={text(distance.unit)}
              onChange={(e) =>
                update("distance", { ...distance, unit: e.target.value })
              }
            >
              <option value="" disabled>
                Select distance unit
              </option>
              {["foot", "mile", "square", "hex", "meter", "kilometer"].map(
                (k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ),
              )}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}
export function ItemActionPrerequisitesPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <PrerequisitesScreen
      key={`${itemId}/${path}`}
      itemId={itemId}
      path={path}
    />
  );
}
function PrerequisitesScreen({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parsePrerequisiteRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}/${route?.entityPath ?? "actions"}`;
  const ownerHref = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}/${route?.ownerPath ?? "actions"}${suffix}`,
    ownerNoun =
      route?.ownerKind === "outcome"
        ? "Outcome"
        : route?.ownerKind === "trigger"
          ? "Trigger"
          : route?.ownerKind === "modifier"
            ? "Modifier"
            : route?.ownerKind === "trait"
              ? "Trait"
              : route?.optionId === undefined
                ? "Action"
                : "Option",
    prerequisitesBase = `${base}/${route?.collectionPath ?? "prerequisites"}`,
    listingHref = `${prerequisitesBase}${suffix}`;
  let issue = "",
    entity: MechanicsObject | undefined,
    parent: MechanicsObject | undefined,
    owner: MechanicsObject | undefined,
    prerequisites: MechanicsObject[] = [];
  try {
    if (route) {
      if (payload.components !== undefined && payload.components !== components)
        throw new Error(
          "This Item contains unsupported data. Existing data has been preserved.",
        );
      entity = prerequisiteEntity(components, route);
      owner = prerequisiteOwner(entity, route);
      const collection = prerequisiteCollection(
        prerequisiteRoot(owner, route),
        route.parentIndices,
      );
      prerequisites = collection.entries;
      parent = collection.parent;
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const isPredicateRoot =
    (route?.ownerKind === "modifier" ||
      route?.ownerKind === "trigger" ||
      route?.ownerKind === "outcome") &&
    !route.parentIndices.length;
  const singular = isPredicateRoot ? "Predicate" : "Prerequisite";
  const singleton = isPredicateRoot || parent?.kind === "not";
  const isNew = route?.prerequisiteIndex === "new",
    isForm = route?.prerequisiteIndex !== undefined,
    index = isNew || !isForm ? -1 : Number(route.prerequisiteIndex),
    existing = prerequisites[index];
  const [form, setForm] = useState<MechanicsObject>(
    () => existing ?? newActionPrerequisite("always"),
  );
  const [revision, setRevision] = useState(draft?.storageRevision),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const save = useEditorSave(JSON.stringify(form)),
    leaving = useRef(false);
  useBlocker({
    shouldBlockFn: () =>
      !leaving.current &&
      (save.saving ||
        (save.hasChanges() &&
          !window.confirm("Leave without saving these changes?"))),
    enableBeforeUnload: save.dirty || save.saving,
  });
  useEffect(() => {
    if (save.dirty) markDirty();
  }, [save.dirty, markDirty]);
  const disabled = !canEdit || conflict || save.saving;
  async function persist(next: MechanicsObject[]) {
    if (
      !route ||
      !draft ||
      revision === undefined ||
      disabled ||
      !entity ||
      issue
    )
      return;
    await save.run(async () => {
      setError("");
      try {
        const updated = await saveWorldItem(
          definition.id,
          itemMechanicsSaveInput(
            payload,
            revision,
            itemPrerequisitesPatch(components, route, next),
          ),
          itemId,
        );
        adoptDraft({ ...updated, effectiveModels: draft.effectiveModels });
        setRevision(updated.storageRevision);
        save.markSaved(JSON.stringify(form));
        // List reorders stay mounted: do not leave its navigation guard bypassed.
        if (isForm) {
          leaving.current = true;
          await navigate(listingHref);
        }
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 409) {
          setConflict(true);
          setError(
            "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          );
        } else
          setError(
            "These changes could not be saved. Check the fields and try again.",
          );
      }
    });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void persist(
      isNew
        ? [...prerequisites, form]
        : prerequisites.map((c, i) => (i === index ? form : c)),
    );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !entity ||
    issue ||
    (isForm && !isNew && !existing) ||
    (isNew && singleton && prerequisites.length > 0)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            `This ${ownerNoun} or ${singular} is unavailable in the current draft. Nothing was changed.`}
        </Alert>
        <RouterButtonLink className="min-h-11" href={ownerHref}>
          Back to {ownerNoun}
        </RouterButtonLink>
      </main>
    );
  const parentHref = route.parentIndices.length
    ? `${prerequisitesBase.slice(0, -"/children".length)}${suffix}`
    : ownerHref;
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(
          entity,
          route.entity.collection === "traits" ? "Trait" : "Action",
        )}{" "}
        ·{" "}
        {route.optionId !== undefined &&
          `${typeof owner?.label === "string" && owner.label.trim() && !protectedComparisonText(owner.label, new Set(draft.records.map((r) => r.sourceId))) ? owner.label : "Option"} · `}
        {parent
          ? "Nested prerequisites"
          : isPredicateRoot
            ? "Predicate"
            : "Prerequisites"}
      </h1>
      <RouterButtonLink className="min-h-11" href={ownerHref}>
        Back to {ownerNoun}
      </RouterButtonLink>
      {parent && (
        <RouterButtonLink className="min-h-11" href={parentHref}>
          Back to parent Prerequisite
        </RouterButtonLink>
      )}
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew
              ? `Add ${singular}`
              : isPredicateRoot
                ? "Edit Predicate"
                : `Edit Prerequisite ${index + 1}`}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            <PrerequisiteFields
              value={form}
              onChange={setForm}
              isNew={isNew}
              recordIds={
                new Set(draft.records.map((record) => record.sourceId))
              }
              definitions={prerequisiteDefinitionOptions(draft.records)}
            />
            {!isNew && compoundPrerequisiteKinds.includes(text(form.kind)) && (
              <RouterButtonLink
                className="min-h-11"
                href={`${prerequisitesBase}/${index}/children${suffix}`}
              >
                Manage nested prerequisites
              </RouterButtonLink>
            )}
            <div className="flex flex-wrap gap-3">
              {prerequisiteKinds.includes(text(form.kind)) && (
                <Button type="submit" className="min-h-11">
                  {save.saving ? "Saving…" : `Save ${singular}`}
                </Button>
              )}
              {!isNew && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    if (window.confirm(`Remove this ${singular}?`))
                      void persist(prerequisites.filter((_, i) => i !== index));
                  }}
                >
                  Remove {singular}
                </Button>
              )}
            </div>
          </Fieldset>
          <Button
            type="button"
            className="min-h-11"
            disabled={save.saving}
            onClick={() => {
              leaving.current = true;
              void navigate(listingHref);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <section
          className="space-y-4"
          aria-label={isPredicateRoot ? "Predicate" : "Prerequisites"}
        >
          {canEdit && !(singleton && prerequisites.length > 0) && (
            <RouterButtonLink
              className="min-h-11"
              href={`${prerequisitesBase}/new${suffix}`}
            >
              Add {singular}
            </RouterButtonLink>
          )}
          {parent?.kind === "not" && (
            <p>
              This prerequisite negates one child. Remove its current child
              before adding a replacement.
            </p>
          )}
          {isPredicateRoot && (
            <p>
              {ownerNoun === "Outcome" ? "An" : "A"} {ownerNoun} has one
              optional predicate. Remove it to add a replacement.
            </p>
          )}
          {!prerequisites.length && (
            <p>
              {isPredicateRoot ? "No predicate yet." : "No prerequisites yet."}
            </p>
          )}
          <ol className="space-y-4">
            {prerequisites.map((prerequisite, i) => (
              <li key={i} className="space-y-3 rounded border p-4">
                <RouterButtonLink
                  className="min-h-11"
                  href={`${prerequisitesBase}/${i}${suffix}`}
                >
                  {isPredicateRoot ? "Predicate" : `Prerequisite ${i + 1}`} ·{" "}
                  {prerequisiteKinds.includes(text(prerequisite.kind))
                    ? text(prerequisite.kind)
                    : "Advanced prerequisite"}
                </RouterButtonLink>
                <div className="flex flex-wrap gap-3">
                  {!isPredicateRoot &&
                    ([-1, 1] as const).map((delta) => (
                      <Button
                        key={delta}
                        type="button"
                        className="min-h-11"
                        disabled={
                          disabled ||
                          (delta === -1
                            ? i === 0
                            : i === prerequisites.length - 1)
                        }
                        aria-label={`Move prerequisite ${i + 1} ${delta === -1 ? "up" : "down"}`}
                        onClick={() =>
                          void persist(moveEntry(prerequisites, i, delta))
                        }
                      >
                        {delta === -1 ? "Move up" : "Move down"}
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
