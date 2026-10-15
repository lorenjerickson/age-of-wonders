import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { JsonValue } from "@aow/common";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Fieldset } from "@aow/ui";
import { ApiRequestError, saveWorldDefinitionDraft } from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";
import { useEditorSave } from "./useEditorSave";
import { mechanicsName, mechanicsObject } from "./itemMechanicsModel";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import { PrerequisiteFields } from "./ItemActionPrerequisitesPage";
import { ModifierFields } from "./ItemTraitModifiersPage";
import { RuleTextField } from "./RuleValueFields";
import { moveRuleEntry } from "./ruleValueModel";
import { ItemOwnerFields } from "./ItemOwnerFields";
import {
  parseItemOwnerRoute,
  resolveItemOwnerNode,
  itemOwnerChildren,
  itemOwnerEntries,
  replaceItemOwnerNode,
  newItemOwnerValue,
} from "./itemOwnerModel";
export function ItemOwnerPage({
  itemId,
  path,
}: {
  itemId: string;
  path: string;
}) {
  return (
    <ItemOwnerScreen key={`${itemId}/${path}`} itemId={itemId} path={path} />
  );
}
function ItemOwnerScreen({ itemId, path }: { itemId: string; path: string }) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate(),
    suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const route = parseItemOwnerRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === "item",
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  let node: ReturnType<typeof resolveItemOwnerNode> | undefined,
    issue = "";
  try {
    if (payload.components !== undefined && payload.components !== components)
      throw new Error(
        "This Item contains unsupported components. Existing data has been preserved.",
      );
    if (route) node = resolveItemOwnerNode(components, route.segments);
  } catch (e) {
    issue = e instanceof Error ? e.message : "This Item field is unavailable.";
  }
  const [form, setForm] = useState<JsonValue>(() =>
    node
      ? node.value === undefined
        ? newItemOwnerValue(node.type)
        : (node.value as JsonValue)
      : {},
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
  const base = `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}`;
  const href = (p: string) => `${base}${p ? `/${p}` : ""}${suffix}`;
  const parent = route?.segments.length
    ? ["owner", ...route.segments.slice(0, -1)].join("/")
    : "";
  const disabled = !canEdit || save.saving || conflict;
  async function persist(value: JsonValue | undefined, destination?: string) {
    if (
      !route ||
      !draft ||
      !item ||
      revision === undefined ||
      disabled ||
      issue
    )
      return;
    await save.run(async () => {
      setError("");
      try {
        const updated = replaceItemOwnerNode(components, route.segments, value);
        const next = await saveWorldDefinitionDraft(definition.id, {
          ...draft,
          storageRevision: revision,
          records: draft.records.map((r) =>
            r === item
              ? { ...r, payload: { ...payload, components: updated } }
              : r,
          ),
        });
        adoptDraft({ ...next, effectiveModels: draft.effectiveModels });
        setRevision(next.storageRevision);
        save.markSaved(JSON.stringify(form));
        if (destination !== undefined) {
          leaving.current = true;
          await navigate(href(destination));
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
    void persist(form, parent);
  }
  if (!route || !draft || !item || !node || issue)
    return (
      <main className="p-4">
        <Alert tone="warning">
          {issue || "This Item field is unavailable. Nothing was changed."}
        </Alert>
        <RouterButtonLink className="min-h-11" href={href("")}>
          Back to Item
        </RouterButtonLink>
      </main>
    );
  const recordIds = new Set(draft.records.map((r) => r.sourceId)),
    definitions = prerequisiteDefinitionOptions(draft.records);
  const itemDefinitions = draft.records
    .filter(
      (r) =>
        r.resourceType === "definitions" &&
        mechanicsObject(r.payload).kind === "item",
    )
    .map((r) => ({
      id: r.sourceId,
      label: mechanicsName(r.payload, "Unnamed Item"),
    }));
  const shared = { recordIds, definitions };
  const link = (key: string, label: string) =>
    node!.type !== "item" &&
    (node!.isNew ||
      node!.value === undefined ||
      mechanicsObject(form).kind !== mechanicsObject(node!.value).kind) ? (
      <p key={key}>
        Save this {node!.type} before editing {label.toLowerCase()}.
      </p>
    ) : (
      <RouterButtonLink
        key={key}
        className="min-h-11"
        href={href(`${path}/${key}`)}
      >
        Manage {label}
      </RouterButtonLink>
    );
  const entries = node.list ? itemOwnerEntries(node.value, node.type) : [];
  let fields;
  if (node.type === "predicate")
    fields = (
      <>
        <PrerequisiteFields
          {...shared}
          value={mechanicsObject(form)}
          onChange={setForm}
          isNew={node.isNew || node.value === undefined}
        />
        {itemOwnerChildren(node.type, form).map((c) => link(c.key, c.label))}
      </>
    );
  else if (node.type === "modifier")
    fields = (
      <>
        <ModifierFields
          {...shared}
          value={mechanicsObject(form)}
          onChange={setForm}
        />
        {link("predicate", "Predicate")}
      </>
    );
  else if (node.type === "tool proficiency")
    fields = (
      <RuleTextField
        {...shared}
        label="Tool proficiency"
        value={form}
        onChange={setForm}
      />
    );
  else
    fields = (
      <ItemOwnerFields
        {...shared}
        type={node.type}
        value={mechanicsObject(form)}
        onChange={setForm}
        itemDefinitions={itemDefinitions}
        renderCollection={link}
      />
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {protectedComparisonText(mechanicsName(payload, "Item"), recordIds)
          ? "Item"
          : mechanicsName(payload, "Item")}{" "}
        · {node.label}
      </h1>
      {!!node.labels.length && <p>{node.labels.join(" · ")}</p>}
      <RouterButtonLink className="min-h-11" href={href(parent)}>
        Back to {parent ? "parent" : "Item"}
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {node.type === "item" ? (
        <nav aria-label="Item rules" className="flex flex-wrap gap-3">
          {itemOwnerChildren("item", components).map((c) =>
            link(c.key, c.label),
          )}
        </nav>
      ) : node.list ? (
        <section className="space-y-4">
          {canEdit && (
            <RouterButtonLink className="min-h-11" href={href(`${path}/new`)}>
              Add {node.type}
            </RouterButtonLink>
          )}
          {!entries.length && <p>No entries yet.</p>}
          {entries.map((_, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 rounded border p-3"
            >
              <RouterButtonLink
                className="min-h-11"
                href={href(`${path}/${i}`)}
              >
                {node.type[0].toUpperCase() + node.type.slice(1)} {i + 1}
              </RouterButtonLink>
              <Button
                className="min-h-11"
                disabled={disabled || i === 0}
                onClick={() => void persist(moveRuleEntry(entries, i, -1))}
              >
                Move up
              </Button>
              <Button
                className="min-h-11"
                disabled={disabled || i === entries.length - 1}
                onClick={() => void persist(moveRuleEntry(entries, i, 1))}
              >
                Move down
              </Button>
              <Button
                className="min-h-11"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm("Remove this entry?"))
                    void persist(entries.filter((_, n) => n !== i));
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </section>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Fieldset disabled={disabled} className="space-y-4">
            {fields}
            <div className="flex flex-wrap gap-3">
              <Button className="min-h-11" type="submit">
                {save.saving ? "Saving…" : `Save ${node.type}`}
              </Button>
              {node.value !== undefined && (
                <Button
                  className="min-h-11"
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove this ${node!.type}?`))
                      void persist(undefined, parent);
                  }}
                >
                  Remove {node.type}
                </Button>
              )}
            </div>
          </Fieldset>
          <Button
            className="min-h-11"
            type="button"
            disabled={save.saving}
            onClick={() => {
              leaving.current = true;
              void navigate(href(parent));
            }}
          >
            Cancel
          </Button>
        </form>
      )}
    </main>
  );
}
