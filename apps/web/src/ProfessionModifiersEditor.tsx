import { isModifierGrantDefinition } from "@aow/common";
import { Alert, Button, Field, Fieldset, Input, Legend, Select } from "@aow/ui";
import type { JsonValue, WorldModelOption } from "./api";
import { levelModifierGrants, modifierObject, withLevelModifierGrants, type ProfessionModifierLevel } from "./professionModifierModel";

export type ModifierEdit = { levelIndex: number; index: number | null; grant: Record<string, JsonValue> };

type Option = { key: string; name: string };
type TargetOption = Option & { target: Record<string, JsonValue> };

export function ProfessionModifiersEditor({ levels, onChange, startingRank, ranks, attributes, skills, statistics, disabled, editing, onEditingChange }: {
  editing: ModifierEdit | null;
  onEditingChange: (editing: ModifierEdit | null) => void;
  levels: ProfessionModifierLevel[];
  onChange: (levels: ProfessionModifierLevel[]) => void;
  startingRank: string;
  ranks: WorldModelOption[];
  attributes: Option[];
  skills: Option[];
  statistics: Option[];
  disabled: boolean;
}) {
  const targets: TargetOption[] = [
    { key: "health", name: "Maximum health", target: { kind: "health-maximum" } },
    ...attributes.map(a => ({ key: `attribute:${a.key}`, name: `Attribute · ${a.name}`, target: { kind: "attribute", attribute: a.key } })),
    ...["hit", "defense", "damage"].map(roll => ({ key: roll, name: `${roll[0].toUpperCase()}${roll.slice(1)} rolls`, target: { kind: "roll", roll } })),
    ...skills.map(s => ({ key: `skill:${s.key}`, name: `Skill · ${s.name}`, target: { kind: "skill-check", skillDefinitionId: s.key } })),
    ...statistics.map(s => ({ key: `statistic:${s.key}`, name: `Statistic · ${s.name}`, target: { kind: "statistic", key: s.key } })),
  ];
  const allowed = (kind: JsonValue | undefined) => targets.filter(t => kind === "skill-proficiency"
    ? t.target.kind === "skill-check" : kind === "roll-dice"
      ? t.target.kind === "roll" || t.target.kind === "skill-check" : true);
  return <Fieldset disabled={disabled} className="space-y-6 rounded-box border border-base-300 p-5">
    <Legend>Profession modifiers</Legend>
    <p className="text-sm text-base-content/65">Modifiers add together, even when they affect the same target. Add or update them in this list, then Save Profession to save all changes.</p>
    {levels.map((level, levelIndex) => {
      const grants = levelModifierGrants(level);
      const rank = levelIndex === 0 ? startingRank : String(level.tier ?? "");
      const rankName = ranks.find(r => r.key === rank)?.name ?? (levelIndex === 0 ? "Starting rank" : `Rank ${levelIndex + 1}`);
      const update = (_index: number, changes: Record<string, JsonValue>) => {
        if (editing) onEditingChange({ ...editing, grant: { ...editing.grant, ...changes } });
      };
      return <section key={levelIndex} className="space-y-4" aria-label={`${rankName} modifiers`}>
        <h2 className="text-lg font-semibold">{rankName}</h2>
        {!grants.length && <p className="text-sm text-base-content/60">No modifiers at this rank.</p>}
        {grants.length > 0 && <ul className="divide-y divide-base-300 rounded-box border border-base-300" aria-label={`${rankName} modifier list`}>
          {grants.map((grant, index) => {
            const target = modifierObject(grant.target);
            const targetName = targets.find(t => Object.entries(t.target).every(([key, value]) => target[key] === value))?.name ?? "Unavailable target";
            const recipe = Array.isArray(grant.dice) ? grant.dice.map(d => { const die = modifierObject(d); return `${die.count}d${die.sides}`; }).join(" + ") : "No dice";
            return <li key={String(grant.id ?? index)} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="font-medium">{String(grant.label || "Unnamed modifier")}</p><p className="text-sm text-base-content/65">{targetName} · {recipe} · {grant.kind === "rolled-flat" ? "rolled once" : grant.kind === "skill-proficiency" ? "proficiency dice per check" : "dice per check"}</p></div>
              <div className="flex gap-2">
                <Button type="button" tone="ghost" size="sm" disabled={!!editing} onClick={() => onEditingChange({ levelIndex, index, grant: structuredClone(grant) })}>Edit</Button>
                <Button type="button" tone="ghost" size="sm" disabled={!!editing} onClick={() => onChange(withLevelModifierGrants(levels, levelIndex, grants.filter((_, i) => i !== index)))}>Delete</Button>
              </div>
            </li>;
          })}
        </ul>}
        <Button type="button" tone="outline" disabled={!!editing || grants.length >= 128} onClick={() => onEditingChange({ levelIndex, index: null, grant: {
          id: crypto.randomUUID(), label: "", kind: "rolled-flat", stacking: "add",
          target: attributes.length ? { kind: "attribute", attribute: attributes[0].key } : { kind: "health-maximum" }, dice: [{ count: 1, sides: 4 }],
        } })}>Add modifier</Button>
        {(editing?.levelIndex === levelIndex ? [editing.grant] : []).map((grant, index) => {
          const target = modifierObject(grant.target);
          const choices = allowed(grant.kind);
          const selected = choices.find(t => Object.entries(t.target).every(([key, value]) => target[key] === value));
          const dice = Array.isArray(grant.dice) ? grant.dice.map(modifierObject) : [];
          const valid = !!selected && isModifierGrantDefinition(grant);
          const apply = () => {
            if (!valid || !editing) return;
            onChange(withLevelModifierGrants(levels, levelIndex, editing.index === null
              ? [...grants, grant] : grants.map((g, i) => i === editing.index ? grant : g)));
            onEditingChange(null);
          };
          return <Fieldset key={String(grant.id ?? index)} className="space-y-4 rounded-box border border-base-300 p-4" onKeyDown={event => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); apply(); }
          }}>
            <Legend>{editing?.index === null ? "New modifier" : "Edit modifier"}</Legend>
            <Field label="Modifier name" required><Input required value={String(grant.label ?? "")} onChange={e => update(index, { label: e.target.value })} placeholder="e.g. Forge strength" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Benefit" required><Select value={String(grant.kind ?? "")} onChange={e => {
                const kind = e.target.value;
                const nextChoices = allowed(kind);
                const keep = nextChoices.some(t => Object.entries(t.target).every(([key, value]) => target[key] === value));
                update(index, { kind, target: keep ? target : nextChoices[0]?.target ?? { kind: "skill-check", skillDefinitionId: "" } });
              }}>
                <option value="rolled-flat">Permanent increase · roll once</option>
                <option value="roll-dice">Additional dice · every check</option>
                <option value="skill-proficiency">Skill proficiency · every check</option>
              </Select></Field>
              <Field label="Affects" required><Select required value={selected?.key ?? ""} onChange={e => {
                const choice = choices.find(t => t.key === e.target.value);
                if (choice) update(index, { target: choice.target });
              }}><option value="" disabled>Choose a target</option>{choices.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}</Select></Field>
            </div>
            {!selected && <Alert tone="warning">Choose an available target. Skills must first be authored in this World.</Alert>}
            <p className="text-sm text-base-content/65">{grant.kind === "rolled-flat"
              ? "Roll these dice once when this modifier is granted. Keep the total as a flat bonus; do not reroll it for checks."
              : "Add these dice to each applicable check, alongside any other modifiers."}</p>
            {dice.map((die, dieIndex) => <div key={dieIndex} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field label={`Dice count ${dieIndex + 1}`} required><Input required type="number" min={1} max={100} step={1} value={String(die.count ?? "")} onChange={e => update(index, { dice: dice.map((d, i) => i === dieIndex ? { ...d, count: e.target.value === "" ? "" : Number(e.target.value) } : d) })} /></Field>
              <Field label={`Die sides ${dieIndex + 1}`} required><Input required type="number" min={2} max={10000} step={1} value={String(die.sides ?? "")} onChange={e => update(index, { dice: dice.map((d, i) => i === dieIndex ? { ...d, sides: e.target.value === "" ? "" : Number(e.target.value) } : d) })} /></Field>
              <Button type="button" tone="ghost" disabled={dice.length <= 1} aria-label={`Remove dice group ${dieIndex + 1}`} onClick={() => update(index, { dice: dice.filter((_, i) => i !== dieIndex) })}>Remove</Button>
            </div>)}
            <p className="text-sm font-medium">{dice.map(d => `${d.count || "?"}d${d.sides || "?"}`).join(" + ")}{grant.kind === "rolled-flat" ? " rolled once" : " per check"}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" tone="outline" size="sm" disabled={dice.length >= 32} onClick={() => update(index, { dice: [...dice, { count: 1, sides: 4 }] })}>Add dice group</Button>
              <Button type="button" tone="primary" disabled={!valid} onClick={apply}>{editing?.index === null ? "Add to list" : "Update modifier"}</Button>
              <Button type="button" tone="ghost" onClick={() => onEditingChange(null)}>Cancel</Button>
            </div>
          </Fieldset>;
        })}
      </section>;
    })}
  </Fieldset>;
}
