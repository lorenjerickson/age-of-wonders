import { canonicalEquipmentSlotKey } from "@aow/common";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ActorEquipment,
  equipmentObject as obj,
  type EquipmentOperation,
  type EquipmentObject,
} from "@aow/domain";
import type { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
export interface EquipmentRequest extends Omit<
  EquipmentOperation,
  "createdId" | "updatedAt"
> {
  expectedRuntimeRevision: number;
}
const rows = (v: unknown): EquipmentObject[] =>
  Array.isArray(v) ? v.map(obj) : [];
function label(v: unknown, fallback: string, ids: readonly unknown[] = []) {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    ids.some((id) => typeof id === "string" && id === v.trim()) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v) ||
    /^[\w-]+:[\w:-]+$/.test(v)
  )
    return fallback;
  return v.trim();
}
/** Resolve the exact immutable releases selected by this Instance capture, including dependencies. */
async function capturedEquipmentSlots(
  prisma: PrismaService,
  snapshot: unknown,
): Promise<{ id: string; name: string }[]> {
  const capture = obj(snapshot);
  const worldRevision = obj(
    obj(capture.worldDefinitionSnapshot).worldDefinitionRevision,
  );
  const selected = rows(worldRevision.modelSchemaSelections).map((selection) =>
    obj(selection.modelSchemaRelease),
  );
  const campaign = obj(
    obj(obj(capture.campaignDefinitionSnapshot).campaignDefinitionRevision)
      .content,
  );
  const campaignIds = Array.isArray(campaign.modelSchemaReleaseIds)
    ? campaign.modelSchemaReleaseIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const releases = new Map<string, EquipmentObject>(
    selected.flatMap((release) =>
      typeof release.id === "string" ? [[release.id, release] as const] : [],
    ),
  );
  let pending = [
    ...campaignIds,
    ...selected.flatMap((release) =>
      rows(release.dependencies).flatMap((dependency) =>
        typeof dependency.releaseId === "string" ? [dependency.releaseId] : [],
      ),
    ),
  ];
  while (pending.length) {
    const ids = [...new Set(pending)].filter((id) => !releases.has(id));
    if (!ids.length) break;
    const found = await prisma.modelSchemaRelease.findMany({
      where: { id: { in: ids } },
      select: { id: true, dependencies: true, elementSelections: true },
    });
    if (found.length !== ids.length)
      throw new ConflictException(
        "A captured equipment Model release is unavailable.",
      );
    for (const release of found) releases.set(release.id, release);
    pending = found.flatMap((release) =>
      rows(release.dependencies).flatMap((dependency) =>
        typeof dependency.releaseId === "string" ? [dependency.releaseId] : [],
      ),
    );
  }
  const ids = [
    ...new Set(
      [...releases.values()].flatMap((release) =>
        rows(release.elementSelections).flatMap((selection) =>
          typeof selection.elementRevisionId === "string"
            ? [selection.elementRevisionId]
            : [],
        ),
      ),
    ),
  ];
  if (!ids.length) return [];
  const elements = await prisma.modelElementRevision.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      presentation: true,
      element: { select: { key: true, semanticRole: true } },
    },
  });
  if (elements.length !== ids.length)
    throw new ConflictException(
      "A captured equipment Model revision is unavailable.",
    );
  const projected = elements
    .filter(
      (revision) => revision.element.semanticRole === "aow:equipment-slot",
    )
    .map((revision) => ({
      id: canonicalEquipmentSlotKey(revision.element.key),
      name:
        canonicalEquipmentSlotKey(revision.element.key) !== revision.element.key
          ? "Waist"
          : label(obj(revision.presentation).label, "Equipment slot", [
              revision.id,
              revision.element.key,
            ]),
    }));
  return [...new Map(projected.map((slot) => [slot.id, slot])).values()];
}
async function load(
  prisma: PrismaService,
  id: string,
  userId: string,
  actorId: string,
) {
  const instance = await prisma.campaignInstance.findFirst({
    where: { id, ownerUserId: userId },
    include: {
      currentSnapshot: {
        include: {
          worldDefinitionSnapshot: {
            include: {
              worldDefinitionRevision: {
                include: {
                  modelSchemaSelections: {
                    include: { modelSchemaRelease: true },
                  },
                },
              },
            },
          },
          campaignDefinitionSnapshot: {
            include: { campaignDefinitionRevision: true },
          },
        },
      },
      runtime: true,
    },
  });
  if (!instance)
    throw new NotFoundException("The Campaign Instance was not found.");
  const state = obj(instance.runtime?.state);
  if (
    !instance.runtime ||
    instance.runtime.campaignInstanceSnapshotId !==
      instance.currentSnapshotId ||
    state.formatVersion !== 1 ||
    !Array.isArray(state.itemInstances) ||
    !Array.isArray(state.creatureEmbodiments)
  )
    throw new ConflictException("The Instance runtime is unavailable.");
  const actor = rows(state.creatureEmbodiments).find(
    (a) => a.runtimeCreatureId === actorId,
  );
  if (!actor) throw new NotFoundException("The actor was not found.");
  const manifest = obj(
      instance.currentSnapshot?.worldDefinitionSnapshot.manifest,
    ),
    records = rows(manifest.records);
  const definitions: EquipmentObject[] = records
    .filter(
      (r) => r.resourceType === "definitions" && obj(r.payload).kind === "item",
    )
    .map((r) => ({
      ...obj(r.payload),
      identity: { ...obj(obj(r.payload).identity), id: r.sourceId },
    }));
  const creature = obj(actor.creature),
    source = records.find(
      (r) =>
        ["definitions", "world-character-templates"].includes(
          String(r.resourceType),
        ) &&
        (r.sourceId === creature.definitionId ||
          r.sourceId === obj(actor.source).sourceCreatureId),
    ),
    sourcePayload = obj(source?.payload);
  const legacySlots = records.flatMap((r) => {
    const p = obj(r.payload),
      element = obj(p.element);
    return element.semanticRole === "aow:equipment-slot" &&
      typeof element.key === "string"
      ? [
          {
            id: element.key,
            name: label(element.name, "Equipment slot", [
              element.key,
              r.sourceId,
            ]),
          },
        ]
      : [];
  });
  const capturedSlots = await capturedEquipmentSlots(
    prisma,
    instance.currentSnapshot,
  );
  const allSlots = [
    ...capturedSlots,
    ...legacySlots.filter(
      (slot) => !capturedSlots.some((captured) => captured.id === slot.id),
    ),
  ];
  const base =
    source?.resourceType === "world-character-templates"
      ? obj(
          records.find(
            (r) =>
              r.resourceType === "definitions" &&
              r.sourceId === sourcePayload.creatureDefinitionId,
          )?.payload,
        )
      : {};
  const components = {
    ...obj(base.components),
    ...obj(sourcePayload.components),
  };
  if (
    Object.hasOwn(components, "equipmentSlots") &&
    (!Array.isArray(components.equipmentSlots) ||
      !components.equipmentSlots.every((slot) => typeof slot === "string"))
  )
    throw new ConflictException(
      "The captured Creature equipment slots are invalid.",
    );
  const declared = Array.isArray(components.equipmentSlots)
    ? components.equipmentSlots
    : Array.isArray(sourcePayload.equipmentSlots)
      ? sourcePayload.equipmentSlots
      : Array.isArray(obj(sourcePayload.modelValues)["aow:equipment-slots"])
        ? (obj(sourcePayload.modelValues)["aow:equipment-slots"] as unknown[])
        : allSlots.map((slot) => slot.id);
  const slots = Array.from(
    new Set(
      declared
        .filter((s): s is string => typeof s === "string")
        .map(canonicalEquipmentSlotKey),
    ),
  ).map((key) => ({
    id: key,
    name: allSlots.find((s) => s.id === key)?.name ?? "Equipment slot",
  }));
  for (const definition of definitions) {
    const components = obj(definition.components),
      equippable = obj(components.equippable);
    if (Array.isArray(equippable.compatibleSlotSets))
      definition.components = {
        ...components,
        equippable: {
          ...equippable,
          compatibleSlotSets: equippable.compatibleSlotSets.map((set) =>
            Array.isArray(set)
              ? set.map(
                  (key) =>
                    allSlots.find(
                      (slot) =>
                        slot.id === key ||
                        slot.id.endsWith(
                          `-slot-${canonicalEquipmentSlotKey(String(key))}`,
                        ),
                    )?.id ?? key,
                )
              : set,
          ),
        },
      };
  }
  const owner = ActorEquipment.deserialize(
    { actor: creature, items: rows(state.itemInstances) },
    { mode: "runtime", definitions, availableSlots: slots.map((s) => s.id) },
  );
  return { instance, state, actor, creature, owner, definitions, slots };
}
function projection(context: Awaited<ReturnType<typeof load>>) {
  const { instance, owner, definitions, slots, creature } = context;
  const data = owner.serializePayload(),
    eq = obj(data.actor.equipment);
  const items = owner.inventory();
  const name = (item: EquipmentObject) =>
    label(
      item.nameOverride,
      label(
        obj(
          definitions.find((d) => obj(d.identity).id === item.definitionId)
            ?.identity,
        ).name,
        "Item",
        [item.definitionId],
      ),
      [item.id, item.definitionId],
    );
  return {
    runtimeRevision: instance.runtime!.revision,
    actorName: label(creature.name, "Actor", [
      obj(creature.identity).id,
      creature.entityId,
      creature.definitionId,
      context.actor.runtimeCreatureId,
    ]),
    readOnly: ["CONCLUDED", "ARCHIVED"].includes(instance.status),
    bonusActions:
      typeof obj(obj(data.actor.extensions)["aow:rules"])[
        "aow:bonusActions"
      ] === "number"
        ? obj(obj(data.actor.extensions)["aow:rules"])["aow:bonusActions"]
        : null,
    slots,
    definitions: definitions.map((d) => ({
      id: obj(d.identity).id,
      name: label(obj(d.identity).name, "Item", [obj(d.identity).id]),
    })),
    items: items.map((i) => {
      const components = obj(
          definitions.find((d) => obj(d.identity).id === i.definitionId)
            ?.components,
        ),
        container = obj(components.slottedContainer),
        saved = rows(eq.containers).find((c) => c.containerItemId === i.id),
        location = obj(i.location),
        occupied = Object.entries(obj(eq.slots))
          .filter(([, id]) => id === i.id)
          .map(
            ([key]) =>
              slots.find((s) => s.id === key)?.name ?? "Equipment slot",
          );
      return {
        id: i.id,
        name: name(i),
        quantity: i.quantity,
        locationLabel: occupied.length
          ? `Equipped: ${occupied.join(", ")}`
          : location.kind === "container"
            ? `In ${name(items.find((parent) => parent.id === location.containerId) ?? {})}`
            : "Carried",
        compatibleSlotSets: Array.isArray(
          obj(components.equippable).compatibleSlotSets,
        )
          ? obj(components.equippable).compatibleSlotSets
          : [],
        ...(container.kind
          ? {
              container: {
                kind: container.kind,
                capacity: owner.containerCapacity(i) ?? null,
                slots: rows(saved?.slots).map((cell) => ({
                  ...cell,
                  ...(cell.itemId
                    ? {
                        itemName: name(
                          items.find((child) => child.id === cell.itemId) ?? {},
                        ),
                      }
                    : {}),
                })),
              },
            }
          : {}),
      };
    }),
  };
}
export async function readActorEquipment(
  prisma: PrismaService,
  id: string,
  userId: string,
  actorId: string,
) {
  const context = await load(prisma, id, userId, actorId);
  try {
    return projection(context);
  } catch (e) {
    throw new ConflictException(
      e instanceof Error ? e.message : "Equipment is unavailable.",
    );
  } finally {
    context.owner.dispose();
  }
}
export async function changeActorEquipment(
  prisma: PrismaService,
  id: string,
  userId: string,
  actorId: string,
  request: EquipmentRequest,
) {
  const c = await load(prisma, id, userId, actorId);
  try {
    if (["CONCLUDED", "ARCHIVED"].includes(c.instance.status))
      throw new ConflictException("This Instance is read-only.");
    if (c.instance.runtime!.revision !== request.expectedRuntimeRevision)
      throw new ConflictException("Equipment changed; reload and retry.");
    const receipt = await c.owner.command("change", {
      initiator: userId,
      params: {
        ...request,
        createdId: randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      context: {},
    });
    if (receipt.status === "rejected")
      throw new BadRequestException(
        receipt.reason ?? "Equipment change rejected.",
      );
    const next = c.owner.serializePayload(),
      state = {
        ...c.state,
        itemInstances: next.items,
        creatureEmbodiments: rows(c.state.creatureEmbodiments).map((a) =>
          a.runtimeCreatureId === actorId ? { ...a, creature: next.actor } : a,
        ),
      };
    await prisma.$transaction(async (tx) => {
      const locked = await tx.campaignInstance.updateMany({
        where: {
          id,
          ownerUserId: userId,
          currentSnapshotId: c.instance.currentSnapshotId,
          metadataRevision: c.instance.metadataRevision,
          status: c.instance.status,
        },
        data: { metadataRevision: { increment: 0 } },
      });
      if (locked.count !== 1)
        throw new ConflictException(
          "The Instance capture or status changed; reload and retry.",
        );
      const updated = await tx.campaignInstanceRuntime.updateMany({
        where: {
          id: c.instance.runtime!.id,
          campaignInstanceId: id,
          revision: request.expectedRuntimeRevision,
        },
        data: {
          revision: { increment: 1 },
          state: state as Prisma.InputJsonObject,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException("Equipment changed; reload and retry.");
    });
    return await readActorEquipment(prisma, id, userId, actorId);
  } catch (error) {
    if (error instanceof TypeError)
      throw new BadRequestException(error.message);
    throw error;
  } finally {
    c.owner.dispose();
  }
}
