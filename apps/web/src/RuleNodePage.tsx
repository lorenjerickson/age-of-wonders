import { ProfessionAuthoringFields } from "./ProfessionAuthoringFields";
import {
  newProfessionRule,
  professionRuleTypes,
  syncProfessionTierOrder,
  type ProfessionRuleType,
} from "./professionAuthoringModel";
import { CharacterOptionFields } from "./CharacterOptionFields";
import {
  characterOptionFieldTypes,
  newCharacterOptionField,
  type CharacterOptionFieldType,
} from "./characterOptionFieldsModel";
import { characterAuthorRecord } from "./characterAuthoringModel";
import {
  newActorRule,
  actorRuleTypes,
  type ActorRuleType,
} from "./actorMechanicsModel";
import { ActorRuleFields } from "./ActorMechanicsFields";
import { ItemDefinitionFields } from "./ItemMechanicsFields";
import { CostFields } from "./ItemActionCostsPage";
import { TriggerFields } from "./ItemTraitTriggersPage";
import { RuleListFields, RuleReferenceField } from "./RuleValueFields";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Fieldset } from "@aow/ui";
import {
  ApiRequestError,
  saveWorldItem,
  saveWorldDefinitionDraft,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import {
  definitionConformance,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import { useEditorSave } from "./useEditorSave";
import {
  itemMechanicsSaveInput,
  newItemMechanic,
  mechanicsObject,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { effectEntries, moveEntry } from "./itemActionOutcomesModel";
import {
  prerequisiteDefinitionOptions,
  newActionPrerequisite,
} from "./itemActionPrerequisitesModel";
import { PrerequisiteFields } from "./ItemActionPrerequisitesPage";
import { ModifierFields } from "./ItemTraitModifiersPage";
import { ChoiceFields, OptionFields } from "./ItemActionChoicesPage";
import { EffectFields } from "./RuleEffectFields";
import { createRuleEffect } from "./ruleEffectModel";
import { RuleTargetFields } from "./RuleTargetFields";
import { D20TestFields, DurationFields } from "./RuleValueFields";
import {
  ruleNodeName,
  parseRuleNodeRoute,
  replaceRuleNode,
  resolveRuleNode,
  ruleOwner,
  ruleNodePatch,
  ruleChildren,
  type RuleNodeType,
} from "./ruleNodeModel";
function initial(
  type: RuleNodeType,
  ranks: readonly { key: string; name: string }[] = [],
): MechanicsObject {
  if (professionRuleTypes.includes(type as ProfessionRuleType))
    return newProfessionRule(type as ProfessionRuleType, ranks);
  if (characterOptionFieldTypes.includes(type as CharacterOptionFieldType))
    return newCharacterOptionField(type as CharacterOptionFieldType);
  switch (type) {
    case "action-definition":
      return newItemMechanic(true, crypto.randomUUID());
    case "trait-definition":
      return newItemMechanic(false, crypto.randomUUID());
    case "cost":
      return { kind: "economy", activation: "action" };
    case "trigger":
      return { event: "turn-start", effects: [] };
    case "effect":
      return createRuleEffect("narrative");
    case "predicate":
      return newActionPrerequisite("always");
    case "target":
      return { kind: "creature" };
    case "test":
      return { kind: "attribute-check" };
    case "duration":
      return { kind: "instantaneous" };
    case "modifier":
      return { id: crypto.randomUUID(), target: "", operation: "add" };
    case "choice":
      return { id: crypto.randomUUID(), prompt: "", minimum: 1, maximum: 1 };
    case "option":
      return { id: crypto.randomUUID(), label: "", value: "" };
    case "outcome":
      return { id: crypto.randomUUID(), effects: [] };
    default:
      return actorRuleTypes.includes(type as ActorRuleType)
        ? newActorRule(type as ActorRuleType)
        : {};
  }
}
type RulePageProps = {
  itemId: string;
  path: string;
  catalog?: "monster" | "character-template" | "profession" | "background";
  basePath?: string;
};
export function RuleNodePage(props: RulePageProps) {
  return <RuleNodeScreen key={`${props.itemId}/${props.path}`} {...props} />;
}
function RuleNodeScreen({ itemId, path, catalog, basePath }: RulePageProps) {
  const { definition, draft, adoptDraft, canEdit, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const route = catalog
    ? path.startsWith("rule/") && path.split("/").filter(Boolean).length > 1
      ? {
          ownerPath: "",
          rootPath: "rule",
          trigger: false,
          segments: path.split("/").filter(Boolean).slice(1),
        }
      : undefined
    : parseRuleNodeRoute(path);
  const item = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === itemId &&
      mechanicsObject(r.payload).kind === (catalog ?? "item"),
  );
  const payload = mechanicsObject(item?.payload),
    components = mechanicsObject(payload.components);
  let issue = "",
    node: ReturnType<typeof resolveRuleNode> | undefined;
  try {
    if (catalog === "profession" || catalog === "background")
      characterAuthorRecord(draft?.records ?? [], catalog, itemId);
    if (payload.components !== undefined && components !== payload.components)
      throw new Error(
        "This definition contains unsupported data. Existing data has been preserved.",
      );
    if (route) {
      const owner = catalog
        ? { root: components, type: catalog }
        : ruleOwner(components, route);
      node = resolveRuleNode(owner.root, owner.type, route.segments);
    }
  } catch (e) {
    issue = e instanceof Error ? e.message : "This rule is unavailable.";
  }
  const [form, setForm] = useState<MechanicsObject>(() =>
    node
      ? node.value === undefined
        ? initial(node.type, draft?.effectiveModels?.professionRanks ?? [])
        : mechanicsObject(node.value)
      : {},
  );
  const [revision, setRevision] = useState(draft?.storageRevision),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const save = useEditorSave(JSON.stringify(form));
  const leaving = useRef(false);
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
  const base =
    basePath ??
    `/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(itemId)}`;
  const href = (p: string) => `${base}${p ? `/${p}` : ""}${suffix}`;
  const parent =
    route && route.segments.length > 1
      ? `${route.rootPath}/${route.segments.slice(0, -1).join("/")}`
      : (route?.ownerPath ?? "actions");
  const characterCatalog = catalog === "profession" || catalog === "background";
  const conformance =
    characterCatalog && draft
      ? definitionConformance(draft, catalog)
      : undefined;
  const disabled =
    !canEdit || save.saving || conflict || (characterCatalog && !conformance);
  async function persist(value: unknown, destination?: string) {
    if (!route || !draft || revision === undefined || disabled || issue) return;
    await save.run(async () => {
      setError("");
      try {
        const next = catalog
          ? await saveWorldDefinitionDraft(definition.id, {
              ...draft,
              storageRevision: revision,
              records: draft.records.map((record) =>
                record === item
                  ? {
                      ...record,
                      payload: {
                        ...payload,
                        ...(characterCatalog
                          ? {
                              conformance: {
                                ...mechanicsObject(payload.conformance),
                                ...conformance,
                              },
                            }
                          : {}),
                        components:
                          catalog === "profession"
                            ? syncProfessionTierOrder(
                                components,
                                replaceRuleNode(
                                  components,
                                  catalog,
                                  route.segments,
                                  value,
                                ),
                                route.segments,
                              )
                            : replaceRuleNode(
                                components,
                                catalog,
                                route.segments,
                                value,
                              ),
                      },
                    }
                  : record,
              ),
            })
          : await saveWorldItem(
              definition.id,
              itemMechanicsSaveInput(
                payload,
                revision,
                ruleNodePatch(components, route, value),
              ),
              itemId,
            );
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
        <Alert tone="warning">{issue || "This rule is unavailable."}</Alert>
        <RouterButtonLink href={href(route?.ownerPath ?? "actions")}>
          Back to owner
        </RouterButtonLink>
      </main>
    );
  const recordIds = new Set(draft.records.map((r) => r.sourceId)),
    definitions = prerequisiteDefinitionOptions(draft.records),
    shared = { recordIds, definitions };
  const link = (key: string, label: string) =>
    node!.isNew ||
    node!.value === undefined ||
    form.kind !== mechanicsObject(node!.value).kind ? (
      <p key={key}>
        Save this {ruleNodeName(node!.type)} before editing{" "}
        {label.toLowerCase()}.
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
  const definitionsByKind = Object.fromEntries(
    ["profession", "skill", "feat", "trait", "action", "item"].map((k) => [
      k,
      prerequisiteDefinitionOptions(
        draft.records.filter((r) => mechanicsObject(r.payload).kind === k),
      ),
    ]),
  );
  let fields;
  if (professionRuleTypes.includes(node.type as ProfessionRuleType)) {
    fields = (
      <ProfessionAuthoringFields
        {...shared}
        definitionsByKind={definitionsByKind}
        type={node.type as ProfessionRuleType}
        value={form}
        onChange={setForm}
        renderCollection={link}
        ranks={draft.effectiveModels?.professionRanks ?? []}
        attributes={draft.effectiveModels?.attributes ?? []}
        statistics={(draft.effectiveModels?.elements ?? [])
          .filter(
            (e) =>
              e.kind === "field" &&
              ["integer", "number"].includes(
                String(mechanicsObject(e.payload?.valueType).kind),
              ),
          )
          .map((e) => ({
            key: String(e.payload?.storageKey ?? e.key),
            name: e.name,
          }))}
      />
    );
  } else if (
    characterOptionFieldTypes.includes(node.type as CharacterOptionFieldType)
  ) {
    fields = (
      <CharacterOptionFields
        {...shared}
        itemDefinitions={definitionsByKind.item}
        skillDefinitions={definitionsByKind.skill}
        featDefinitions={definitionsByKind.feat}
        type={node.type as CharacterOptionFieldType}
        value={form}
        onChange={setForm}
        renderCollection={link}
        attributeDefinitions={(draft.effectiveModels?.attributes ?? []).map(
          (a) => ({ id: a.key, label: a.name }),
        )}
      />
    );
  } else
    switch (node.type) {
      case "action-definition":
      case "trait-definition":
        fields = (
          <>
            <ItemDefinitionFields
              {...shared}
              value={form}
              onChange={setForm}
              action={node.type === "action-definition"}
            />
            {link("components", "Rules")}
          </>
        );
        break;
      case "action":
      case "trait":
        fields = (
          <>
            {ruleChildren(node.type, form).map((c) => link(c.key, c.label))}
            {node.type === "trait" && (
              <RuleListFields
                {...shared}
                label="Granted definitions"
                value={form.grants ?? []}
                onChange={(grants) => setForm({ ...form, grants })}
                create={() => ""}
              >
                {(value, onChange) => (
                  <RuleReferenceField
                    {...shared}
                    label="Definition"
                    value={value}
                    onChange={onChange}
                  />
                )}
              </RuleListFields>
            )}
          </>
        );
        break;
      case "cost":
        fields = (
          <CostFields
            {...shared}
            value={form}
            onChange={setForm}
            isNew={node.isNew}
          />
        );
        break;
      case "trigger":
        fields = (
          <>
            <TriggerFields {...shared} value={form} onChange={setForm} />
            {ruleChildren(node.type, form).map((c) => link(c.key, c.label))}
          </>
        );
        break;
      case "effect":
        fields = (
          <EffectFields
            {...shared}
            value={form}
            onChange={setForm}
            isNew={node.isNew}
            renderCollection={link}
            renderDetail={link}
          />
        );
        break;
      case "predicate":
        fields = (
          <>
            <PrerequisiteFields
              {...shared}
              value={form}
              onChange={setForm}
              isNew={node.isNew || node.value === undefined}
            />
            {ruleChildren("predicate", form).map((c) => link(c.key, c.label))}
          </>
        );
        break;
      case "modifier":
        fields = (
          <>
            <ModifierFields {...shared} value={form} onChange={setForm} />
            {link("predicate", "Predicate")}
          </>
        );
        break;
      case "choice":
        fields = (
          <>
            <ChoiceFields {...shared} value={form} onChange={setForm} />
            {link("options", "Options")}
          </>
        );
        break;
      case "option":
        fields = (
          <>
            <OptionFields {...shared} value={form} onChange={setForm} />
            {link("prerequisites", "Prerequisites")}
          </>
        );
        break;
      case "target":
        fields = (
          <RuleTargetFields
            {...shared}
            value={form}
            onChange={setForm}
            renderCollection={link}
          />
        );
        break;
      case "test":
        fields = <D20TestFields {...shared} value={form} onChange={setForm} />;
        break;
      case "duration":
        fields = <DurationFields {...shared} value={form} onChange={setForm} />;
        break;
      case "outcome":
        fields = (
          <>
            {link("when", "Predicate")}
            {link("effects", "Effects")}
          </>
        );
        break;
      default:
        fields = (
          <ActorRuleFields
            {...shared}
            type={node.type as ActorRuleType}
            value={form}
            onChange={setForm}
            renderCollection={link}
          />
        );
    }
  const entries = node.list ? effectEntries(node.value) : [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">{node.label}</h1>
      <p>{node.labels.join(" · ")}</p>
      <RouterButtonLink className="min-h-11" href={href(parent)}>
        Back to {route.segments.length > 1 ? "parent" : "owner"}
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {characterCatalog && !conformance && (
        <Alert tone="warning">
          The effective Model is unavailable. Select a complete Model release
          before saving.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {node.list ? (
        <section className="space-y-4">
          {canEdit && (
            <RouterButtonLink className="min-h-11" href={href(`${path}/new`)}>
              Add {ruleNodeName(node.type)}
            </RouterButtonLink>
          )}
          {entries.length === 0 && <p>No entries yet.</p>}
          {entries.map((_, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 rounded border p-3"
            >
              <RouterButtonLink
                className="min-h-11"
                href={href(`${path}/${i}`)}
              >
                {ruleNodeName(node.type)[0].toUpperCase() +
                  ruleNodeName(node.type).slice(1)}{" "}
                {i + 1}
              </RouterButtonLink>
              <Button
                className="min-h-11"
                disabled={disabled || i === 0}
                onClick={() => void persist(moveEntry(entries, i, -1))}
              >
                Move up
              </Button>
              <Button
                className="min-h-11"
                disabled={disabled || i === entries.length - 1}
                onClick={() => void persist(moveEntry(entries, i, 1))}
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
                {save.saving ? "Saving…" : `Save ${ruleNodeName(node.type)}`}
              </Button>
              {node.value !== undefined && (
                <Button
                  className="min-h-11"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Remove this rule?"))
                      void persist(undefined, parent);
                  }}
                >
                  Remove {ruleNodeName(node.type)}
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
