import { ItemOwnerPage } from "./ItemOwnerPage";
import { parseItemOwnerRoute } from "./itemOwnerModel";
import { RuleNodePage } from "./RuleNodePage";
import { parseRuleNodeRoute } from "./ruleNodeModel";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import { parseTraitTriggerRoute } from "./itemTraitTriggersModel";
import { ItemTraitTriggersPage } from "./ItemTraitTriggersPage";
import { parseTraitGrantRoute } from "./itemTraitGrantsModel";
import { ItemTraitGrantsPage } from "./ItemTraitGrantsPage";
import { parseTraitModifierRoute } from "./itemTraitModifiersModel";
import { ItemTraitModifiersPage } from "./ItemTraitModifiersPage";
import { parsePrerequisiteRoute } from "./itemActionPrerequisitesModel";
import { ItemActionPrerequisitesPage } from "./ItemActionPrerequisitesPage";
import { parseChoiceRoute } from "./itemActionChoicesModel";
import { ItemActionChoicesPage } from "./ItemActionChoicesPage";
import { parseCostRoute } from "./itemActionCostsModel";
import { ItemActionCostsPage } from "./ItemActionCostsPage";
import { parseOutcomeRoute } from "./itemActionOutcomesModel";
import { ItemActionOutcomesPage } from "./ItemActionOutcomesPage";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Fieldset } from "@aow/ui";
import { ApiRequestError, saveWorldItem } from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";
import { useEditorSave } from "./useEditorSave";
import { ItemDefinitionFields, VehicleFields } from "./ItemMechanicsFields";
import {
  itemMechanicsSaveInput,
  mechanicsEntries,
  mechanicsId,
  mechanicsName,
  mechanicsObject,
  mechanicsOwner,
  mechanicsPatch,
  newItemMechanic,
  parseMechanicsRoute,
  type MechanicsObject,
} from "./itemMechanicsModel";

