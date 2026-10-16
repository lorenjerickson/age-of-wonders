import { EquipmentPaperdoll } from "./EquipmentPaperdoll";
import {
  worldEquipmentItems,
  worldEquipmentSlots,
} from "./worldEquipmentPresentation";
import {
  visibleRecordName as recordName,
  visibleRecordDescription as recordDescription,
} from "./recordDisplay";
import { formatAstraModifier } from "./astraModifiers";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useBlocker } from "@tanstack/react-router";
import {
  Button,
  TextInput,
  Textarea,
  Field,
  Select,
  Input,
  Checkbox,
  Fieldset,
  Legend,
} from "@aow/ui";
import type {
  WorldRule,
  WorldEffectDefinition,
  WorldConditionDefinition,
  WorldCharacterTemplate,
} from "@aow/common";
import {
  getWorldDefinitionDraft,
  getWorldRules,
  saveWorldRule,
  uploadWorldMedia,
  type WorldDraftRecord,
  type WorldRulesCollection,
} from "./api";
import { astraRequest } from "./astraApi";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { recordPayload, recordsForLibrary } from "./worldAuthoringModel";
import { InternalLink, useInternalNavigate } from "./navigation";
import { RecordThumbnail } from "./RecordArtwork";
import { MediaImage } from "./MediaImage";
import { ArtworkGenerator } from "./ArtworkGenerator";
import { WorldRuleEditor } from "./WorldRuleEditor";
import { AstraCreatureItemEditor } from "./AstraCreatureItemEditor";
const categories = [
  "items",
  "creatures",
  "characters",
  "conditions",
  "effects",
  "rules",
] as const;
type Category = (typeof categories)[number];
const resources: Record<string, string> = {
  characters: "world-character-templates",
  conditions: "world-conditions",
  effects: "world-effects",
  rules: "world-rules",
};
const singular: Record<Category, string> = {
  items: "item",
  creatures: "creature",
  characters: "character",
  conditions: "condition",
  effects: "effect",
  rules: "rule",
};
const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
function readableKey(key: string, fallback = "Property") {
  const simple = key.replace(/^.*:(?:attribute|skill)-/, "");
  return /^[a-z][a-z _-]*$/i.test(simple) && !/[0-9a-f]{8}-/i.test(simple)
    ? titleCase(simple.replace(/[_-]/g, " "))
    : fallback;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function recordsFor(records: WorldDraftRecord[], kind: Category) {
  return kind === "items" || kind === "creatures"
    ? recordsForLibrary(records, kind)
    : records.filter((r) => r.resourceType === resources[kind]);
}
export function AstraCodex({
  collection,
  entryId,
}: {
  collection?: "bestiary" | "characters" | "items";
  entryId?: string;
} = {}) {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const location = useLocation();
  const navigate = useInternalNavigate();
  const query = new URLSearchParams(location.searchStr);
  const destination = collection ?? query.get("view");
  const raw =
    (destination === "bestiary"
      ? "creatures"
      : destination === "items"
        ? "items"
        : destination === "characters"
          ? "characters"
          : undefined) ||
    query.get("kind") ||
    (location.pathname.includes("bestiary")
      ? "creatures"
      : location.pathname.includes("rules")
        ? "rules"
        : "items");
  const kind: Category = categories.includes(raw as Category)
    ? (raw as Category)
    : "items";
  const entry = entryId ?? query.get("entry");
  const [search, setSearch] = useState("");
  const dedicated = ["creatures", "characters", "items"].includes(kind);
  const base = `/worlds/${encodeURIComponent(definition.id)}?view=${kind === "creatures" ? "bestiary" : kind === "characters" ? "characters" : kind === "items" ? "items" : "codex"}`;
  const listHref = dedicated ? base : `${base}&kind=${kind}`;
  const records = recordsFor(draft?.records ?? [], kind);
  const visible = records.filter((r) =>
    `${recordName(r, "")} ${recordDescription(r) ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (entry)
    return kind === "items" || kind === "creatures" ? (
      <AstraCreatureItemEditor
        key={`${kind}:${entry}`}
        kind={kind}
        entryId={entry === "new" ? undefined : entry}
        onSaved={() => void navigate(listHref)}
        onCancel={() => void navigate(listHref)}
      />
    ) : (
      <CodexEditor
        key={`${kind}:${entry}`}
        kind={kind}
        entryId={entry === "new" ? undefined : entry}
        href={listHref}
      />
    );
  return (
    <main className="astra-page">
      <div className="astra-heading">
        <div>
          <div className="astra-eyebrow">WORLD AUTHORING</div>
          <h1>
            {kind === "creatures"
              ? "Bestiary"
              : kind === "characters"
                ? "Characters"
                : titleCase(kind)}
          </h1>
          <p>
            {kind === "creatures"
              ? "Creature templates for your world."
              : kind === "characters"
                ? "The people and named characters who inhabit your world."
                : "Items, conditions, effects, and rules for your world."}
          </p>
        </div>
        {canEdit && (
          <InternalLink
            href={`${listHref}&entry=new`}
            className="btn btn-primary"
          >
            ＋ Add {singular[kind]}
          </InternalLink>
        )}
      </div>
      <div className="astra-search">
        <Input
          aria-label={`Search ${kind}`}
          placeholder={`Search ${kind}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {visible.length ? (
        <div className="astra-grid">
          {visible.map((r) => {
            const p = recordPayload(r);
            const components = object(p.components);
            return (
              <InternalLink
                key={r.sourceId}
                href={`${listHref}&entry=${encodeURIComponent(r.sourceId)}`}
                className="astra-panel astra-card"
              >
                {["items", "creatures", "characters"].includes(kind) && (
                  <RecordThumbnail
                    payload={p}
                    name={recordName(r, "Entry")}
                    onlyIfPresent
                    className="astra-codex-thumbnail"
                  />
                )}
                <div className="astra-card-body">
                  <span className="astra-card-icon">
                    {
                      {
                        items: "◇",
                        creatures: "♧",
                        characters: "♙",
                        conditions: "◉",
                        effects: "✧",
                        rules: "⚙",
                      }[kind]
                    }
                  </span>
                  <h3>{recordName(r, "Unnamed entry")}</h3>
                  <p>{recordDescription(r) || "Open to add more detail."}</p>
                  <span className="astra-badge">
                    {kind === "effects"
                      ? `${((p.modifiers as unknown[]) ?? []).length} modifier${((p.modifiers as unknown[]) ?? []).length === 1 ? "" : "s"} · reusable`
                      : kind === "conditions"
                        ? `${((p.effects as unknown[]) ?? []).length} effects`
                        : kind === "items"
                          ? titleCase(String(components.category ?? "Item"))
                          : kind === "rules"
                            ? titleCase(String(p.lifecycle ?? "disabled"))
                            : titleCase(singular[kind])}
                  </span>
                </div>
              </InternalLink>
            );
          })}
        </div>
      ) : (
        <section className="astra-empty astra-panel">
          <span style={{ fontSize: 29, color: "#e6b85c" }}>✧</span>
          <h3>{search ? "No matching entries." : `Make room for ${kind}.`}</h3>
          <p>
            {search
              ? "Try a different search."
              : kind === "rules"
                ? "Author how movement, combat, and modifiers should work."
                : `Add ${kind} to bring your world to life.`}
          </p>
          {!search && canEdit && (
            <InternalLink className="btn" href={`${listHref}&entry=new`}>
              ＋ Add {singular[kind]}
            </InternalLink>
          )}
        </section>
      )}
      <footer className="astra-footer">
        <span>Made for the stories only you can tell.</span>
        <span>ASTRA / WORLD BUILDER</span>
      </footer>
    </main>
  );
}
function initialEntry(kind: Category): Record<string, unknown> {
  return {
    name: "",
    description: "",
    ...(kind === "effects"
      ? { modifiers: [], duration: { kind: "permanent" } }
      : kind === "conditions"
        ? { effects: [] }
        : kind === "characters"
          ? {
              creatureDefinitionId: "",
              attributes: {},
              skills: {},
              health: { current: 20, maximum: 20, temporary: 0 },
              movement: {
                walk: 30,
                run: 60,
                jump: 5,
                crawl: 10,
                swim: 15,
                climb: 10,
                fly: 0,
                burrow: 5,
              },
              vision: { day: 60, night: 30 },
              equipment: [],
              grantedConditions: [],
              images: {},
            }
          : {
              formatVersion: 1,
              id: "new-rule",
              revision: 1,
              lifecycle: "disabled",
              priority: 0,
              trigger: { event: "aow:movement-declared", version: 1 },
              effects: [
                {
                  kind: "set-local",
                  key: "cost",
                  value: { kind: "constant", value: 0 },
                },
              ],
              audit: {
                createdBy: "draft-author",
                updatedAt: new Date().toISOString(),
              },
            }),
  };
}
function CodexEditor({
  kind,
  entryId,
  href,
}: {
  kind: Category;
  entryId?: string;
  href: string;
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const navigate = useInternalNavigate();
  const existing = recordsFor(draft?.records ?? [], kind).find(
    (r) => r.sourceId === entryId,
  );
  const initial = existing ? recordPayload(existing) : initialEntry(kind);
  const [entry, setEntry] = useState<Record<string, unknown>>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<WorldRulesCollection>();
  const [saved, setSaved] = useState(false);
  const dirty = !saved && JSON.stringify(entry) !== baseline;
  useBlocker({
    shouldBlockFn: () =>
      busy || (dirty && !window.confirm("Leave without saving your changes?")),
    enableBeforeUnload: dirty || busy,
  });
  useEffect(() => {
    if (kind === "rules")
      void getWorldRules(definition.id)
        .then(setRules)
        .catch((e) => setError(e.message));
  }, [definition.id, kind]);
  const change = (patch: Record<string, unknown>) =>
    setEntry((e) => ({ ...e, ...patch }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      const revision = {
        expectedDraftId: draft.id,
        expectedStorageRevision: draft.storageRevision,
      };
      if (kind === "rules") {
        if (!rules) throw new Error("Rules are still loading.");
        await saveWorldRule(
          definition.id,
          {
            ...revision,
            expectedDraftId: rules.draftId,
            rule: entry as unknown as WorldRule,
          },
          entryId,
        );
      } else
        await astraRequest(
          `/worlds/${encodeURIComponent(definition.id)}/codex/${kind}${entryId ? `/${encodeURIComponent(entryId)}` : ""}`,
          { ...revision, entry },
          entryId ? "PUT" : "POST",
        );
      adoptDraft({
        ...(await getWorldDefinitionDraft(definition.id)),
        effectiveModels: draft.effectiveModels,
      });
      setBaseline(JSON.stringify(entry));
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The entry could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (saved && !busy) void navigate(href);
  }, [saved, busy, navigate, href]);
  async function remove() {
    if (
      !draft ||
      !entryId ||
      !window.confirm(
        `Delete “${String(entry.name)}”? This removes it from this World draft.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await astraRequest(
        `/worlds/${encodeURIComponent(definition.id)}/${kind === "rules" ? "rules" : `codex/${kind}`}/${encodeURIComponent(entryId)}`,
        {
          expectedDraftId: draft.id,
          expectedStorageRevision: draft.storageRevision,
        },
        "DELETE",
      );
      adoptDraft({
        ...(await getWorldDefinitionDraft(definition.id)),
        effectiveModels: draft.effectiveModels,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete entry.");
    } finally {
      setBusy(false);
    }
  }
  if (entryId && !existing)
    return (
      <main className="astra-form-page">
        <InternalLink className="astra-back" href={href}>
          ← Back to {kind === "characters" ? "Characters" : "Codex"}
        </InternalLink>
        <h1>Entry unavailable</h1>
        <p>This entry may have been removed from the World.</p>
      </main>
    );
  return (
    <main className="astra-form-page">
      <InternalLink className="astra-back" href={href}>
        ← Back to {kind === "characters" ? "Characters" : "Codex"}
      </InternalLink>
      <div className="astra-eyebrow">WORKSPACE / AUTHORING</div>
      <h1>
        {entryId ? "Edit" : "Add"} {singular[kind]}
      </h1>
      <form className="astra-panel astra-form" onSubmit={submit}>
        {kind === "rules" ? (
          <WorldRuleEditor
            rule={entry as unknown as WorldRule}
            onChange={(rule) =>
              setEntry(rule as unknown as Record<string, unknown>)
            }
          />
        ) : (
          <>
            <TextInput
              label="Name"
              required
              maxLength={120}
              value={String(entry.name ?? "")}
              onChange={(e) => change({ name: e.target.value })}
            />
            <Field label="Description">
              <Textarea
                value={String(entry.description ?? "")}
                onChange={(e) => change({ description: e.target.value })}
              />
            </Field>
          </>
        )}
        {kind === "effects" && <EffectFields entry={entry} onChange={change} />}{" "}
        {kind === "conditions" && (
          <ConditionFields entry={entry} onChange={change} />
        )}{" "}
        {kind === "characters" && (
          <CharacterFields
            entry={entry}
            onChange={change}
            existing={!!entryId}
            onBusyChange={setBusy}
            disabled={busy || !canEdit}
          />
        )}{" "}
        {error && (
          <p className="astra-error" role="alert">
            {error}
          </p>
        )}
        {entryId && (
          <Button
            type="button"
            className="astra-delete"
            disabled={busy || !canEdit}
            onClick={() => void remove()}
          >
            Delete this entry
          </Button>
        )}
        <div className="astra-actions">
          <InternalLink className="btn" href={href}>
            Cancel
          </InternalLink>
          <Button
            tone="primary"
            type="submit"
            disabled={busy || !draft || !canEdit}
          >
            {busy ? "Saving…" : `Save ${singular[kind]}`}
          </Button>
        </div>
      </form>
    </main>
  );
}
function EffectFields({
  entry,
  onChange,
}: {
  entry: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { draft } = useWorldAuthoring();
  const modifiers = (entry.modifiers ??
    []) as WorldEffectDefinition["modifiers"];
  const defaultDuration = (entry.duration ?? {
    kind: "permanent",
  }) as WorldEffectDefinition["duration"];
  const attributeNames = Array.from(
    new Set(
      (draft?.records ?? [])
        .filter((r) => recordPayload(r).kind === "creature")
        .flatMap((r) =>
          Object.keys(object(object(recordPayload(r).components).attributes)),
        ),
    ),
  );
  const skillNames = Array.from(
    new Set(
      (draft?.records ?? [])
        .filter((r) => recordPayload(r).kind === "creature")
        .flatMap((r) =>
          Object.keys(object(object(recordPayload(r).components).skills)),
        ),
    ),
  );
  const attributeLabel = (key: string) =>
    draft?.effectiveModels?.attributes.find((option) => option.key === key)
      ?.name ?? readableKey(key, "Attribute");
  const properties = [
    ...attributeNames.flatMap((n) => [
      [`attributes.${n}.value`, `${attributeLabel(n)} (value)`],
      [`attributes.${n}.modifier`, `${attributeLabel(n)} (modifier)`],
    ]),
    ...skillNames.flatMap((n) => [
      [`skills.${n}.value`, `${readableKey(n, "Skill")} (value)`],
      [`skills.${n}.modifier`, `${readableKey(n, "Skill")} (modifier)`],
    ]),
    ["health.current", "Current health"],
    ["health.maximum", "Maximum health"],
    ["health.temporary", "Temporary health"],
    ...["walk", "run", "jump", "crawl", "swim", "climb", "fly", "burrow"].map(
      (n) => [`movement.${n}`, `${titleCase(n)} speed`],
    ),
    ["vision.day", "Daytime vision"],
    ["vision.night", "Nighttime vision"],
  ];
  const update = (index: number, patch: Record<string, unknown>) =>
    onChange({
      modifiers: modifiers.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    });
  const usedBy = (draft?.records ?? [])
    .filter(
      (r) =>
        r.resourceType === "world-conditions" &&
        ((recordPayload(r).effects as { effectId: string }[]) ?? []).some(
          (e) => e.effectId === entry.id,
        ),
    )
    .map((r) => recordName(r, "Condition"));
  return (
    <>
      <div>
        <strong>Reusable modifiers</strong>
        <p className="astra-muted" style={{ marginTop: 10, fontSize: 11 }}>
          Choose a numeric property from the domain model. Attributes and skills
          follow this world’s rule system. Negative additions reduce a value.
          Enable overrides to let each condition customize a modifier. Editing a
          shared default updates every condition that inherits it.
        </p>
        {usedBy.length > 0 && (
          <p className="astra-muted" style={{ marginTop: 12 }}>
            Used by: {usedBy.join(", ")}
          </p>
        )}
      </div>
      {modifiers.map((m, index) => {
        const duration = m.duration ?? defaultDuration;
        return (
          <Fieldset key={m.id}>
            <Legend>Modifier {index + 1}</Legend>
            <Field label="Affected property">
              <Select
                required
                value={m.propertyPath}
                onChange={(e) =>
                  update(index, { propertyPath: e.target.value })
                }
              >
                <option value="">Choose property</option>
                {!properties.some(([path]) => path === m.propertyPath) &&
                  m.propertyPath && (
                    <option value={m.propertyPath}>Existing property</option>
                  )}
                {properties.map(([path, label]) => (
                  <option key={path} value={path}>
                    {label} · {path}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="astra-form-grid">
              <Field label="Operation">
                <Select
                  value={m.operation}
                  onChange={(e) => update(index, { operation: e.target.value })}
                >
                  <option value="add">Add (negative values subtract)</option>
                  <option value="set">Set</option>
                  <option value="multiply">Multiply</option>
                </Select>
              </Field>
              <TextInput
                label="Default value"
                type="number"
                step="any"
                required
                value={m.value}
                onChange={(e) =>
                  update(index, { value: e.target.valueAsNumber })
                }
              />
              <TextInput
                label="Unit (optional)"
                value={m.unit ?? ""}
                onChange={(e) =>
                  update(index, { unit: e.target.value.trim() || undefined })
                }
              />
            </div>
            <Checkbox
              label="Allow conditions to override this value"
              checked={m.allowConditionOverride}
              onChange={(e) =>
                update(index, { allowConditionOverride: e.target.checked })
              }
            />
            <Field label="Duration">
              <Select
                value={duration.kind}
                onChange={(e) =>
                  update(index, {
                    duration:
                      e.target.value === "timed"
                        ? { kind: "timed", amount: 1, unit: "hours" }
                        : { kind: "permanent" },
                  })
                }
              >
                <option value="permanent">Permanent</option>
                <option value="timed">Timed</option>
              </Select>
            </Field>
            {duration.kind === "timed" && (
              <div className="astra-form-grid">
                <TextInput
                  label="Duration amount"
                  type="number"
                  min="1"
                  required
                  value={duration.amount}
                  onChange={(e) =>
                    update(index, {
                      duration: { ...duration, amount: e.target.valueAsNumber },
                    })
                  }
                />
                <Field label="Duration unit">
                  <Select
                    value={duration.unit}
                    onChange={(e) =>
                      update(index, {
                        duration: { ...duration, unit: e.target.value },
                      })
                    }
                  >
                    {["rounds", "minutes", "hours", "days"].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <Button
              type="button"
              tone="ghost"
              onClick={() =>
                onChange({ modifiers: modifiers.filter((_, i) => i !== index) })
              }
            >
              Remove modifier {index + 1}
            </Button>
          </Fieldset>
        );
      })}
      <Button
        type="button"
        style={{ justifySelf: "start" }}
        onClick={() =>
          onChange({
            modifiers: [
              ...modifiers,
              {
                id: crypto.randomUUID(),
                propertyPath: properties[0]?.[0] ?? "health.current",
                operation: "add",
                value: 0,
                allowConditionOverride: false,
              },
            ],
          })
        }
      >
        Add modifier
      </Button>
    </>
  );
}
function ConditionFields({
  entry,
  onChange,
}: {
  entry: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { draft } = useWorldAuthoring();
  const effects = (draft?.records ?? [])
    .filter((r) => r.resourceType === "world-effects")
    .map((r) => recordPayload(r) as unknown as WorldEffectDefinition);
  const selected = (entry.effects ?? []) as WorldConditionDefinition["effects"];
  const availableEffects = effects.filter(
    (effect) => !selected.some((choice) => choice.effectId === effect.id),
  );
  return (
    <>
      <div>
        <strong>Effects granted by this condition</strong>
        <p className="astra-muted" style={{ marginTop: 10, fontSize: 11 }}>
          Choose reusable effects from the Codex. Conditions share their
          definitions. Leave an override blank to inherit the current default;
          an explicit override stays fixed when that default changes.
        </p>
      </div>
      {selected.map((choice, index) => {
        const effect = effects.find((e) => e.id === choice.effectId);
        return (
          <Fieldset key={index}>
            <Legend>Effect {index + 1}</Legend>
            <Field label="Reusable effect">
              <Select
                required
                value={choice.effectId}
                onChange={(e) =>
                  onChange({
                    effects: selected.map((s, i) =>
                      i === index ? { effectId: e.target.value } : s,
                    ),
                  })
                }
              >
                <option value="">Choose effect</option>
                {effects
                  .filter(
                    (effect) =>
                      effect.id === choice.effectId ||
                      !selected.some((other) => other.effectId === effect.id),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {effect && (
              <>
                <p className="astra-muted">{effect.description}</p>
                {effect.modifiers.map((m) => (
                  <div key={m.id}>
                    <p>
                      {m.propertyPath
                        .split(".")
                        .map(
                          (key) =>
                            draft?.effectiveModels?.attributes.find(
                              (option) => option.key === key,
                            )?.name ?? readableKey(key),
                        )
                        .join(" · ")}{" "}
                      · {m.operation} {m.value} ·{" "}
                      {(() => {
                        const duration = m.duration ?? effect.duration;
                        return duration.kind === "timed"
                          ? `${duration.amount} ${duration.unit}`
                          : "Permanent";
                      })()}
                    </p>
                    {m.allowConditionOverride ? (
                      <TextInput
                        label="Override value (optional)"
                        type="number"
                        step="any"
                        placeholder={String(m.value)}
                        value={choice.modifierOverrides?.[m.id] ?? ""}
                        onChange={(e) => {
                          const overrides = { ...choice.modifierOverrides };
                          if (e.target.value === "") delete overrides[m.id];
                          else overrides[m.id] = e.target.valueAsNumber;
                          onChange({
                            effects: selected.map((s, i) =>
                              i === index
                                ? { ...s, modifierOverrides: overrides }
                                : s,
                            ),
                          });
                        }}
                      />
                    ) : (
                      <small className="astra-muted">
                        Uses the shared default; this modifier is not
                        parameterized.
                      </small>
                    )}
                  </div>
                ))}
              </>
            )}
            <Button
              type="button"
              tone="ghost"
              onClick={() =>
                onChange({ effects: selected.filter((_, i) => i !== index) })
              }
            >
              Remove effect {index + 1}
            </Button>
          </Fieldset>
        );
      })}
      <Button
        type="button"
        style={{ justifySelf: "start" }}
        disabled={!availableEffects.length}
        onClick={() =>
          onChange({
            effects: [...selected, { effectId: availableEffects[0]?.id ?? "" }],
          })
        }
      >
        Add effect
      </Button>
      {!effects.length && (
        <p className="astra-muted">
          Create a reusable effect in the Effects tab first.
        </p>
      )}
    </>
  );
}
function CharacterFields({
  entry,
  onChange,
  existing,
  onBusyChange,
  disabled,
}: {
  entry: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  existing: boolean;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const { definition, draft } = useWorldAuthoring();
  const records = draft?.records ?? [];
  const creatures = records.filter((r) => recordPayload(r).kind === "creature");
  const equipmentItems = worldEquipmentItems(records);
  const conditions = records.filter(
    (r) => r.resourceType === "world-conditions",
  );
  const character = entry as unknown as WorldCharacterTemplate;
  const creatureRecord = creatures.find(
    (r) => r.sourceId === character.creatureDefinitionId,
  );
  const supportedSlots = creatureRecord
    ? object(recordPayload(creatureRecord).components).equipmentSlots
    : [];
  const [source, setSource] = useState("keep");
  const [imageError, setImageError] = useState("");
  function template(id: string) {
    const record = creatures.find((r) => r.sourceId === id);
    const p = record ? recordPayload(record) : {};
    const c = object(p.components);
    const attributes = object(c.attributes);
    const movement = Object.fromEntries(
      (Array.isArray(c.movement) ? c.movement : []).map(
        (m: Record<string, unknown>) => [
          String(m.mode),
          Number(object(m.distance).value ?? m.speed ?? 0),
        ],
      ),
    );
    onChange({
      creatureDefinitionId: id,
      attributes,
      skills: object(c.skills),
      health: c.health ?? { current: 20, maximum: 20, temporary: 0 },
      movement: Object.keys(movement).length ? movement : entry.movement,
      vision: c.vision ?? { day: 60, night: 30 },
      images: object(object(c.art).images),
      grantedConditions: c.grantedConditions ?? [],
      equipment: Array.isArray(c.equipment) ? structuredClone(c.equipment) : [],
    });
  }
  const imageRoles = [
    ["portrait", "Portrait"],
    ["paperDollToken", "Side-on token · Side-view maps"],
    ["overheadToken", "Overhead token · Top-down maps"],
  ] as const;
  const imageChange = (role: string, image: unknown) =>
    onChange({ images: { ...object(entry.images), [role]: image } });
  async function upload(role: string, file: File) {
    setImageError("");
    onBusyChange(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose an image smaller than 5 MB.");
      const media = await uploadWorldMedia(
        definition.id,
        file,
        "creature-artwork",
      );
      const imageUrl = URL.createObjectURL(file);
      let dimensions: { width: number; height: number };
      try {
        dimensions = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () =>
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () =>
            reject(new Error("This image could not be opened."));
          image.src = imageUrl;
        });
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
      imageChange(role, {
        assetId: media.id,
        altText: `${String(entry.name || "Character")} ${role}`,
        ...dimensions,
        mimeType: media.mimeType,
      });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      onBusyChange(false);
    }
  }
  const numberGroup = (
    title: string,
    key: string,
    labels?: Record<string, string>,
    modifiers = false,
  ) => {
    const values = object(entry[key]);
    return (
      <Fieldset>
        <Legend>{title}</Legend>
        {modifiers && (
          <small className="astra-muted">Value · automatic modifier</small>
        )}
        <div className="astra-stat-fields">
          {Object.entries(values).map(([name, value]) => (
            <Field
              key={name}
              label={
                labels?.[name] ??
                readableKey(name, title === "Skills" ? "Skill" : "Attribute")
              }
            >
              <div style={{ display: "flex", gap: 5 }}>
                <Input
                  aria-label={`${title} ${labels?.[name] ?? readableKey(name, title === "Skills" ? "Skill" : "Attribute")}`}
                  type="number"
                  step="any"
                  required
                  value={Number(value)}
                  onChange={(e) =>
                    onChange({
                      [key]: { ...values, [name]: e.target.valueAsNumber },
                    })
                  }
                />
                {modifiers && (
                  <span
                    className="astra-badge"
                    title="Automatic modifier"
                    style={{ margin: 0, alignSelf: "center" }}
                  >
                    {formatAstraModifier(Number(value))}
                  </span>
                )}
              </div>
            </Field>
          ))}
        </div>
        {!Object.keys(values).length && (
          <p className="astra-muted">
            Choose a creature template to populate {title.toLowerCase()}.
          </p>
        )}
      </Fieldset>
    );
  };
  return (
    <>
      <Fieldset>
        <Legend>Character portrait and tokens</Legend>
        <Field label="Choose an image source">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="keep">
              {Object.keys(object(entry.images)).length
                ? "Keep current images"
                : "No image yet"}
            </option>
            <option value="existing">Choose an existing image</option>
            <option value="upload">Upload an image</option>
            <option value="generate">Generate with AI</option>
          </Select>
        </Field>
        <div className="astra-character-images">
          {imageRoles.map(([role, label]) => (
            <div key={role} className={`astra-image-${role}`}>
              <small>{label}</small>
              <MediaImage
                image={object(entry.images)[role]}
                name={`${String(entry.name || "Character")} ${label}`}
              />
              {source === "upload" && (
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={`Upload ${label}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(role, file);
                  }}
                />
              )}
              {source === "existing" && (
                <Select
                  aria-label={`Choose ${label}`}
                  value=""
                  onChange={(e) => {
                    const r = records.find(
                      (r) => r.sourceId === e.target.value,
                    );
                    if (r) {
                      const p = recordPayload(r);
                      imageChange(
                        role,
                        object(object(object(p.components).art).images)[role] ??
                          object(p.images)[role],
                      );
                    }
                  }}
                >
                  <option value="">Choose saved artwork</option>
                  {records
                    .filter((r) => {
                      const p = recordPayload(r);
                      return Boolean(
                        object(object(object(p.components).art).images)[role] ??
                        object(p.images)[role],
                      );
                    })
                    .map((r) => (
                      <option key={r.sourceId} value={r.sourceId}>
                        {recordName(r, "Saved artwork")}
                      </option>
                    ))}
                </Select>
              )}
              {source === "generate" && draft && (
                <ArtworkGenerator
                  worldId={definition.id}
                  storageRevision={draft.storageRevision}
                  role={role}
                  label={label}
                  name={String(entry.name ?? "")}
                  description={String(entry.description ?? "")}
                  direction=""
                  hasImage={!!object(entry.images)[role]}
                  disabled={!entry.name}
                  onApply={(image) => imageChange(role, image)}
                  onBusyChange={onBusyChange}
                />
              )}
            </div>
          ))}
        </div>
        {imageError && (
          <p className="astra-error" role="alert">
            {imageError}
          </p>
        )}
      </Fieldset>
      <Field
        label="Creature template"
        help="Template is fixed after creation. Stats below belong to this character."
      >
        <Select
          required
          disabled={existing}
          value={String(entry.creatureDefinitionId ?? "")}
          onChange={(e) => template(e.target.value)}
        >
          <option value="">Choose a creature template</option>
          {creatures.map((r) => (
            <option key={r.sourceId} value={r.sourceId}>
              {recordName(r, "Creature")}
            </option>
          ))}
        </Select>
      </Field>
      {numberGroup(
        "Attributes",
        "attributes",
        Object.fromEntries(
          (draft?.effectiveModels?.attributes ?? []).map((option) => [
            option.key,
            option.name,
          ]),
        ),
        true,
      )}
      {numberGroup("Skills", "skills", undefined, true)}
      {numberGroup("Health", "health", {
        current: "Current health",
        maximum: "Maximum health",
        temporary: "Temporary health",
      })}
      {numberGroup(
        "Movement speed",
        "movement",
        Object.fromEntries(
          Object.keys(object(entry.movement)).map((k) => [k, titleCase(k)]),
        ),
      )}
      {numberGroup("Vision distance", "vision", {
        day: "Daytime vision",
        night: "Nighttime vision",
      })}
      <EquipmentPaperdoll
        slots={worldEquipmentSlots(
          supportedSlots,
          draft?.effectiveModels?.equipmentSlots ?? [],
        )}
        items={equipmentItems}
        disabled={disabled}
        equipment={character.equipment ?? []}
        onChange={(equipment) => onChange({ equipment })}
      />
      <Fieldset>
        <Legend>Granted conditions</Legend>
        <p className="astra-muted">
          Choose conditions this source can grant to an affected entity. Each
          condition keeps its references to reusable effects. Automatic
          application and duration countdown will be part of gameplay.
        </p>
        <div className="astra-checks">
          {conditions.map((r) => (
            <Checkbox
              key={r.sourceId}
              label={recordName(r, "Condition")}
              checked={(character.grantedConditions ?? []).some(
                (c) => c.conditionId === r.sourceId,
              )}
              onChange={(e) =>
                onChange({
                  grantedConditions: e.target.checked
                    ? [
                        ...(character.grantedConditions ?? []),
                        { conditionId: r.sourceId },
                      ]
                    : (character.grantedConditions ?? []).filter(
                        (c) => c.conditionId !== r.sourceId,
                      ),
                })
              }
            />
          ))}
        </div>
      </Fieldset>
    </>
  );
}
