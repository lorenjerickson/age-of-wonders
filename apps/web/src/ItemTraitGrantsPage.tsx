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
  mechanicsName,
  mechanicsObject,
  type MechanicsObject,
} from "./itemMechanicsModel";
import {
  traitGrantOwner,
  moveGrant,
  parseTraitGrantRoute,
  traitGrantsPatch,
} from "./itemTraitGrantsModel";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
export function ItemTraitGrantsPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return <GrantsScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />;
}
function GrantsScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr),
    route = parseTraitGrantRoute(path);
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
    grantsBase = `${base}/grants`,
    listingHref = `${grantsBase}${suffix}`;
  let issue = "",
    trait: MechanicsObject | undefined,
    grants: string[] = [];
  try {
    if (route) {
      const owner = traitGrantOwner(components, route);
      trait = owner.trait;
      grants = owner.grants;
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This collection is unavailable.";
  }
  const isNew = route?.grantIndex === "new",
    isForm = route?.grantIndex !== undefined,
    index = isNew || !isForm ? -1 : Number(route?.grantIndex),
    existing = grants[index];
  const [form, setForm] = useState<string | undefined>(() => existing);
  const definitions = prerequisiteDefinitionOptions(draft?.records ?? []);
  const selected = definitions.findIndex((entry) => entry.id === form);
  const [revision, setRevision] = useState(draft?.storageRevision),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const save = useEditorSave(JSON.stringify(form) ?? "undefined"),
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
  async function persist(next: string[]) {
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
            traitGrantsPatch(components, route, next),
          ),
          itemId,
        );
        adoptDraft({ ...updated, effectiveModels: draft.effectiveModels });
        setRevision(updated.storageRevision);
        save.markSaved(JSON.stringify(form) ?? "undefined");
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
    if (form === undefined) return;
    void persist(
      isNew
        ? [...grants, form]
        : grants.map((c, i) => (i === index ? form : c)),
    );
  }
  if (
    !route ||
    !draft ||
    !item ||
    !trait ||
    issue ||
    (isForm && !isNew && existing === undefined)
  )
    return (
      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Alert tone="warning">
          {issue ||
            "This Trait or Grant is unavailable in the current draft. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={traitHref}>
          Back to Trait
        </RouterButtonLink>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {mechanicsName(trait, "Trait")} · Grants
      </h1>
      <RouterButtonLink className="min-h-11" href={traitHref}>
        Back to Trait
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {isForm ? (
        <form onSubmit={submit} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {isNew ? "Add Grant" : `Edit Grant ${index + 1}`}
          </h2>
          <Fieldset disabled={disabled} className="space-y-5">
            <Field label="Granted definition" required>
              <Select
                className="min-h-11"
                required
                value={
                  selected >= 0
                    ? String(selected)
                    : form !== undefined
                      ? "existing"
                      : ""
                }
                onChange={(event) => {
                  const next = definitions[Number(event.target.value)];
                  if (!next || next.id === form) return;
                  if (
                    form !== undefined &&
                    !window.confirm("Replace the existing granted definition?")
                  )
                    return;
                  setForm(next.id);
                }}
              >
                <option value="" disabled>
                  Select definition
                </option>
                {form !== undefined && selected < 0 && (
                  <option value="existing">
                    Existing definition unavailable
                  </option>
                )}
                {definitions.map((entry, i) => (
                  <option key={i} value={String(i)}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
            {!definitions.length && (
              <p>No definitions are available in this draft.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="min-h-11">
                {save.saving ? "Saving…" : "Save Grant"}
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    if (window.confirm("Remove this Grant?"))
                      void persist(grants.filter((_, i) => i !== index));
                  }}
                >
                  Remove Grant
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
        <section className="space-y-4" aria-label="Grants">
          {canEdit && (
            <RouterButtonLink
              className="min-h-11"
              href={`${grantsBase}/new${suffix}`}
            >
              Add Grant
            </RouterButtonLink>
          )}
          {!grants.length && <p>No grants yet.</p>}
          <ol className="space-y-4">
            {grants.map((grant, i) => (
              <li key={i} className="space-y-3 rounded border p-4">
                <RouterButtonLink
                  className="min-h-11"
                  href={`${grantsBase}/${i}${suffix}`}
                >
                  Grant {i + 1} ·{" "}
                  {definitions.find((entry) => entry.id === grant)?.label ??
                    "Existing definition unavailable"}
                </RouterButtonLink>
                <div className="flex flex-wrap gap-3">
                  {([-1, 1] as const).map((delta) => (
                    <Button
                      key={delta}
                      type="button"
                      className="min-h-11"
                      disabled={
                        disabled ||
                        (delta === -1 ? i === 0 : i === grants.length - 1)
                      }
                      aria-label={`Move grant ${i + 1} ${delta === -1 ? "up" : "down"}`}
                      onClick={() => void persist(moveGrant(grants, i, delta))}
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
