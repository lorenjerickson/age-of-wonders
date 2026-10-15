import { ruleEffectKinds } from "./ruleEffectModel";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import { TriggerUsageLimitFields } from "./TriggerUsageLimitFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
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
import {
  effectEntries,
  moveEntry,
  newRuleEffect,
} from "./itemActionOutcomesModel";
import { EffectFields } from "./ItemActionOutcomesPage";
import {
  parseTraitTriggerRoute,
  traitTriggerOwner,
  traitTriggersPatch,
  triggerEvents,
} from "./itemTraitTriggersModel";
const text = (v: unknown) => (typeof v === "string" ? v : "");
const kinds: readonly string[] = ruleEffectKinds;
function without(value: MechanicsObject, key: string) {
  const next = { ...value };
  delete next[key];
  return next;
}
export function TriggerFields({
  value,
  onChange,
  recordIds,
  definitions = [],
}: {
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
}) {
  const update = (key: string, next: MechanicsObject[string]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="space-y-5">
      <Field label="Event" required>
        <Select
          required
          className="min-h-11"
          value={
            triggerEvents.includes(text(value.event)) ? text(value.event) : ""
          }
          onChange={(e) => update("event", e.target.value)}
        >
          <option value="" disabled>
            Select event
          </option>
          {triggerEvents.map((event) => (
            <option key={event} value={event}>
              {event}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Custom event">
        {protectedComparisonText(value.customEvent, recordIds) ? (
          <div className="space-y-3">
            <p>Existing custom event reference preserved.</p>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                if (
                  window.confirm("Replace the existing custom event reference?")
                )
                  update("customEvent", "");
              }}
            >
              Replace custom event
            </Button>
          </div>
        ) : (
          <Input
            className="min-h-11"
            value={text(value.customEvent)}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? { ...value, customEvent: e.target.value }
                  : without(value, "customEvent"),
              )
            }
          />
        )}
      </Field>
      <Field label="Timing">
        <Select
          className="min-h-11"
          value={text(value.timing)}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { ...value, timing: e.target.value }
                : without(value, "timing"),
            )
          }
        >
          <option value="">Not specified</option>
          {["before", "replace", "after"].map((timing) => (
            <option key={timing} value={timing}>
              {timing}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Optional">
        <Select
          className="min-h-11"
          value={value.optional === undefined ? "" : String(value.optional)}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { ...value, optional: e.target.value === "true" }
                : without(value, "optional"),
            )
          }
        >
          <option value="">Not specified</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </Field>
      <Field label="Priority">
        <Input
          className="min-h-11"
          type="number"
          step="any"
          value={typeof value.priority === "number" ? value.priority : ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { ...value, priority: e.target.valueAsNumber }
                : without(value, "priority"),
            )
          }
        />
      </Field>
      <TriggerUsageLimitFields
        value={value}
        onChange={onChange}
        recordIds={recordIds}
        definitions={definitions}
      />
      {value.predicate !== undefined && <p>Existing predicate preserved.</p>}
    </div>
  );
}
export function ItemTraitTriggersPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <TriggersScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function TriggersScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseTraitTriggerRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const recordIds = new Set(
    draft?.records.map((record) => record.sourceId) ?? [],
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}`;
  const traitHref = `${base}/${route?.traitPath ?? "traits"}${suffix}`,
    triggersBase = `${base}/${route?.traitPath ?? "traits"}/triggers`;
  let issue = "",
    trait: MechanicsObject | undefined,
    triggers: MechanicsObject[] = [],
    effects: MechanicsObject[] = [];
  try {
    if (route) {
      const owner = traitTriggerOwner(components, route);
      trait = owner.trait;
      triggers = owner.triggers;
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const triggerIndex =
      route?.triggerIndex === undefined || route.triggerIndex === "new"
        ? -1
        : Number(route.triggerIndex),
    trigger = triggers[triggerIndex];
  try {
    if (trigger) effects = effectEntries(trigger.effects);
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const effectIndex =
      route?.effectIndex === undefined || route.effectIndex === "new"
        ? -1
        : Number(route.effectIndex),
    effect = effects[effectIndex];
  const effectsBase = `${triggersBase}/${encodeURIComponent(route?.triggerIndex ?? "")}/effects`;
  const listingHref = `${route?.effects ? effectsBase : triggersBase}${suffix}`;
  const isForm = Boolean(
    route?.effects ? route.effectIndex : route?.triggerIndex,
  );
  const isNew =
    (route?.effects ? route.effectIndex : route?.triggerIndex) === "new";
  const [form, setForm] = useState<MechanicsObject>(() =>
    route?.effects
      ? (effect ?? newRuleEffect("narrative"))
      : (trigger ?? { event: "turn-start", effects: [] }),
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
  async function persist(next: MechanicsObject[], destination: string) {
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
            traitTriggersPatch(components, route, next),
          ),
          itemId,
        );
        adoptDraft({ ...updated, effectiveModels: draft.effectiveModels });
        setRevision(updated.storageRevision);
        save.markSaved(JSON.stringify(form));
        if (isForm) {
          leaving.current = true;
          await navigate(destination);
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
  const withEffects = (next: MechanicsObject[]) =>
    triggers.map((o, i) => (i === triggerIndex ? { ...o, effects: next } : o));
  function submit(e: FormEvent) {
    e.preventDefault();
    void persist(
      route?.effects
        ? withEffects(
            isNew
              ? [...effects, form]
              : effects.map((v, i) => (i === effectIndex ? form : v)),
          )
        : isNew
          ? [...triggers, form]
          : triggers.map((v, i) => (i === triggerIndex ? form : v)),
      listingHref,
    );
  }
  function remove() {
    if (
      window.confirm(
        `Remove this ${route?.effects ? "Effect" : "Trigger and its Effects"}?`,
      )
    )
      void persist(
        route?.effects
          ? withEffects(effects.filter((_, i) => i !== effectIndex))
          : triggers.filter((_, i) => i !== triggerIndex),
        listingHref,
      );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !trait ||
    issue ||
    (route.triggerIndex && route.triggerIndex !== "new" && !trigger) ||
    (route.effects && !trigger) ||
    (route.effectIndex && !isNew && !effect)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Trait or record is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={traitHref}>
          Back to Trait
        </RouterButtonLink>
      </main>
    );
  const collection = route.effects ? effects : triggers,
    noun = route.effects ? "Effect" : "Trigger";
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(trait, "Trait")} ·{" "}
        {route.effects ? `Trigger ${triggerIndex + 1} Effects` : "Triggers"}
      </h1>
      <RouterButtonLink
        className="min-h-11"
        href={
          route.effects
            ? `${triggersBase}/${encodeURIComponent(route.triggerIndex!)}${suffix}`
            : traitHref
        }
      >
        Back to {route.effects ? "Trigger" : "Trait"}
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add" : "Edit"} {noun}
            {!isNew
              ? ` ${(route.effects ? effectIndex : triggerIndex) + 1}`
              : ""}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            {route.effects ? (
              <EffectFields
                value={form}
                onChange={setForm}
                isNew={isNew}
                recordIds={recordIds}
                definitions={prerequisiteDefinitionOptions(draft.records)}
                renderCollection={(key, label) =>
                  isNew ? (
                    <p>Save this Effect before editing {label}.</p>
                  ) : (
                    <RouterButtonLink
                      className="min-h-11"
                      href={`${base}/${route.traitPath}/triggers/${triggerIndex}/rule/effects/${effectIndex}/${key}${suffix}`}
                    >
                      Manage {label}
                    </RouterButtonLink>
                  )
                }
                renderDetail={(key, label) =>
                  isNew ? (
                    <p>Save this Effect before editing {label}.</p>
                  ) : (
                    <RouterButtonLink
                      className="min-h-11"
                      href={`${base}/${route.traitPath}/triggers/${triggerIndex}/rule/effects/${effectIndex}/${key}${suffix}`}
                    >
                      Manage {label}
                    </RouterButtonLink>
                  )
                }
              />
            ) : (
              <TriggerFields
                definitions={prerequisiteDefinitionOptions(draft.records)}
                value={form}
                onChange={setForm}
                recordIds={recordIds}
              />
            )}
            <div className="flex flex-wrap gap-3">
              {(!route.effects || kinds.includes(text(form.kind))) && (
                <Button type="submit" className="min-h-11">
                  {save.saving ? "Saving…" : `Save ${noun}`}
                </Button>
              )}
              {!isNew && (
                <Button type="button" className="min-h-11" onClick={remove}>
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
          {!route.effects && !isNew && (
            <div className="flex flex-wrap gap-3">
              <RouterButtonLink
                className="min-h-11"
                href={`${effectsBase}${suffix}`}
              >
                Manage Effects
              </RouterButtonLink>
              <RouterButtonLink
                className="min-h-11"
                href={`${triggersBase}/${triggerIndex}/predicate${suffix}`}
              >
                Manage Predicate
              </RouterButtonLink>
            </div>
          )}
        </form>
      ) : (
        <section className="space-y-4" aria-label={`${noun}s`}>
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${route.effects ? effectsBase : triggersBase}/new${suffix}`}
            >
              Add {noun}
            </RouterButtonLink>
          )}
          {!collection.length && <p>No {noun.toLowerCase()}s yet.</p>}
          <ol className="space-y-4">
            {collection.map((entry, i) => (
              <li key={i} className="space-y-3 rounded border p-4">
                <RouterButtonLink
                  className="min-h-11"
                  href={`${route.effects ? effectsBase : triggersBase}/${i}${suffix}`}
                >
                  {noun} {i + 1}
                  {route.effects
                    ? ` · ${kinds.includes(text(entry.kind)) ? text(entry.kind) : "Advanced effect"}`
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
                        (delta === -1 ? i === 0 : i === collection.length - 1)
                      }
                      aria-label={`Move ${noun.toLowerCase()} ${i + 1} ${delta === -1 ? "up" : "down"}`}
                      onClick={() =>
                        void persist(
                          route.effects
                            ? withEffects(moveEntry(effects, i, delta))
                            : moveEntry(triggers, i, delta),
                          listingHref,
                        )
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
