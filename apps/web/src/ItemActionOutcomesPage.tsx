import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Field, Fieldset, Select } from "@aow/ui";
import { ApiRequestError, saveWorldItem } from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";
import { useEditorSave } from "./useEditorSave";
import {
  itemMechanicsSaveInput,
  mechanicsEntries,
  mechanicsId,
  mechanicsName,
  mechanicsObject,
  mechanicsOwner,
  type MechanicsObject,
} from "./itemMechanicsModel";
import {
  actionOutcomesPatch,
  effectEntries,
  moveEntry,
  newRuleEffect,
  outcomeEntries,
  parseOutcomeRoute,
} from "./itemActionOutcomesModel";
const text = (v: unknown) => (typeof v === "string" ? v : "");
import { EffectFields } from "./RuleEffectFields";
export { EffectFields } from "./RuleEffectFields";
import { ruleEffectKinds } from "./ruleEffectModel";
const kinds: readonly string[] = ruleEffectKinds;
function without(value: MechanicsObject, key: string) {
  const next = { ...value };
  delete next[key];
  return next;
}
export function ItemActionOutcomesPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <OutcomesScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function OutcomesScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseOutcomeRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}`;
  const actionHref = `${base}/${route?.actionPath ?? "actions"}${suffix}`,
    outcomesBase = `${base}/${route?.actionPath ?? "actions"}/outcomes`;
  let issue = "",
    action: MechanicsObject | undefined,
    outcomes: MechanicsObject[] = [],
    effects: MechanicsObject[] = [];
  try {
    if (route) {
      if (payload.components !== undefined && payload.components !== components)
        throw new Error(
          "This Item contains unsupported data. Existing data has been preserved.",
        );
      action = mechanicsEntries(
        mechanicsOwner(components, route.action).actions,
      ).find((a) => mechanicsId(a) === route.action.childId);
      if (
        action?.components !== undefined &&
        action.components !== mechanicsObject(action.components)
      )
        throw new Error(
          "This Action contains unsupported data. Existing data has been preserved.",
        );
      outcomes = outcomeEntries(mechanicsObject(action?.components).outcomes);
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const outcomeIndex = outcomes.findIndex((o) => o.id === route?.outcomeId),
    outcome = outcomes[outcomeIndex];
  try {
    if (outcome) effects = effectEntries(outcome.effects);
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const effectIndex =
      route?.effectIndex === undefined || route.effectIndex === "new"
        ? -1
        : Number(route.effectIndex),
    effect = effects[effectIndex];
  const effectsBase = `${outcomesBase}/${encodeURIComponent(route?.outcomeId ?? "")}/effects`;
  const listingHref = `${route?.effects ? effectsBase : outcomesBase}${suffix}`;
  const isForm = Boolean(route?.effects ? route.effectIndex : route?.outcomeId);
  const isNew =
    (route?.effects ? route.effectIndex : route?.outcomeId) === "new";
  const [form, setForm] = useState<MechanicsObject>(() =>
    route?.effects
      ? (effect ?? newRuleEffect("narrative"))
      : (outcome ?? { id: crypto.randomUUID(), effects: [] }),
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
      !action ||
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
            actionOutcomesPatch(components, route, next),
          ),
          itemId,
        );
        adoptDraft({ ...updated, effectiveModels: draft.effectiveModels });
        setRevision(updated.storageRevision);
        save.markSaved(JSON.stringify(form));
        leaving.current = true;
        await navigate(destination);
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
    outcomes.map((o, i) => (i === outcomeIndex ? { ...o, effects: next } : o));
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
          ? [...outcomes, form]
          : outcomes.map((v, i) => (i === outcomeIndex ? form : v)),
      listingHref,
    );
  }
  function remove() {
    if (
      window.confirm(
        `Remove this ${route?.effects ? "Effect" : "Outcome and its Effects"}?`,
      )
    )
      void persist(
        route?.effects
          ? withEffects(effects.filter((_, i) => i !== effectIndex))
          : outcomes.filter((_, i) => i !== outcomeIndex),
        listingHref,
      );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !action ||
    issue ||
    (route.outcomeId && route.outcomeId !== "new" && !outcome) ||
    (route.effects && !outcome) ||
    (route.effectIndex && !isNew && !effect)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Action or record is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={actionHref}>
          Back to Action
        </RouterButtonLink>
      </main>
    );
  const collection = route.effects ? effects : outcomes,
    noun = route.effects ? "Effect" : "Outcome";
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(action, "Action")} ·{" "}
        {route.effects ? `Outcome ${outcomeIndex + 1} Effects` : "Outcomes"}
      </h1>
      <RouterButtonLink
        className="min-h-11"
        href={
          route.effects
            ? `${outcomesBase}/${encodeURIComponent(route.outcomeId!)}${suffix}`
            : actionHref
        }
      >
        Back to {route.effects ? "Outcome" : "Action"}
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add" : "Edit"} {noun}
            {!isNew
              ? ` ${(route.effects ? effectIndex : outcomeIndex) + 1}`
              : ""}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            {route.effects ? (
              <EffectFields
                value={form}
                onChange={setForm}
                isNew={isNew}
                recordIds={new Set(draft.records.map((r) => r.sourceId))}
                definitions={prerequisiteDefinitionOptions(draft.records)}
                renderCollection={(key, label) =>
                  isNew ? (
                    <p>Save this Effect before editing {label}.</p>
                  ) : (
                    <RouterButtonLink
                      className="min-h-11"
                      href={`${base}/${route.actionPath}/rule/outcomes/${outcomeIndex}/effects/${effectIndex}/${key}${suffix}`}
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
                      href={`${base}/${route.actionPath}/rule/outcomes/${outcomeIndex}/effects/${effectIndex}/${key}${suffix}`}
                    >
                      Manage {label}
                    </RouterButtonLink>
                  )
                }
              />
            ) : (
              <>
                <Field label="Condition">
                  <Select
                    className="min-h-11"
                    value={
                      form.when === undefined
                        ? ""
                        : ["always", "never"].includes(
                              text(mechanicsObject(form.when).kind),
                            )
                          ? text(mechanicsObject(form.when).kind)
                          : "advanced"
                    }
                    onChange={(e) => {
                      if (e.target.value === "advanced") return;
                      if (
                        form.when !== undefined &&
                        !["always", "never"].includes(
                          text(mechanicsObject(form.when).kind),
                        ) &&
                        !window.confirm("Replace this advanced condition?")
                      )
                        return;
                      setForm(
                        e.target.value
                          ? {
                              ...form,
                              when: {
                                ...(["always", "never"].includes(
                                  text(mechanicsObject(form.when).kind),
                                )
                                  ? mechanicsObject(form.when)
                                  : {}),
                                kind: e.target.value,
                              },
                            }
                          : without(form, "when"),
                      );
                    }}
                  >
                    <option value="">Not specified</option>
                    <option value="always">Always</option>
                    <option value="never">Never</option>
                    {form.when !== undefined &&
                      !["always", "never"].includes(
                        text(mechanicsObject(form.when).kind),
                      ) && (
                        <option value="advanced">
                          Advanced condition (preserved)
                        </option>
                      )}
                  </Select>
                </Field>
                <p>
                  Use Manage Predicate to edit conditions and nested groups.
                  Existing conditions are preserved unless you explicitly
                  replace them.
                </p>
              </>
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
            <RouterButtonLink
              className="min-h-11"
              href={`${outcomesBase}/${encodeURIComponent(route.outcomeId!)}/predicate${suffix}`}
            >
              Manage Predicate
            </RouterButtonLink>
          )}
          {!route.effects && !isNew && (
            <RouterButtonLink
              className="min-h-11"
              href={`${effectsBase}${suffix}`}
            >
              Manage Effects
            </RouterButtonLink>
          )}
        </form>
      ) : (
        <section className="space-y-4" aria-label={`${noun}s`}>
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${route.effects ? effectsBase : outcomesBase}/new${suffix}`}
            >
              Add {noun}
            </RouterButtonLink>
          )}
          {!collection.length && <p>No {noun.toLowerCase()}s yet.</p>}
          <ol className="space-y-4">
            {collection.map((entry, i) => (
              <li
                key={route.effects ? i : text(entry.id)}
                className="space-y-3 rounded border p-4"
              >
                <RouterButtonLink
                  className="min-h-11"
                  href={`${route.effects ? effectsBase : outcomesBase}/${route.effects ? i : encodeURIComponent(text(entry.id))}${suffix}`}
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
                            : moveEntry(outcomes, i, delta),
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
