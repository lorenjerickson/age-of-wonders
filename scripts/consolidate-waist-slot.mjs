/** Dry-run first: node /workspace/scripts/consolidate-waist-slot.mjs [--apply].
 * Only the named active World draft changes. Immutable Model releases/captures are untouched.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
const canonical = (value) =>
  value === "belt"
    ? "waist"
    : value === "aow:equipment-slot-belt"
      ? "aow:equipment-slot-waist"
      : value;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const compareSlot = (value) =>
  canonical(value) === "waist" ||
  canonical(value) === "aow:equipment-slot-waist"
    ? "waist"
    : value;
export function consolidateWaistRecords(input, now = new Date().toISOString()) {
  const records = structuredClone(input),
    changes = [],
    conflicts = [];
  for (const record of records) {
    const payload = record.payload;
    if (
      !object(payload) ||
      !(
        record.resourceType === "world-character-templates" ||
        (record.resourceType === "definitions" &&
          ["creature", "item"].includes(payload.kind))
      )
    )
      continue;
    const original = JSON.stringify(payload);
    const name = payload.name ?? payload.identity?.name ?? "Unnamed content";
    let aliases = 0;
    const mapSlot = (slot) => {
      if (canonical(slot) !== slot) aliases++;
      return canonical(slot);
    };
    for (const fields of [payload, payload.components].filter(object)) {
      if (Array.isArray(fields.equipmentSlots))
        fields.equipmentSlots = [
          ...new Set(fields.equipmentSlots.map(mapSlot)),
        ];
      if (Array.isArray(fields.equipment)) {
        const occupied = new Map(),
          next = [];
        for (const link of fields.equipment) {
          if (!object(link) || typeof link.slot !== "string") {
            next.push(link);
            continue;
          }
          const slot = mapSlot(link.slot),
            key = compareSlot(slot);
          const previous = occupied.get(key);
          if (slot !== "carried" && previous) {
            if (previous.itemDefinitionId !== link.itemDefinitionId)
              conflicts.push({
                name,
                slot: "Waist",
                reason: "Different Items occupy the merged slot",
              });
            else if (
              JSON.stringify({ ...previous, slot: undefined }) !==
              JSON.stringify({ ...link, slot: undefined })
            )
              conflicts.push({
                name,
                slot: "Waist",
                reason: "Duplicate assignment metadata differs",
              });
            continue;
          }
          const value = { ...link, slot };
          next.push(value);
          if (slot !== "carried") occupied.set(key, value);
        }
        fields.equipment = next;
      }
      const equippable = fields.equippable;
      if (object(equippable) && Array.isArray(equippable.compatibleSlotSets)) {
        equippable.compatibleSlotSets = equippable.compatibleSlotSets.map(
          (set) => (Array.isArray(set) ? [...new Set(set.map(mapSlot))] : set),
        );
        equippable.compatibleSlotSets = equippable.compatibleSlotSets.filter(
          (set, index, all) =>
            all.findIndex(
              (other) => JSON.stringify(other) === JSON.stringify(set),
            ) === index,
        );
      }
    }
    if (JSON.stringify(payload) !== original) {
      record.sourceRevision =
        (record.sourceRevision ??
          payload.revision ??
          payload.identity?.version?.revision ??
          0) + 1;
      if (typeof payload.revision === "number") payload.revision += 1;
      if (object(payload.identity?.version))
        payload.identity.version = {
          ...payload.identity.version,
          revision: (payload.identity.version.revision ?? 0) + 1,
          updatedAt: now,
        };
      changes.push({ name, aliases });
    }
  }
  return { records, changes, conflicts };
}
async function main() {
  const require = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  );
  const { PrismaClient, Prisma } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const matches = (
      await prisma.worldDefinitionDraft.findMany({
        include: { worldDefinition: { select: { status: true } } },
      })
    ).filter((d) => d.content.name === "Turn of the Century");
    assert.equal(matches.length, 1, "Expected exactly one target World draft");
    const before = matches[0];
    assert.equal(
      before.worldDefinition.status,
      "ACTIVE",
      "Target World must be active",
    );
    const result = consolidateWaistRecords(before.snapshotRecords);
    const summary = {
      world: before.content.name,
      mode: process.argv.includes("--apply") ? "apply" : "dry-run",
      storageRevision: before.storageRevision,
      changedRecords: result.changes.length,
      changes: result.changes,
      conflicts: result.conflicts,
    };
    if (result.conflicts.length) {
      console.log(JSON.stringify(summary, null, 2));
      throw new Error(
        "Conflicting assignments require review; no writes performed",
      );
    }
    assert.deepEqual(
      consolidateWaistRecords(result.records).changes,
      [],
      "Migration must be idempotent",
    );
    if (process.argv.includes("--apply") && result.changes.length) {
      const directory = fileURLToPath(
        new URL("../.recovery/", import.meta.url),
      );
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const backup = `${directory}waist-slot-${Date.now()}.json`;
      await writeFile(backup, JSON.stringify(before), {
        mode: 0o600,
        flag: "wx",
      });
      await prisma.$transaction(
        async (tx) => {
          const written = await tx.worldDefinitionDraft.updateMany({
            where: {
              id: before.id,
              storageRevision: before.storageRevision,
              worldDefinition: { status: "ACTIVE" },
            },
            data: {
              snapshotRecords: result.records,
              storageRevision: { increment: 1 },
              validationStatus: "NOT_VALIDATED",
              validatedStorageRevision: null,
              validationReport: Prisma.DbNull,
            },
          });
          assert.equal(
            written.count,
            1,
            "Draft changed concurrently; migration aborted",
          );
          const after = await tx.worldDefinitionDraft.findUniqueOrThrow({
            where: { id: before.id },
          });
          assert.deepEqual(after.snapshotRecords, result.records);
          assert.deepEqual(after.content, before.content);
          assert.equal(after.storageRevision, before.storageRevision + 1);
        },
        { timeout: 30000 },
      );
      summary.backup = backup;
      summary.verified = true;
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
