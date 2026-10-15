import { ScalarExpressionFields } from "./RuleValueFields";
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
  mechanicsEntries,
  mechanicsId,
  mechanicsName,
  mechanicsObject,
  mechanicsOwner,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { effectEntries, moveEntry } from "./itemActionOutcomesModel";
import {
  actionCostsPatch,
  isOpaqueItemBinding,
  costKinds,
  newActionCost,
  parseCostRoute,
} from "./itemActionCostsModel";
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
export function CostFields({
  value,
  onChange,
  isNew,
  recordIds,
  definitions = [],
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  isNew: boolean;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const kind = text(value.kind),
    cost = mechanicsObject(value.cost),
    distance = mechanicsObject(value.distance);
  const protectedBinding = (binding: unknown) =>
    isOpaqueItemBinding(binding) ||
    (typeof binding === "string" && recordIds.has(binding));
  const update = (key: string, next: MechanicsObject[string]) =>
    onChange({ ...value, [key]: next });
  const optionalNumber = (key: string, next: number | string) =>
    onChange(next === "" ? without(value, key) : { ...value, [key]: next });
  if (!costKinds.includes(kind))
    return (
      <Alert tone="warning">
        This advanced Cost is read only here. Its data is preserved; you can
        reorder or explicitly remove it.
      </Alert>
    );
  return (
    <div className="space-y-5">
      <Field label="Cost kind">
        <Select
          className="min-h-11"
          disabled={!isNew}
          value={kind}
          onChange={(e) => onChange(newActionCost(e.target.value))}
        >
          {costKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "economy" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Activation" required>
            <Select
              required
              className="min-h-11"
              value={text(value.activation)}
              onChange={(e) => update("activation", e.target.value)}
            >
              <option value="" disabled>
                Select activation
              </option>
              {[
                "action",
                "bonus-action",
                "reaction",
                "free-action",
                "movement",
                "legendary-action",
                "lair-action",
                "mythic-action",
                "special",
                "passive",
              ].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <NumericField
            label="Count"
            optional
            value={value.count}
            onChange={(n) => optionalNumber("count", n)}
          />
        </div>
      )}
      {kind === "resource" && (
        <>
          {protectedBinding(cost.resource) ? (
            <section className="space-y-3">
              <p>Existing resource reference preserved.</p>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace the existing resource reference with an authored binding?",
                    )
                  )
                    update("cost", { ...cost, resource: "" });
                }}
              >
                Replace resource binding
              </Button>
            </section>
          ) : (
            <Field
              label="Resource binding"
              help="Use the authored resource binding expected by this Action."
            >
              <Input
                className="min-h-11"
                value={text(cost.resource)}
                onChange={(e) =>
                  update("cost", { ...cost, resource: e.target.value })
                }
              />
            </Field>
          )}
          <ScalarExpressionFields
            label="Amount"
            value={cost.amount}
            numericOnly
            onChange={(amount) => update("cost", { ...cost, amount })}
            recordIds={recordIds}
            definitions={definitions}
          />
          <NumericField
            label="Minimum remaining"
            optional
            value={cost.minimumRemaining}
            onChange={(n) =>
              update(
                "cost",
                n === ""
                  ? without(cost, "minimumRemaining")
                  : { ...cost, minimumRemaining: n },
              )
            }
          />
        </>
      )}
      {kind === "capacity" && (
        <>
          <Field label="Band selection">
            <Select
              className="min-h-11"
              value={value.band === "chosen" ? "chosen" : "number"}
              onChange={(e) =>
                update("band", e.target.value === "chosen" ? "chosen" : 0)
              }
            >
              <option value="chosen">Chosen at use</option>
              <option value="number">Specific band</option>
            </Select>
          </Field>
          {value.band !== "chosen" && (
            <NumericField
              label="Band"
              value={value.band}
              onChange={(n) => update("band", n)}
            />
          )}
          {value.sourceId !== undefined && (
            <p>The existing capacity source is preserved.</p>
          )}
        </>
      )}
      {kind === "item-use" && (
        <>
          {protectedBinding(value.item) ? (
            <section className="space-y-3">
              <p>Existing item reference preserved.</p>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace the existing item reference with an authored binding?",
                    )
                  )
                    update("item", "");
                }}
              >
                Replace item binding
              </Button>
            </section>
          ) : (
            <Field
              label="Item binding"
              help="Use the authored item binding expected by this Action. This is not a catalog Item selector."
            >
              <Input
                className="min-h-11"
                value={text(value.item)}
                onChange={(e) => update("item", e.target.value)}
              />
            </Field>
          )}
          <NumericField
            label="Amount"
            optional
            value={value.amount}
            onChange={(n) => optionalNumber("amount", n)}
          />
        </>
      )}
      {kind === "hit-die" && (
        <NumericField
          label="Amount"
          value={value.amount}
          onChange={(n) => update("amount", n)}
        />
      )}
      {kind === "movement" && (
        <div className="grid gap-4 md:grid-cols-2">
          <NumericField
            label="Movement distance"
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
export function ItemActionCostsPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return <CostsScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />;
}
function CostsScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseCostRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}/${route?.actionPath ?? "actions"}`;
  const actionHref = `${base}${suffix}`,
    costsBase = `${base}/costs`,
    listingHref = `${costsBase}${suffix}`;
  let issue = "",
    action: MechanicsObject | undefined,
    costs: MechanicsObject[] = [];
  try {
    if (route) {
      action = mechanicsEntries(
        mechanicsOwner(components, route.action).actions,
      ).find((a) => mechanicsId(a) === route.action.childId);
      costs = effectEntries(mechanicsObject(action?.components).costs);
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const isNew = route?.costIndex === "new",
    isForm = route?.costIndex !== undefined,
    index = isNew || !isForm ? -1 : Number(route.costIndex),
    existing = costs[index];
  const [form, setForm] = useState<MechanicsObject>(
    () => existing ?? newActionCost("economy"),
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
            actionCostsPatch(components, route, next),
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
      isNew ? [...costs, form] : costs.map((c, i) => (i === index ? form : c)),
    );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !action ||
    issue ||
    (isForm && !isNew && !existing)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Action or Cost is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={actionHref}>
          Back to Action
        </RouterButtonLink>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(action, "Action")} · Costs
      </h1>
      <RouterButtonLink className="min-h-11" href={actionHref}>
        Back to Action
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add Cost" : `Edit Cost ${index + 1}`}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            <CostFields
              definitions={prerequisiteDefinitionOptions(draft.records)}
              value={form}
              onChange={setForm}
              isNew={isNew}
              recordIds={
                new Set(draft.records.map((record) => record.sourceId))
              }
            />
            <div className="flex flex-wrap gap-3">
              {costKinds.includes(text(form.kind)) && (
                <Button type="submit" className="min-h-11">
                  {save.saving ? "Saving…" : "Save Cost"}
                </Button>
              )}
              {!isNew && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    if (window.confirm("Remove this Cost?"))
                      void persist(costs.filter((_, i) => i !== index));
                  }}
                >
                  Remove Cost
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
        <section className="space-y-4" aria-label="Costs">
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${costsBase}/new${suffix}`}
            >
              Add Cost
            </RouterButtonLink>
          )}
          {!costs.length && <p>No costs yet.</p>}
          <ol className="space-y-4">
            {costs.map((cost, i) => (
              <li key={i} className="space-y-3 rounded border p-4">
                <RouterButtonLink
                  className="min-h-11"
                  href={`${costsBase}/${i}${suffix}`}
                >
                  Cost {i + 1} ·{" "}
                  {costKinds.includes(text(cost.kind))
                    ? text(cost.kind)
                    : "Advanced cost"}
                </RouterButtonLink>
                <div className="flex flex-wrap gap-3">
                  {([-1, 1] as const).map((delta) => (
                    <Button
                      key={delta}
                      type="button"
                      className="min-h-11"
                      disabled={
                        disabled ||
                        (delta === -1 ? i === 0 : i === costs.length - 1)
                      }
                      aria-label={`Move cost ${i + 1} ${delta === -1 ? "up" : "down"}`}
                      onClick={() => void persist(moveEntry(costs, i, delta))}
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
