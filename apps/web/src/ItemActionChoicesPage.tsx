import {
  JsonValueFields,
  RuleReferenceField,
  RuleTextField,
} from "./RuleValueFields";
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
  itemChoicesPatch,
  choiceEntries,
  choiceEntity,
  newChoice,
  newChoiceOption,
  parseChoiceRoute,
} from "./itemActionChoicesModel";
const text = (v: unknown) => (typeof v === "string" ? v : "");
function omit(value: MechanicsObject, key: string) {
  const next = { ...value };
  delete next[key];
  return next;
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: number | string) => void;
}) {
  return (
    <Field label={label} required>
      <Input
        className="min-h-11"
        type="number"
        step="any"
        required
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : e.target.valueAsNumber)
        }
      />
    </Field>
  );
}
export function ChoiceFields({
  value,
  onChange,
  recordIds = new Set<string>(),
  definitions = [],
}: {
  value: MechanicsObject;
  onChange: (v: MechanicsObject) => void;
  recordIds?: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const update = (key: string, next: MechanicsObject[string]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="space-y-5">
      <RuleTextField
        label="Prompt"
        value={value.prompt}
        onChange={(next) => update("prompt", next)}
        recordIds={recordIds}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <NumberField
          label="Minimum"
          value={value.minimum}
          onChange={(n) => update("minimum", n)}
        />
        <NumberField
          label="Maximum"
          value={value.maximum}
          onChange={(n) => update("maximum", n)}
        />
      </div>
      <Field label="Allow duplicates">
        <Select
          className="min-h-11"
          value={
            typeof value.allowDuplicates === "boolean"
              ? String(value.allowDuplicates)
              : ""
          }
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? omit(value, "allowDuplicates")
                : { ...value, allowDuplicates: e.target.value === "true" },
            )
          }
        >
          <option value="">Unspecified</option>
          <option value="true">Allowed</option>
          <option value="false">Not allowed</option>
        </Select>
      </Field>
      <Field label="Visibility">
        <Select
          className="min-h-11"
          value={text(value.visibility)}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? omit(value, "visibility")
                : { ...value, visibility: e.target.value },
            )
          }
        >
          <option value="">Unspecified</option>
          {["public", "controller", "gm"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <RuleReferenceField
        label="Option catalog"
        value={value.optionCatalog}
        onChange={(next) => update("optionCatalog", next)}
        recordIds={recordIds}
        definitions={definitions}
      />
      {value.optionCatalog !== undefined && (
        <Button
          className="min-h-11"
          type="button"
          onClick={() => {
            if (window.confirm("Remove option catalog?"))
              onChange(omit(value, "optionCatalog"));
          }}
        >
          Remove option catalog
        </Button>
      )}
    </div>
  );
}
export function OptionFields({
  value,
  onChange,
  recordIds,
  definitions = [],
}: {
  value: MechanicsObject;
  onChange: (v: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const [reference, setReference] = useState(
    typeof value.value === "string" &&
      definitions.some((d) => d.id === value.value),
  );
  return (
    <div className="space-y-5">
      <RuleTextField
        label="Label"
        value={value.label}
        onChange={(next) => onChange({ ...value, label: next })}
        recordIds={recordIds}
      />
      <Field label="Value mode">
        <Select
          className="min-h-11"
          value={reference ? "definition" : "value"}
          onChange={(e) => setReference(e.target.value === "definition")}
        >
          <option value="value">Authored value</option>
          <option value="definition">Definition reference</option>
        </Select>
      </Field>
      {reference ? (
        <RuleReferenceField
          label="Value definition"
          value={value.value}
          onChange={(next) => onChange({ ...value, value: next })}
          recordIds={recordIds}
          definitions={definitions}
        />
      ) : (
        <JsonValueFields
          label="Value"
          value={value.value}
          onChange={(next) => onChange({ ...value, value: next })}
          recordIds={recordIds}
          definitions={definitions}
        />
      )}
    </div>
  );
}
export function ItemActionChoicesPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <ChoicesScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function ChoicesScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseChoiceRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}/${route?.entityPath ?? "actions"}`,
    choicesBase = `${base}/choices`,
    choiceBase = `${choicesBase}/${encodeURIComponent(route?.choiceId ?? "")}`;
  const options = route?.options ?? false,
    collectionBase = options ? `${choiceBase}/options` : choicesBase,
    listingHref = `${collectionBase}${suffix}`,
    parentHref = `${options ? choiceBase : base}${suffix}`;
  let issue = "",
    entity: MechanicsObject | undefined,
    choices: MechanicsObject[] = [],
    choice: MechanicsObject | undefined,
    entries: MechanicsObject[] = [];
  try {
    if (route) {
      entity = choiceEntity(components, route);
      choices = choiceEntries(mechanicsObject(entity?.components).choices);
      choice = choices.find((c) => c.id === route.choiceId);
      entries = options ? choiceEntries(choice?.options) : choices;
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const id = options ? route?.optionId : route?.choiceId,
    isNew = id === "new",
    isForm = id !== undefined,
    existing = entries.find((v) => v.id === id),
    noun = options ? "Option" : "Choice",
    ownerNoun = route?.ownerKind === "trait" ? "Trait" : "Action";
  const [form, setForm] = useState<MechanicsObject>(
    () => existing ?? (options ? newChoiceOption() : newChoice()),
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
      issue ||
      (options && !choice)
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
            itemChoicesPatch(
              components,
              route,
              options
                ? choices.map((c) =>
                    c.id === choice!.id ? { ...c, options: next } : c,
                  )
                : next,
            ),
          ),
          itemId,
        );
        adoptDraft({ ...updated, effectiveModels: draft.effectiveModels });
        setRevision(updated.storageRevision);
        save.markSaved(JSON.stringify(form));
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
      isNew ? [...entries, form] : entries.map((v) => (v.id === id ? form : v)),
    );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !entity ||
    issue ||
    (options && !choice) ||
    (isForm && !isNew && !existing)
  )
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            `This ${ownerNoun}, Choice or Option is unavailable in the current draft. Nothing was changed.`}
        </Alert>
        <RouterButtonLink className="min-h-11" href={`${base}${suffix}`}>
          Back to {ownerNoun}
        </RouterButtonLink>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(entity, ownerNoun)} · {options ? "Options" : "Choices"}
      </h1>
      <RouterButtonLink className="min-h-11" href={parentHref}>
        Back to {options ? "Choice" : ownerNoun}
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add" : "Edit"} {noun}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            {options ? (
              <OptionFields
                value={form}
                onChange={setForm}
                recordIds={new Set(draft.records.map((r) => r.sourceId))}
                definitions={prerequisiteDefinitionOptions(draft.records)}
              />
            ) : (
              <ChoiceFields
                value={form}
                onChange={setForm}
                recordIds={new Set(draft.records.map((r) => r.sourceId))}
                definitions={prerequisiteDefinitionOptions(draft.records)}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="min-h-11">
                {save.saving ? "Saving…" : `Save ${noun}`}
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove this ${noun}${options ? "" : " and its options"}?`,
                      )
                    )
                      void persist(entries.filter((v) => v.id !== id));
                  }}
                >
                  Remove {noun}
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
          {options && !isNew && (
            <RouterButtonLink
              className="min-h-11"
              href={`${collectionBase}/${encodeURIComponent(id!)}/prerequisites${suffix}`}
            >
              Manage Prerequisites
            </RouterButtonLink>
          )}
          {!options && !isNew && (
            <RouterButtonLink
              className="min-h-11"
              href={`${choiceBase}/options${suffix}`}
            >
              Manage Options
            </RouterButtonLink>
          )}
        </form>
      ) : (
        <section
          className="space-y-4"
          aria-label={options ? "Options" : "Choices"}
        >
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${collectionBase}/new${suffix}`}
            >
              Add {noun}
            </RouterButtonLink>
          )}
          {!entries.length && <p>No {options ? "options" : "choices"} yet.</p>}
          <ol className="space-y-4">
            {entries.map((v, i) => (
              <li key={text(v.id)} className="space-y-3 rounded border p-4">
                <RouterButtonLink
                  className="min-h-11"
                  href={`${collectionBase}/${encodeURIComponent(text(v.id))}${suffix}`}
                >
                  {noun} {i + 1}
                  {text(options ? v.label : v.prompt)
                    ? ` · ${text(options ? v.label : v.prompt)}`
                    : ""}
                </RouterButtonLink>
                <div className="flex flex-wrap gap-3">
                  {([-1, 1] as const).map((delta) => (
                    <Button
                      key={delta}
                      type="button"
                      className="min-h-11"
                      disabled={
                        disabled ||
                        (delta === -1 ? i === 0 : i === entries.length - 1)
                      }
                      aria-label={`Move ${noun.toLowerCase()} ${i + 1} ${delta === -1 ? "up" : "down"}`}
                      onClick={() => void persist(moveEntry(entries, i, delta))}
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
