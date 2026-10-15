import { WorldRecordRemoval } from "./WorldRecordRemoval";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Fieldset } from "@aow/ui";
import type { JsonValue } from "@aow/common";
import { ApiRequestError, saveWorldDefinitionDraft } from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import {
  draftWithIndexedRecord,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import {
  RuleNumberField,
  RuleTextField,
  DiceExpressionFields,
} from "./RuleValueFields";
import { newActorCatalogDefinition } from "./actorMechanicsModel";
import { useEditorSave } from "./useEditorSave";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
type ActorCatalogKind = "monster" | "character-template";
function actorCatalogBase(worldId: string, kind: ActorCatalogKind) {
  return `/worlds/${encodeURIComponent(worldId)}/${kind === "monster" ? "bestiary/catalog-monsters" : "characters/catalog-characters"}`;
}
const actorCatalogCollections = {
  monster: [
    ["traits", "Traits"],
    ["actions", "Actions"],
    ["bonusActions", "Bonus Actions"],
    ["reactions", "Reactions"],
    ["legendaryActions", "Legendary Actions"],
    ["mythicActions", "Mythic Actions"],
    ["lairActions", "Lair Actions"],
    ["regionalEffects", "Regional Traits"],
    ["skills", "Skills"],
    ["speeds", "Speeds"],
    ["damageAdjustments", "Damage adjustments"],
    ["senses", "Senses"],
    ["communicationCapabilities", "Communication"],
    ["disciplines", "Disciplines"],
  ],
  "character-template": [
    ["traits", "Traits"],
    ["choices", "Choices"],
    ["attributeGeneration", "Attribute generation"],
  ],
} as const;
export function ActorCatalogPage({
  kind,
  sourceId,
}: {
  kind: ActorCatalogKind;
  sourceId?: string;
}) {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const base = actorCatalogBase(definition.id, kind);
  const title =
    kind === "monster" ? "Catalog Creatures" : "Catalog Character templates";
  if (sourceId)
    return (
      <CatalogEditor
        key={`${kind}/${sourceId}`}
        kind={kind}
        sourceId={sourceId}
      />
    );
  const records = (draft?.records ?? []).filter(
    (r) =>
      r.resourceType === "definitions" &&
      mechanicsObject(r.payload).kind === kind,
  );
  const ids = new Set(draft?.records.map((r) => r.sourceId) ?? []);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p>
        {kind === "monster"
          ? "Reusable rules definitions with authored statistics and Actions."
          : "Reusable Character creation rules, distinct from World NPCs and played Characters."}
      </p>
      <RouterButtonLink
        className="min-h-11"
        href={`/worlds/${encodeURIComponent(definition.id)}/${kind === "monster" ? "bestiary" : "characters"}${suffix}`}
      >
        Back
      </RouterButtonLink>
      {canEdit && (
        <RouterButtonLink className="min-h-11" href={`${base}/new${suffix}`}>
          Create{" "}
          {kind === "monster" ? "catalog Creature" : "Character template"}
        </RouterButtonLink>
      )}
      {records.length === 0 && <p>No definitions yet.</p>}
      {records.map((r, i) => {
        const name = mechanicsObject(mechanicsObject(r.payload).identity).name;
        return (
          <div key={r.sourceId}>
            <RouterButtonLink
              className="min-h-11"
              href={`${base}/${encodeURIComponent(r.sourceId)}${suffix}`}
            >
              {typeof name === "string" &&
              name.trim() &&
              !protectedComparisonText(name, ids)
                ? name
                : `Definition ${i + 1}`}
            </RouterButtonLink>
          </div>
        );
      })}
    </main>
  );
}
function CatalogEditor({
  kind,
  sourceId,
}: {
  kind: ActorCatalogKind;
  sourceId: string;
}) {
  const { definition, draft, canEdit, adoptDraft, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const base = actorCatalogBase(definition.id, kind);
  const isNew = sourceId === "new";
  const createdId = useRef(crypto.randomUUID());
  const existing = draft?.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.sourceId === sourceId &&
      mechanicsObject(r.payload).kind === kind,
  );
  const [form, setForm] = useState<MechanicsObject>(() =>
    isNew
      ? newActorCatalogDefinition(
          kind,
          createdId.current,
          draft?.effectiveModels?.attributes ?? [],
        )
      : mechanicsObject(existing?.payload),
  );
  const [revision, setRevision] = useState(draft?.storageRevision);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const leaving = useRef(false);
  const save = useEditorSave(JSON.stringify(form));
  const identity = mechanicsObject(form.identity),
    components = mechanicsObject(form.components);
  const ids = new Set(draft?.records.map((r) => r.sourceId) ?? []);
  const context = { recordIds: ids };
  const disabled = !canEdit || save.saving || conflict;
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
  const set = (key: string, value: JsonValue) =>
    setForm({ ...form, components: { ...components, [key]: value } });
  const optionalNumber = (key: string, label: string) =>
    components[key] === undefined ? (
      <Button className="min-h-11" type="button" onClick={() => set(key, 0)}>
        Add {label}
      </Button>
    ) : (
      <section className="space-y-2">
        <RuleNumberField
          label={label}
          value={components[key]}
          onChange={(v) => set(key, v)}
        />
        <Button
          className="min-h-11"
          type="button"
          onClick={() => {
            const copy = { ...components };
            delete copy[key];
            setForm({ ...form, components: copy });
          }}
        >
          Remove {label}
        </Button>
      </section>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || revision === undefined || disabled) return;
    await save.run(async () => {
      setError("");
      try {
        const record = {
          ...(existing ?? {}),
          resourceType: "definitions",
          sourceId: isNew ? createdId.current : sourceId,
          payload: form,
        };
        const next = await saveWorldDefinitionDraft(definition.id, {
          ...draftWithIndexedRecord(draft, record),
          storageRevision: revision,
        });
        adoptDraft({ ...next, effectiveModels: draft.effectiveModels });
        setRevision(next.storageRevision);
        save.markSaved(JSON.stringify(form));
        if (isNew) {
          leaving.current = true;
          await navigate(
            `${base}/${encodeURIComponent(createdId.current)}${suffix}`,
          );
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
  if (
    !draft ||
    (!isNew && !existing) ||
    form.components !== components ||
    form.identity !== identity
  )
    return (
      <main className="p-4">
        <Alert tone="warning">
          This definition is unavailable or contains unsupported data. Existing
          content is preserved.
        </Alert>
        <RouterButtonLink href={`${base}${suffix}`}>
          Back to catalog
        </RouterButtonLink>
      </main>
    );
  const attrKey = kind === "monster" ? "attributes" : "attributeDefaults";
  const scores = mechanicsObject(components[attrKey]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {isNew ? "Create" : "Edit"}{" "}
        {kind === "monster" ? "catalog Creature" : "Character template"}
      </h1>
      <RouterButtonLink className="min-h-11" href={`${base}${suffix}`}>
        Back to catalog
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form className="space-y-4" onSubmit={submit}>
        <Fieldset disabled={disabled} className="space-y-4">
          <RuleTextField
            {...context}
            label="Name"
            value={identity.name}
            onChange={(v) =>
              setForm({ ...form, identity: { ...identity, name: v } })
            }
          />
          <RuleTextField
            {...context}
            label="Description"
            value={identity.description}
            onChange={(v) =>
              setForm({ ...form, identity: { ...identity, description: v } })
            }
          />
          {components[attrKey] === undefined ||
          components[attrKey] === scores ? (
            <section className="space-y-3">
              <h2>Attribute defaults</h2>
              {(draft.effectiveModels?.attributes ?? []).map((a, i) => (
                <RuleNumberField
                  key={a.key}
                  label={
                    protectedComparisonText(a.name, ids)
                      ? `Attribute ${i + 1}`
                      : a.name
                  }
                  value={scores[a.key]}
                  onChange={(v) => set(attrKey, { ...scores, [a.key]: v })}
                />
              ))}
              {!draft.effectiveModels?.attributes.length && (
                <p>
                  Adopt Attributes to edit named scores. Existing scores are
                  preserved.
                </p>
              )}
            </section>
          ) : (
            <Alert tone="warning">Existing scores are preserved.</Alert>
          )}
          {kind === "monster" ? (
            <>
              <RuleTextField
                {...context}
                label="Size"
                value={components.size}
                onChange={(v) => set("size", v)}
              />
              {components.classification ===
              mechanicsObject(components.classification) ? (
                <RuleTextField
                  {...context}
                  label="Nature"
                  value={mechanicsObject(components.classification).nature}
                  onChange={(v) =>
                    set("classification", {
                      ...mechanicsObject(components.classification),
                      nature: v,
                    })
                  }
                />
              ) : (
                <Alert tone="warning">
                  Existing classification is preserved.
                </Alert>
              )}
              <DiceExpressionFields
                {...context}
                label="Defense dice"
                value={components.defenseRating}
                onChange={(v) => set("defenseRating", v)}
              />
              {components.hitPoints ===
              mechanicsObject(components.hitPoints) ? (
                <>
                  <RuleNumberField
                    label="Average hit points"
                    value={mechanicsObject(components.hitPoints).average}
                    onChange={(v) =>
                      set("hitPoints", {
                        ...mechanicsObject(components.hitPoints),
                        average: v,
                      })
                    }
                  />
                  <DiceExpressionFields
                    {...context}
                    label="Hit point dice"
                    value={mechanicsObject(components.hitPoints).formula}
                    onChange={(v) =>
                      set("hitPoints", {
                        ...mechanicsObject(components.hitPoints),
                        formula: v,
                      })
                    }
                  />
                </>
              ) : (
                <Alert tone="warning">Existing hit points are preserved.</Alert>
              )}
              {typeof components.challengeRating === "string" ? (
                <RuleTextField
                  {...context}
                  label="Challenge rating"
                  value={components.challengeRating}
                  onChange={(v) => set("challengeRating", v)}
                />
              ) : (
                <RuleNumberField
                  label="Challenge rating"
                  value={components.challengeRating}
                  onChange={(v) => set("challengeRating", v)}
                />
              )}
              {optionalNumber(
                "legendaryActionBudget",
                "Legendary Action budget",
              )}
            </>
          ) : (
            <>
              {optionalNumber("minimumLevel", "Minimum level")}
              {optionalNumber("maximumLevel", "Maximum level")}
            </>
          )}
          <Button
            type="submit"
            className="min-h-11"
            disabled={
              typeof identity.name !== "string" || !identity.name.trim()
            }
          >
            {save.saving ? "Saving…" : "Save definition"}
          </Button>
        </Fieldset>
        <Button
          type="button"
          className="min-h-11"
          disabled={save.saving}
          onClick={() => {
            leaving.current = true;
            void navigate(`${base}${suffix}`);
          }}
        >
          Cancel
        </Button>
      </form>
      {existing && (
        <WorldRecordRemoval
          record={existing}
          path={
            kind === "monster"
              ? "bestiary/catalog-monsters"
              : "characters/catalog-characters"
          }
          returnPath={base}
          disabled={save.dirty || save.saving}
        />
      )}
      <section className="flex flex-wrap gap-3" aria-label="Mechanics">
        {isNew ? (
          <p>Save the definition before editing its mechanics.</p>
        ) : (
          actorCatalogCollections[kind].map(([key, label]) => (
            <RouterButtonLink
              className="min-h-11"
              key={key}
              href={`${base}/${encodeURIComponent(sourceId)}/rule/${key}${suffix}`}
            >
              Manage {label}
            </RouterButtonLink>
          ))
        )}
      </section>
    </main>
  );
}
