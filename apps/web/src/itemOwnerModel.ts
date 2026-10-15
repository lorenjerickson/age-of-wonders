import type { JsonValue } from "@aow/common";
import { type MechanicsObject } from "./itemMechanicsModel";
import { ruleChildren } from "./ruleNodeModel";
export type ItemOwnerType =
  | "item"
  | "attunement"
  | "capacity"
  | "crafting"
  | "ingredient"
  | "product"
  | "currency"
  | "tool proficiency"
  | "predicate"
  | "modifier";
export interface ItemOwnerChild {
  key: string;
  label: string;
  type: ItemOwnerType;
  list?: boolean;
}
const child = (
  key: string,
  label: string,
  type: ItemOwnerType,
  list = false,
): ItemOwnerChild => ({ key, label, type, list });
export function itemOwnerChildren(
  type: ItemOwnerType,
  value: unknown,
): ItemOwnerChild[] {
  switch (type) {
    case "item":
      return [
        child("prerequisites", "Prerequisites", "predicate", true),
        child("modifiers", "Modifiers", "modifier", true),
        child("attunement", "Attunement", "attunement"),
        child("capacity", "Capacity", "capacity"),
        child("crafting", "Crafting", "crafting"),
      ];
    case "attunement":
      return [child("prerequisites", "Prerequisites", "predicate", true)];
    case "crafting":
      return [
        child("cost", "Cost", "currency", true),
        child("ingredients", "Ingredients", "ingredient", true),
        child(
          "toolProficiencies",
          "Tool proficiencies",
          "tool proficiency",
          true,
        ),
        child("produces", "Products", "product", true),
      ];
    case "modifier":
    case "predicate":
      return ruleChildren(type, value).map((c) => ({
        ...c,
        type: "predicate",
      }));
    default:
      return [];
  }
}
export function parseItemOwnerRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "owner" ? { segments: parts.slice(1) } : undefined;
}
function object(value: unknown): MechanicsObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "This Item field contains unsupported data. Existing data has been preserved.",
    );
  return value as MechanicsObject;
}
export function itemOwnerEntries(
  value: unknown,
  type: ItemOwnerType,
): JsonValue[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((v) =>
      type === "tool proficiency"
        ? typeof v !== "string"
        : !v || typeof v !== "object" || Array.isArray(v),
    )
  )
    throw new Error(
      "This collection contains unsupported data. Existing data has been preserved.",
    );
  return value;
}
export function resolveItemOwnerNode(
  root: MechanicsObject,
  segments: readonly string[],
) {
  let value: unknown = root,
    type: ItemOwnerType = "item",
    list = false,
    label = "Item rules";
  const labels: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (list) {
      const entries = itemOwnerEntries(value, type);
      if (segment === "new" && i === segments.length - 1) {
        value = undefined;
        list = false;
        label = `New ${type}`;
        labels.push(label);
        continue;
      }
      if (
        !/^(0|[1-9]\d*)$/.test(segment) ||
        !Number.isSafeInteger(Number(segment)) ||
        Number(segment) >= entries.length
      )
        throw new Error("This Item entry is no longer available.");
      value = entries[Number(segment)];
      list = false;
      label = `${type[0].toUpperCase() + type.slice(1)} ${Number(segment) + 1}`;
    } else {
      const node = object(value);
      const spec: ItemOwnerChild | undefined = itemOwnerChildren(type, node).find((c) => c.key === segment);
      if (!spec) throw new Error("This Item field is unavailable.");
      value = node[segment];
      type = spec.type;
      list = !!spec.list;
      label = spec.label;
      if (value !== undefined) {
        if (list) itemOwnerEntries(value, type);
        else object(value);
      }
    }
    labels.push(label);
  }
  return { value, type, list, label, labels, isNew: segments.at(-1) === "new" };
}
export function replaceItemOwnerNode(
  root: MechanicsObject,
  segments: readonly string[],
  next: JsonValue | undefined,
): MechanicsObject {
  resolveItemOwnerNode(root, segments);
  if (!segments.length) throw new Error("Choose an Item field to edit.");
  function replace(value: unknown, at: number): JsonValue | undefined {
    if (at === segments.length) return next;
    const key = segments[at];
    if (Array.isArray(value)) {
      const result = [...value];
      if (key === "new") result.push(next);
      else if (at === segments.length - 1 && next === undefined)
        result.splice(Number(key), 1);
      else result[Number(key)] = replace(result[Number(key)], at + 1);
      return result;
    }
    const node = object(value),
      result = { ...node };
    if (at === segments.length - 1 && next === undefined) delete result[key];
    else
      result[key] = replace(
        node[key] === undefined && segments[at + 1] === "new" ? [] : node[key],
        at + 1,
      ) as JsonValue;
    return result;
  }
  return replace(root, 0) as MechanicsObject;
}
export function itemOwnerPatch(
  root: MechanicsObject,
  segments: readonly string[],
  next: JsonValue | undefined,
) {
  const result = replaceItemOwnerNode(root, segments, next),
    key = segments[0];
  return { [key]: result[key] ?? null };
}
export function newItemOwnerValue(type: ItemOwnerType): JsonValue {
  switch (type) {
    case "attunement":
      return { required: false };
    case "capacity":
      return { maximum: { kind: "constant", value: 0 } };
    case "crafting":
      return { time: { kind: "constant", value: 0 }, produces: [] };
    case "ingredient":
      return { quantity: { kind: "constant", value: 1 }, consumed: true };
    case "product":
      return { itemId: "", quantity: { kind: "constant", value: 1 } };
    case "currency":
      return { denomination: "gp", amount: 0 };
    case "tool proficiency":
      return "";
    case "predicate":
      return { kind: "always" };
    case "modifier":
      return { id: crypto.randomUUID(), target: "", operation: "add" };
    default:
      return {};
  }
}