export function ItemMechanicsPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  if (parseItemOwnerRoute(path))
    return <ItemOwnerPage itemId={itemId} path={path} />;
  if (parseRuleNodeRoute(path))
    return <RuleNodePage itemId={itemId} path={path} />;
  if (parseTraitTriggerRoute(path))
    return <ItemTraitTriggersPage itemId={itemId} path={path} />;
  if (parseTraitGrantRoute(path))
    return <ItemTraitGrantsPage itemId={itemId} path={path} />;
  if (parseTraitModifierRoute(path))
    return <ItemTraitModifiersPage itemId={itemId} path={path} />;
  if (parsePrerequisiteRoute(path))
    return <ItemActionPrerequisitesPage itemId={itemId} path={path} />;
  if (parseChoiceRoute(path))
    return <ItemActionChoicesPage itemId={itemId} path={path} />;
  if (parseCostRoute(path))
    return <ItemActionCostsPage itemId={itemId} path={path} />;
  if (parseOutcomeRoute(path))
    return <ItemActionOutcomesPage itemId={itemId} path={path} />;
  return (
    <MechanicsScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function MechanicsScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const route = parseMechanicsRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  const recordIds = new Set(
    draft?.records.map((record) => record.sourceId) ?? [],
  );
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}`;
  const listPath = route?.traitId
    ? `traits/${encodeURIComponent(route.traitId)}/actions`
    : route?.vehicleActions
      ? "vehicle/actions"
      : (route?.collection ?? "");
  const listHref = `${base}/${listPath}${suffix}`;
  const itemHref = `${base}${suffix}`;
  let issue = "";
  let entries: MechanicsObject[] = [];
  let owner: MechanicsObject = {};
  try {
    if (route) {
      if (payload.components !== undefined && payload.components !== components)
        throw new Error(
          "This Item contains unsupported components. Its existing data has been preserved.",
        );
      owner = mechanicsOwner(components, route);
      if (route.collection !== "vehicle")
        entries = mechanicsEntries(owner[route.collection]);
    }
  } catch (error) {
    issue =
      error instanceof Error
        ? error.message
        : "This collection cannot be edited.";
  }
  const existing = entries.find((e) => mechanicsId(e) === route?.childId);
  if (
    route?.collection === "actions" &&
    existing?.components !== undefined &&
    existing.components !== mechanicsObject(existing.components)
  )
    issue =
      "This Action contains unsupported components. Its existing data has been preserved.";
  const [form, setForm] = useState<MechanicsObject>(() =>
    route?.collection === "vehicle"
      ? { speeds: {}, ...mechanicsObject(components.vehicle) }
      : (existing ??
        newItemMechanic(route?.collection === "actions", crypto.randomUUID())),
  );
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  // Pin the revision to the data from which this form was opened. A newer draft
  // must never make a stale child form appear safe to submit.
  const [revision] = useState(draft?.storageRevision);
  const save = useEditorSave(JSON.stringify(form));
  const leaving = useRef(false);
  const isForm = route?.collection === "vehicle" || Boolean(route?.childId);
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
  async function persist(
    value: Parameters<typeof mechanicsPatch>[2],
    destination: string,
  ) {
    if (!route || !draft || revision === undefined || disabled) return;
    await save.run(async () => {
      setError("");
      try {
        const saved = await saveWorldItem(
          definition.id,
          itemMechanicsSaveInput(
            payload,
            revision,
            mechanicsPatch(components, route, value),
          ),
          itemId,
        );
        adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
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
            e instanceof ApiRequestError
              ? "These changes could not be saved. Check the fields and try again."
              : e instanceof Error
                ? e.message
                : "These changes could not be saved.",
          );
      }
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!route) return;
    void persist(
      route.collection === "vehicle"
        ? form
        : route.childId === "new"
          ? [...entries, form]
          : entries.map((e) => (mechanicsId(e) === route.childId ? form : e)),
      route.collection === "vehicle" ? itemHref : listHref,
    );
  }
  function remove() {
    if (!route) return;
    const label =
      route.collection === "vehicle"
        ? "Vehicle details"
        : mechanicsName(existing, "this record");
    if (
      window.confirm(
        `Remove ${label} from this Item?${route.collection === "vehicle" ? " Its Vehicle Actions will also be removed." : route.collection === "traits" ? " Its owned Actions will also be removed." : ""}`,
      )
    )
      void persist(
        route.collection === "vehicle"
          ? null
          : entries.filter((e) => mechanicsId(e) !== route.childId),
        route.collection === "vehicle" ? itemHref : listHref,
      );
  }
  const title =
    route?.collection === "vehicle"
      ? "Vehicle"
      : route?.collection === "traits"
        ? "Traits"
        : "Actions";
  const actionLabel = route?.collection === "traits" ? "Trait" : "Action";
  if (
    !draft ||
    !item ||
    !route ||
    issue ||
    (route.childId && route.childId !== "new" && !existing)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Item or record is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink href={itemHref} className="mt-4 min-h-11">
          Back to Item
        </RouterButtonLink>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(payload, "Item")} · {title}
      </h1>
      <nav aria-label="Item mechanics" className="my-5 flex flex-wrap gap-2">
        <RouterButtonLink href={itemHref} className="min-h-11">
          Overview
        </RouterButtonLink>
        {(["traits", "actions", "vehicle", "owner"] as const).map((key) => (
          <RouterButtonLink
            key={key}
            href={`${base}/${key}${suffix}`}
            className="min-h-11"
          >
            {key === "traits"
              ? "Traits"
              : key === "actions"
                ? "Actions"
                : key === "vehicle"
                  ? "Vehicle"
                  : "Item rules"}
          </RouterButtonLink>
        ))}
      </nav>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && (
        <Alert tone="error" className="my-4">
          {error}
        </Alert>
      )}
      {isForm ? (
        <form onSubmit={submit} className="space-y-6">
          <h2 className="text-xl font-semibold">
            {route.collection === "vehicle"
              ? "Vehicle details"
              : route.childId === "new"
                ? `Add ${actionLabel}`
                : `Edit ${mechanicsName(existing, actionLabel)}`}
          </h2>
          <Fieldset disabled={disabled} className="space-y-6">
            {route.collection === "vehicle" ? (
              <VehicleFields
                value={form}
                onChange={setForm}
                itemOptions={draft.records
                  .filter(
                    (r) =>
                      r.resourceType === "definitions" &&
                      mechanicsObject(r.payload).kind === "item" &&
                      r.sourceId !== itemId,
                  )
                  .map((r) => ({
                    id: r.sourceId,
                    name: mechanicsName(r.payload, "Unnamed Item"),
                  }))}
              />
            ) : (
              <ItemDefinitionFields
                value={form}
                onChange={setForm}
                action={route.collection === "actions"}
                recordIds={recordIds}
                definitions={prerequisiteDefinitionOptions(draft.records)}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="min-h-11">
                {save.saving
                  ? "Saving…"
                  : `Save ${route.collection === "vehicle" ? "Vehicle" : actionLabel}`}
              </Button>

              {(existing ||
                (route.collection === "vehicle" && components.vehicle)) && (
                <Button type="button" className="min-h-11" onClick={remove}>
                  Remove{" "}
                  {route.collection === "vehicle" ? "Vehicle" : actionLabel}
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
              void navigate(
                route.collection === "vehicle" ? itemHref : listHref,
              );
            }}
          >
            Cancel
          </Button>
          {route.collection === "actions" && existing && (
            <>
              <RouterButtonLink
                className="min-h-11"
                href={`${base}/${path}/rule/targets${suffix}`}
              >
                Manage Targets
              </RouterButtonLink>
              <RouterButtonLink
                href={`${base}/${listPath}/${encodeURIComponent(route.childId!)}/outcomes${suffix}`}
                className="min-h-11"
              >
                Manage Outcomes
              </RouterButtonLink>
            </>
          )}
          {route.collection === "actions" && existing && (
            <RouterButtonLink
              href={`${base}/${listPath}/${encodeURIComponent(route.childId!)}/costs${suffix}`}
              className="min-h-11"
            >
              Manage Costs
            </RouterButtonLink>
          )}
          {(route.collection === "actions" || route.collection === "traits") &&
            existing && (
              <RouterButtonLink
                href={`${base}/${listPath}/${encodeURIComponent(route.childId!)}/choices${suffix}`}
                className="min-h-11"
              >
                Manage Choices
              </RouterButtonLink>
            )}
          {route.collection === "actions" && existing && (
            <RouterButtonLink
              href={`${base}/${listPath}/${encodeURIComponent(route.childId!)}/prerequisites${suffix}`}
              className="min-h-11"
            >
              Manage Prerequisites
            </RouterButtonLink>
          )}
          {route.collection === "traits" && existing && (
            <RouterButtonLink
              href={`${base}/traits/${encodeURIComponent(route.childId!)}/prerequisites${suffix}`}
              className="min-h-11"
            >
              Manage Prerequisites
            </RouterButtonLink>
          )}
          {route.collection === "traits" && existing && (
            <RouterButtonLink
              className="min-h-11"
              href={`${base}/traits/${encodeURIComponent(route.childId!)}/triggers${suffix}`}
            >
              Manage Triggers
            </RouterButtonLink>
          )}
          {route.collection === "traits" && existing && (
            <RouterButtonLink
              href={`${base}/traits/${encodeURIComponent(route.childId!)}/grants${suffix}`}
              className="min-h-11"
            >
              Manage Grants
            </RouterButtonLink>
          )}
          {route.collection === "traits" && existing && (
            <RouterButtonLink
              href={`${base}/traits/${encodeURIComponent(route.childId!)}/modifiers${suffix}`}
              className="min-h-11"
            >
              Manage Modifiers
            </RouterButtonLink>
          )}
          {route.collection === "traits" && existing && (
            <RouterButtonLink
              href={`${base}/traits/${encodeURIComponent(route.childId!)}/actions${suffix}`}
              className="min-h-11"
            >
              Manage Trait Actions
            </RouterButtonLink>
          )}
          {route.collection === "vehicle" && components.vehicle && (
            <RouterButtonLink
              href={`${base}/vehicle/actions${suffix}`}
              className="min-h-11"
            >
              Manage Vehicle Actions
            </RouterButtonLink>
          )}
        </form>
      ) : (
        <section aria-label={title} className="space-y-4">
          {route.traitId && (
            <p>
              Actions owned by{" "}
              {mechanicsName(
                mechanicsEntries(components.traits).find(
                  (t) => mechanicsId(t) === route.traitId,
                ),
                "Trait",
              )}
              .
            </p>
          )}
          {route.vehicleActions && <p>Actions owned by this Item’s Vehicle.</p>}
          {canEdit && (
            <RouterButtonLink
              href={`${base}/${listPath}/new${suffix}`}
              className="min-h-11"
            >
              Add {actionLabel}
            </RouterButtonLink>
          )}
          {!entries.length ? (
            <p>No {title.toLowerCase()} yet.</p>
          ) : (
            <ul className="divide-y divide-base-300">
              {entries.map((entry) => (
                <li key={mechanicsId(entry)} className="py-3">
                  <InternalLink
                    className="flex min-h-11 items-center font-semibold underline"
                    href={`${base}/${listPath}/${encodeURIComponent(mechanicsId(entry))}${suffix}`}
                  >
                    {mechanicsName(entry, actionLabel)}
                  </InternalLink>
                  <p className="break-words text-base-content/70">
                    {String(mechanicsObject(entry.identity).description ?? "")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {(route.traitId || route.vehicleActions) && (
            <RouterButtonLink
              href={`${base}/${route.traitId ? `traits/${encodeURIComponent(route.traitId)}` : "vehicle"}${suffix}`}
              className="min-h-11"
            >
              Back to {route.traitId ? "Trait" : "Vehicle"}
            </RouterButtonLink>
          )}
        </section>
      )}
    </main>
  );
}
