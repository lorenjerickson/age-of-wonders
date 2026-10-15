import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
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
  traitModifierOwner,
  modifierOperations,
  modifierStacking,
  newTraitModifier,
  parseTraitModifierRoute,
  traitModifiersPatch,
} from "./itemTraitModifiersModel";
import { OperandFields } from "./ComparisonPrerequisiteFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function ModifierFields({
  value,
  onChange,
  recordIds,
  definitions = [],
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const update = (key: string, next: MechanicsObject[string]) =>
    onChange({ ...value, [key]: next });
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const textField = (key: string, label: string) =>
    protectedComparisonText(value[key], recordIds) ? (
      <section className="space-y-3">
        <p>Existing {label.toLowerCase()} reference preserved.</p>
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (
              window.confirm(
                `Replace the existing ${label.toLowerCase()} reference?`,
              )
            )
              update(key, "");
          }}
        >
          Replace {label.toLowerCase()}
        </Button>
      </section>
    ) : (
      <Field label={label}>
        <Input
          className="min-h-11"
          value={text(value[key])}
          onChange={(e) => update(key, e.target.value)}
        />
      </Field>
    );
  return (
    <div className="space-y-5">
      {textField("target", "Target path")}
      <Field label="Operation" required>
        <Select
          className="min-h-11"
          required
          value={
            modifierOperations.includes(text(value.operation))
              ? text(value.operation)
              : ""
          }
          onChange={(e) => update("operation", e.target.value)}
        >
          <option value="" disabled>
            Select operation
          </option>
          {modifierOperations.map((operation) => (
            <option key={operation} value={operation}>
              {operation}
            </option>
          ))}
        </Select>
      </Field>
      {value.value === undefined ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => update("value", { kind: "constant", value: 0 })}
        >
          Add value
        </Button>
      ) : (
        <>
          <OperandFields
            side="Modifier value"
            definitions={definitions}
            operand={value.value}
            recordIds={recordIds}
            onChange={(next) => update("value", next)}
          />
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              if (window.confirm("Remove this modifier value?"))
                remove("value");
            }}
          >
            Remove value
          </Button>
        </>
      )}
      <Field label="Priority">
        <Input
          className="min-h-11"
          type="number"
          step="any"
          value={typeof value.priority === "number" ? value.priority : ""}
          onChange={(e) =>
            e.target.value === ""
              ? remove("priority")
              : update("priority", e.target.valueAsNumber)
          }
        />
      </Field>
      <Field label="Stacking">
        <Select
          className="min-h-11"
          value={text(value.stacking)}
          onChange={(e) =>
            e.target.value === ""
              ? remove("stacking")
              : update("stacking", e.target.value)
          }
        >
          <option value="">Unspecified</option>
          {value.stacking !== undefined &&
            !modifierStacking.includes(text(value.stacking)) && (
              <option value={text(value.stacking)} disabled>
                Existing stacking preserved
              </option>
            )}
          {modifierStacking.map((stacking) => (
            <option key={stacking} value={stacking}>
              {stacking}
            </option>
          ))}
        </Select>
      </Field>
      {textField("sourceLabel", "Source label")}
      {value.sourceLabel !== undefined && (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (window.confirm("Remove this source label?"))
              remove("sourceLabel");
          }}
        >
          Remove source label
        </Button>
      )}
      {value.predicate !== undefined && (
        <p>Existing predicate preserved when saving these fields.</p>
      )}
    </div>
  );
}
export function ItemTraitModifiersPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <ModifiersScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function ModifiersScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseTraitModifierRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}/${route?.traitPath ?? "traits"}`;
  const traitHref = `${base}${suffix}`,
    modifiersBase = `${base}/modifiers`,
    listingHref = `${modifiersBase}${suffix}`;
  let issue = "",
    trait: MechanicsObject | undefined,
    modifiers: MechanicsObject[] = [];
  try {
    if (route) {
      ({ trait, modifiers } = traitModifierOwner(components, route));
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const isNew = route?.modifierId === "new",
    isForm = route?.modifierId !== undefined,
    index =
      isNew || !isForm
        ? -1
        : modifiers.findIndex((entry) => entry.id === route.modifierId),
    existing = modifiers[index];
  const [form, setForm] = useState<MechanicsObject>(
    () => existing ?? newTraitModifier(),
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
      !trait ||
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
            traitModifiersPatch(components, route, next),
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
        ? [...modifiers, form]
        : modifiers.map((c, i) => (i === index ? form : c)),
    );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !trait ||
    issue ||
    (isForm && !isNew && !existing)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Trait or Modifier is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={traitHref}>
          Back to Trait
        </RouterButtonLink>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(trait, "Trait")} · Modifiers
      </h1>
      <RouterButtonLink className="min-h-11" href={traitHref}>
        Back to Trait
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add Modifier" : `Edit Modifier ${index + 1}`}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            <ModifierFields
              definitions={prerequisiteDefinitionOptions(draft.records)}
              value={form}
              onChange={setForm}
              recordIds={
                new Set(draft.records.map((record) => record.sourceId))
              }
            />
            {!isNew && (
              <RouterButtonLink
                className="min-h-11"
                href={`${modifiersBase}/${encodeURIComponent(String(existing.id))}/predicate${suffix}`}
              >
                Manage Predicate
              </RouterButtonLink>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="min-h-11">
                {save.saving ? "Saving…" : "Save Modifier"}
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    if (window.confirm("Remove this Modifier?"))
                      void persist(modifiers.filter((_, i) => i !== index));
                  }}
                >
                  Remove Modifier
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
        <section className="space-y-4" aria-label="Modifiers">
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${modifiersBase}/new${suffix}`}
            >
              Add Modifier
            </RouterButtonLink>
          )}
          {!modifiers.length && <p>No modifiers yet.</p>}
          <ol className="space-y-4">
            {modifiers.map((modifier, i) => (
              <li
                key={String(modifier.id)}
                className="space-y-3 rounded border p-4"
              >
                <RouterButtonLink
                  className="min-h-11"
                  href={`${modifiersBase}/${encodeURIComponent(String(modifier.id))}${suffix}`}
                >
                  Modifier {i + 1} ·{" "}
                  {modifierOperations.includes(text(modifier.operation))
                    ? text(modifier.operation)
                    : "Advanced modifier"}
                </RouterButtonLink>
                <div className="flex flex-wrap gap-3">
                  {([-1, 1] as const).map((delta) => (
                    <Button
                      key={delta}
                      type="button"
                      className="min-h-11"
                      disabled={
                        disabled ||
                        (delta === -1 ? i === 0 : i === modifiers.length - 1)
                      }
                      aria-label={`Move modifier ${i + 1} ${delta === -1 ? "up" : "down"}`}
                      onClick={() =>
                        void persist(moveEntry(modifiers, i, delta))
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
