import {
  canonicalEquipmentSlotKey,
  containerSlotCapacity,
  isBeltSlotCompatible,
  type SlottedContainerDefinition,
  type ItemComponents,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type ValidationContext,
  type DeepReadonly,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
import { Item } from "./item";
export type EquipmentObject = Record<string, unknown>;
export interface ActorEquipmentData {
  actor: EquipmentObject;
  items: EquipmentObject[];
}
export interface ActorEquipmentContext extends ValidationContext {
  definitions: readonly EquipmentObject[];
  availableSlots: readonly string[];
}
export interface EquipmentOperation {
  action:
    | "create"
    | "equip"
    | "unequip"
    | "stow"
    | "retrieve"
    | "quantity"
    | "allowance";
  itemId?: string;
  definitionId?: string;
  slots?: readonly string[];
  containerId?: string;
  index?: number;
  quantity?: number;
  bonusActions?: number;
  createdId?: string;
  updatedAt: string;
}
type Commands = {
  change: { params: EquipmentOperation; context: Record<string, never> };
};
type Events = { changed: { action: string; itemId?: string } };
/** Owns one actor's equipment and the captured Item graph. Persistence/CAS and authorization are external. */
export class ActorEquipment extends Entity<
  ActorEquipmentData,
  Commands,
  Events,
  ActorEquipmentContext
> {
  private readonly capture: ActorEquipmentContext;
  private constructor(
    data: ActorEquipmentData,
    capture: ActorEquipmentContext,
    options?: EntityOptions,
  ) {
    super("actor-equipment", data, ["changed"], capture, options);
    this.capture = copyEntityData(capture);
    this.validate(this.capture);
  }
  static deserialize(
    data: ActorEquipmentData,
    context: ActorEquipmentContext,
    options?: EntityOptions,
  ) {
    return new ActorEquipment(data, context, options);
  }
  serializePayload() {
    return this.serialize().data;
  }
  protected validateState(data: DeepReadonly<ActorEquipmentData>) {
    try {
      this.inspect(data as ActorEquipmentData);
      return [];
    } catch (e) {
      return [
        {
          code: "actor-equipment-invalid",
          message:
            e instanceof Error ? e.message : "Equipment state is invalid.",
        },
      ];
    }
  }
  private inspect(data: ActorEquipmentData) {
    if (typeof data.actor.entityId !== "string" || !data.actor.entityId.trim())
      throw new TypeError("The actor identity is invalid.");
    if (
      data.actor.inventory !== undefined &&
      (!isObject(data.actor.inventory) ||
        !Array.isArray(data.actor.inventory.itemIds) ||
        data.actor.inventory.itemIds.some((id) => typeof id !== "string"))
    )
      throw new TypeError(
        "Existing inventory must be repaired before changing equipment.",
      );
    const ids = new Set<string>();
    for (const i of data.items) {
      const item = Item.deserializePayload(i);
      try {
        if (item.state.metadata.validity.status === "invalid")
          throw new TypeError("An Item has invalid runtime data.");
      } finally {
        item.dispose();
      }
      if (ids.has(String(i.id)))
        throw new TypeError("Item identities must be unique.");
      ids.add(String(i.id));
    }
    const equipment =
      data.actor.equipment === undefined
        ? { slots: {}, containers: [] }
        : obj(data.actor.equipment);
    if (!isObject(equipment.slots) || !Array.isArray(equipment.containers))
      throw new TypeError(
        "Existing equipment must be repaired before changing it.",
      );
    const occupied = new Map<string, string[]>();
    const occupiedSlots = new Map<string, string>();
    for (const [slot, id] of Object.entries(obj(equipment.slots))) {
      if (
        typeof id !== "string" ||
        !this.capture.availableSlots
          .map(canonicalEquipmentSlotKey)
          .includes(canonicalEquipmentSlotKey(slot))
      )
        throw new TypeError("An equipped slot is unavailable.");
      const item = this.item(data, id);
      this.requireOwned(data, item);
      if (obj(item.location).kind === "container")
        throw new TypeError(
          "A contained Item cannot also occupy an actor slot.",
        );
      const key = canonicalEquipmentSlotKey(slot);
      if (occupiedSlots.has(key) && occupiedSlots.get(key) !== id)
        throw new TypeError("An equipment slot is occupied.");
      occupiedSlots.set(key, id);
      occupied.set(id, [...new Set([...(occupied.get(id) ?? []), key])]);
    }
    for (const [id, slots] of occupied)
      this.fit(this.definition(this.item(data, id)), slots);
    if (data.actor.extensions !== undefined && !isObject(data.actor.extensions))
      throw new TypeError(
        "Existing actor extensions must be repaired before changing equipment.",
      );
    const rules = obj(data.actor.extensions)["aow:rules"];
    if (rules !== undefined && !isObject(rules))
      throw new TypeError(
        "Existing actor resources must be repaired before changing equipment.",
      );
    const containerIds = new Set<unknown>();
    const stored = new Set<string>();
    for (const raw of equipment.containers) {
      const c = obj(raw),
        item = this.item(data, String(c.containerItemId));
      this.requireOwned(data, item);
      if (containerIds.has(item.id))
        throw new TypeError("Container identities must be unique.");
      containerIds.add(item.id);
      const capacity = this.capacity(item);
      if (!Array.isArray(c.slots))
        throw new TypeError("Container slots are malformed.");
      const positions = new Set<number>();
      for (const rawSlot of c.slots) {
        const slot = obj(rawSlot);
        if (
          !Number.isSafeInteger(slot.index) ||
          Number(slot.index) < 0 ||
          Number(slot.index) >= capacity ||
          positions.has(Number(slot.index))
        )
          throw new TypeError("Container slot positions are invalid.");
        positions.add(Number(slot.index));
        if (slot.itemId !== undefined) {
          if (typeof slot.itemId !== "string" || stored.has(slot.itemId))
            throw new TypeError("An Item occupies multiple container slots.");
          stored.add(slot.itemId);
          const child = this.item(data, slot.itemId);
          this.requireOwned(data, child);
          if (obj(child.location).containerId !== item.id)
            throw new TypeError("Item containment disagrees with its slot.");
          this.accepts(item, child);
        }
      }
      if (positions.size !== capacity)
        throw new TypeError(
          "Container capacity changed; reconcile its slots before editing.",
        );
    }
    for (const item of data.items)
      if (
        this.owned(data, item) &&
        obj(item.location).kind === "container" &&
        !stored.has(String(item.id))
      )
        throw new TypeError("A contained Item has no container slot.");
  }
  private item(data: ActorEquipmentData, id: string) {
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new TypeError("The Item is unavailable.");
    return item;
  }
  private definition(item: EquipmentObject) {
    const d = this.capture.definitions.find(
      (d) => obj(d.identity).id === item.definitionId,
    );
    if (!d) throw new TypeError("The captured Item definition is unavailable.");
    return d;
  }
  private components(item: EquipmentObject) {
    return obj(this.definition(item).components);
  }
  private owned(data: ActorEquipmentData, item: EquipmentObject) {
    const visited = new Set<unknown>();
    let cursor = item;
    while (true) {
      if (visited.has(cursor.id))
        throw new TypeError("Items cannot contain themselves or form a cycle.");
      visited.add(cursor.id);
      const location = obj(cursor.location);
      if (location.kind === "container") {
        cursor = this.item(data, String(location.containerId));
        continue;
      }
      return (
        (location.kind === "inventory" &&
          location.ownerId === data.actor.entityId) ||
        (location.kind === "carried" &&
          location.carrierId === data.actor.entityId)
      );
    }
  }
  private requireOwned(data: ActorEquipmentData, item: EquipmentObject) {
    if (!this.owned(data, item))
      throw new TypeError("This actor does not carry the selected Item.");
  }
  private capacity(item: EquipmentObject) {
    const components = this.components(item),
      container = obj(components.slottedContainer);
    if (
      !["belt", "pack", "bag"].includes(String(container.kind)) ||
      !Array.isArray(container.capacityByQuality)
    )
      throw new TypeError("This Item is not a configured slotted container.");
    const n = containerSlotCapacity(
      container as unknown as SlottedContainerDefinition,
      item.quality as never,
      components.rarity as never,
    );
    if (!Number.isSafeInteger(n) || n! < 0 || n! > 1000)
      throw new TypeError(
        "Author an explicit valid capacity for this quality and rarity.",
      );
    return n!;
  }
  private accepts(container: EquipmentObject, item: EquipmentObject) {
    if (
      obj(this.components(container).slottedContainer).kind === "belt" &&
      !isBeltSlotCompatible(this.components(item) as unknown as ItemComponents)
    )
      throw new TypeError("This Item is not configured for Belt slots.");
  }
  private fit(definition: EquipmentObject, inputSlots: readonly string[]) {
    const slots = inputSlots.map(canonicalEquipmentSlotKey);
    const sets = obj(obj(definition.components).equippable).compatibleSlotSets;
    if (
      !slots.length ||
      new Set(slots).size !== slots.length ||
      slots.some(
        (s) =>
          !this.capture.availableSlots
            .map(canonicalEquipmentSlotKey)
            .includes(s),
      ) ||
      !Array.isArray(sets) ||
      !sets.some((set) => {
        if (!Array.isArray(set) || !set.every((key) => typeof key === "string"))
          return false;
        const normalized = [...new Set(set.map(canonicalEquipmentSlotKey))];
        return (
          normalized.length === slots.length &&
          normalized.every((key) => slots.includes(key))
        );
      })
    )
      throw new TypeError(
        "The Item does not fit that complete slot assignment.",
      );
  }
  protected handleCommand<K extends keyof Commands>(
    _name: K,
    invocation: CommandInvocation<Commands[K]>,
  ): EntityTransition<ActorEquipmentData, Events> {
    const op = invocation.params,
      data = this.serializePayload();
    this.inspect(data);
    const eq =
      data.actor.equipment === undefined
        ? { slots: {}, containers: [] }
        : obj(data.actor.equipment);
    const slots = obj(eq.slots),
      containers = eq.containers as EquipmentObject[];
    const rules = obj(obj(data.actor.extensions)["aow:rules"]);
    const removeSlot = (id: string) => {
      for (const [key, value] of Object.entries(slots))
        if (value === id) delete slots[key];
      for (const container of containers)
        for (const cell of container.slots as EquipmentObject[])
          if (cell.itemId === id) delete cell.itemId;
    };
    const moveOut = (item: EquipmentObject) => {
      if (obj(item.location).kind === "container") {
        const parent = this.item(data, String(obj(item.location).containerId));
        const immediatelyAccessible =
          obj(this.components(parent).slottedContainer).kind === "belt" &&
          Object.values(slots).includes(parent.id);
        if (!immediatelyAccessible) {
          const n = rules["aow:bonusActions"];
          if (!Number.isSafeInteger(n) || Number(n) < 1)
            throw new TypeError(
              "Retrieving this Item requires an available bonus action.",
            );
          rules["aow:bonusActions"] = Number(n) - 1;
        }
      }
      removeSlot(String(item.id));
      item.location = {
        ...obj(item.location),
        kind: "inventory",
        ownerId: data.actor.entityId,
      };
      delete obj(item.location).containerId;
      delete obj(item.location).carrierId;
    };
    const equip = (item: EquipmentObject, inputSlots: readonly string[]) => {
      const chosen = inputSlots.map(canonicalEquipmentSlotKey);
      this.fit(this.definition(item), chosen);
      for (const slot of chosen)
        if (
          Object.entries(slots).some(
            ([key, id]) =>
              canonicalEquipmentSlotKey(key) === slot && id !== item.id,
          )
        )
          throw new TypeError("An equipment slot is occupied.");
      moveOut(item);
      for (const slot of chosen) slots[slot] = item.id;
      if (
        this.components(item).slottedContainer !== undefined &&
        !containers.some((c) => c.containerItemId === item.id)
      ) {
        const n = this.capacity(item);
        containers.push({
          containerItemId: item.id,
          slots: Array.from({ length: n }, (_, index) => ({ index })),
        });
      }
    };
    if (op.action === "allowance") {
      if (!Number.isSafeInteger(op.bonusActions) || op.bonusActions! < 0)
        throw new TypeError(
          "Provide a nonnegative whole bonus-action allowance.",
        );
      rules["aow:bonusActions"] = op.bonusActions;
    } else if (op.action === "create") {
      if (!op.createdId || data.items.some((i) => i.id === op.createdId))
        throw new TypeError("A fresh Item identity is required.");
      const d = this.capture.definitions.find(
        (d) => obj(d.identity).id === op.definitionId,
      );
      if (!d) throw new TypeError("Choose an Item from this capture.");
      const quantity = op.quantity === undefined ? 1 : op.quantity;
      if (!Number.isSafeInteger(quantity) || quantity < 1)
        throw new TypeError("Provide a positive whole quantity.");
      const item = {
        id: op.createdId,
        definitionId: op.definitionId,
        quantity,
        quality: obj(d.components).quality,
        location: { kind: "inventory", ownerId: data.actor.entityId },
      };
      const entity = Item.deserializePayload(item);
      try {
        if (entity.state.metadata.validity.status !== "valid")
          throw new TypeError("The captured Item cannot be realized.");
      } finally {
        entity.dispose();
      }
      data.items.push(item);
      if (data.actor.inventory !== undefined) {
        const inventory = obj(data.actor.inventory);
        data.actor.inventory = {
          ...inventory,
          itemIds: [...(inventory.itemIds as string[]), item.id],
        };
      }
    } else {
      const cellItem =
        op.action === "retrieve" && op.containerId !== undefined
          ? (
              containers.find((c) => c.containerItemId === op.containerId)
                ?.slots as EquipmentObject[] | undefined
            )?.find((s) => s.index === op.index)?.itemId
          : undefined;
      if (
        op.action === "retrieve" &&
        op.containerId !== undefined &&
        (typeof cellItem !== "string" ||
          (op.itemId !== undefined && op.itemId !== cellItem))
      )
        throw new TypeError("The selected container slot has changed.");
      const item = this.item(
        data,
        op.itemId ?? (typeof cellItem === "string" ? cellItem : ""),
      );
      this.requireOwned(data, item);
      if (op.action === "equip") equip(item, op.slots ?? []);
      else if (op.action === "unequip") {
        if (obj(item.location).kind === "container")
          throw new TypeError(
            "Retrieve a contained Item before unequipping it.",
          );
        removeSlot(String(item.id));
      } else if (op.action === "quantity") {
        if (!Number.isSafeInteger(op.quantity) || op.quantity! < 1)
          throw new TypeError("Provide a positive whole quantity.");
        item.quantity = op.quantity;
      } else if (op.action === "retrieve") {
        if (obj(item.location).kind !== "container")
          throw new TypeError("The Item is already carried.");
        if (op.slots?.length) equip(item, op.slots);
        else moveOut(item);
      } else if (op.action === "stow") {
        const target = this.item(data, op.containerId ?? "");
        this.requireOwned(data, target);
        if (target.id === item.id)
          throw new TypeError("An Item cannot contain itself.");
        if (!Object.values(slots).includes(target.id))
          throw new TypeError("Equip the container before using its slots.");
        const n = this.capacity(target);
        this.accepts(target, item);
        if (!Number.isSafeInteger(op.index) || op.index! < 0 || op.index! >= n)
          throw new TypeError("Choose an available container slot.");
        const container = containers.find(
          (c) => c.containerItemId === target.id,
        );
        if (!container) throw new TypeError("Container slots are unavailable.");
        const cell = (container.slots as EquipmentObject[]).find(
          (c) => c.index === op.index,
        )!;
        if (cell.itemId !== undefined && cell.itemId !== item.id)
          throw new TypeError("The container slot is occupied.");
        moveOut(item);
        item.location = {
          ...obj(item.location),
          kind: "container",
          containerId: target.id,
        };
        delete obj(item.location).ownerId;
        delete obj(item.location).carrierId;
        cell.itemId = item.id;
      } else throw new TypeError("Unknown equipment action.");
    }
    data.actor.equipment = { ...eq, slots, containers };
    data.actor.extensions = {
      ...obj(data.actor.extensions),
      "aow:rules": { ...rules },
    };
    const identity = obj(data.actor.identity),
      version = obj(identity.version);
    if (!Number.isSafeInteger(version.revision) || Number(version.revision) < 1)
      throw new TypeError("The actor revision is invalid.");
    data.actor.identity = {
      ...identity,
      version: {
        ...version,
        revision: Number(version.revision) + 1,
        updatedAt: op.updatedAt,
      },
    };
    this.inspect(data);
    return {
      data,
      events: [
        {
          name: "changed",
          context: {
            action: op.action,
            ...(op.itemId ? { itemId: op.itemId } : {}),
          },
        },
      ],
    };
  }
  inventory() {
    const data = this.serializePayload();
    return data.items.filter((item) => this.owned(data, item));
  }
  containerCapacity(item: EquipmentObject) {
    try {
      return this.capacity(item);
    } catch {
      return undefined;
    }
  }
}
export function equipmentObject(value: unknown): EquipmentObject {
  return obj(value);
}
function isObject(v: unknown): v is EquipmentObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function obj(v: unknown): EquipmentObject {
  return isObject(v) ? v : {};
}
