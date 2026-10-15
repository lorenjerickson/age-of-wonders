import { BadRequestException } from "@nestjs/common";
import { Creature } from "@aow/domain";
import type { CombatContribution, CombatProfile } from "@aow/common";
import { array, object, records } from "./session-movement-state";
export type CombatSource = CombatContribution["source"];
/** Sources are bindings to this captured actor, not a list of the entire catalog. */
export function encounterSources(
  entry: Record<string, unknown>,
  state: Record<string, unknown>,
  manifest: unknown,
): CombatSource[] {
  const actor = object(entry.creature),
    catalog = records(manifest);
  const definition = object(
    catalog.find((r) => r.sourceId === actor.definitionId)?.payload,
  );
  const sheet = object(object(actor.extensions)["aow:approvedCharacterSheet"]);
  const components = object(definition.components);
  const sources: CombatSource[] = [
    { kind: "base", id: "base", name: "Base roll" },
  ];
  const label = (id: string, fallback: string) => {
    const row = object(catalog.find((r) => r.sourceId === id)?.payload);
    const name =
      row.name ?? object(row.identity).name ?? object(row.element).name;
    return typeof name === "string" && name.trim() ? name : fallback;
  };
  const add = (kind: CombatSource["kind"], id: string, name: string) => {
    if (!sources.some((s) => s.kind === kind && s.id === id))
      sources.push({ kind, id, name });
  };
  const equipped = new Set(
    Object.values(object(object(actor.equipment).slots)),
  );
  for (const item of array(state.itemInstances))
    if (equipped.has(item.id)) {
      const itemDefinition = object(
        catalog.find((r) => r.sourceId === item.definitionId)?.payload,
      );
      const c = object(itemDefinition.components);
      // Equipped Items may provide either contribution; the GM explicitly authors its formula.
      if (typeof item.id === "string") {
        if (c.weapon !== undefined || c.armor === undefined)
          add(
            "weapon",
            item.id,
            label(String(item.definitionId), "Equipped Item"),
          );
        if (c.armor !== undefined || c.weapon === undefined)
          add(
            "armor",
            item.id,
            label(String(item.definitionId), "Equipped Item"),
          );
      }
    }
  for (const source of [components, sheet, actor]) {
    for (const key of Object.keys(object(source.attributes)))
      add("attribute", key, label(key, "Captured Attribute"));
    for (const key of Object.keys(object(source.skills)))
      add("skill", key, label(key, "Captured Skill"));
    if (Array.isArray(source.skillDefinitionIds))
      for (const id of source.skillDefinitionIds)
        if (typeof id === "string")
          add("skill", id, label(id, "Captured Skill"));
    for (const skill of array(source.skills))
      if (typeof skill.skillDefinitionId === "string")
        add(
          "skill",
          skill.skillDefinitionId,
          label(skill.skillDefinitionId, "Captured Skill"),
        );
  }
  for (const id of Creature.effectiveConditions(actor))
    add("condition", id, label(id, "Active Condition"));
  return sources;
}
export function bindCombatProfile(
  profile: CombatProfile,
  allowed: readonly CombatSource[],
): CombatProfile {
  if (!profile || typeof profile !== "object")
    throw new BadRequestException(
      "Configure every combat roll before starting.",
    );
  const formula = (value: readonly CombatContribution[]) => {
    if (!Array.isArray(value))
      throw new BadRequestException("Configure each roll formula explicitly.");
    return value.map((c: CombatContribution) => {
      const source = allowed.find(
        (s) => s.id === c?.source?.id && s.kind === c?.source?.kind,
      );
      if (!source)
        throw new BadRequestException(
          "A roll contribution is not available to this captured actor.",
        );
      return { ...c, source };
    });
  };
  return {
    ...profile,
    reactions: profile.reactions?.map((r) => ({
      ...r,
      defense: formula(r.defense),
    })),
    attack: formula(profile.attack),
    defense: formula(profile.defense),
    damage: formula(profile.damage),
    resistance: formula(profile.resistance),
    might: formula(profile.might),
    pairings: profile.pairings?.map((p) => ({
      ...p,
      first: formula(p.first),
      second: formula(p.second),
    })),
  };
}
