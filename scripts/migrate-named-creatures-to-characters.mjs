/** One-off, dry-run-first World draft migration. Run in the API container.
 * node /workspace/scripts/migrate-named-creatures-to-characters.mjs [--apply]
 * Private rollback source is written to ignored .recovery before any update.
 * Published captures, legacy runtime records and unrelated Worlds are untouched.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient, Prisma } = require("@prisma/client");
const { CharacterTemplate, CreatureDefinition } = require("@aow/domain");
const prisma = new PrismaClient();
const expected = [
  "Elyena Munteanu",
  "Count Dimitri Vargova",
  "Madam Petrovka",
  "Mother",
  "Sherlock Holmes",
  "Dr. James Watson",
];
const movementDefault = {
  walk: 30,
  run: 60,
  jump: 5,
  crawl: 10,
  swim: 15,
  climb: 10,
  fly: 0,
  burrow: 0,
};
const clone = (x) => structuredClone(x);
function check(entity) {
  try {
    const issues = entity.state.metadata.validity.issues.filter(
      (i) => i.blocking !== false && !i.unresolved,
    );
    assert.deepEqual(issues, [], "Migrated record must pass domain validation");
  } finally {
    entity.dispose();
  }
}
try {
  const drafts = await prisma.worldDefinitionDraft.findMany();
  const matches = drafts.filter(
    (d) => d.content.name === "Turn of the Century",
  );
  assert.equal(matches.length, 1, "Expected exactly one target World draft");
  const before = matches[0];
  const records = clone(before.snapshotRecords);
  const creatures = records.filter(
    (r) => r.resourceType === "definitions" && r.payload.kind === "creature",
  );
  const targets = creatures.filter(
    (r) =>
      r.payload.identity.name !== "Sewer Lamprey" &&
      r.payload.identity.name !== "Human",
  );
  if (
    !targets.length &&
    expected.every((name) =>
      records.some(
        (r) =>
          r.resourceType === "world-character-templates" &&
          r.payload.name === name,
      ),
    )
  ) {
    console.log("Already migrated; no changes.");
  } else {
    assert.deepEqual(
      targets.map((r) => r.payload.identity.name).sort(),
      [...expected].sort(),
    );
    const ids = new Set(targets.map((r) => r.sourceId));
    assert(
      !records.some(
        (r) =>
          r.resourceType === "world-character-templates" && ids.has(r.sourceId),
      ),
      "Character identity collision",
    );
    const lamprey = creatures.find(
      (r) => r.payload.identity.name === "Sewer Lamprey",
    );
    assert(lamprey, "Lamprey must be present");
    let human = creatures.find((r) => r.payload.identity.name === "Human");
    if (!human) {
      const id = randomUUID();
      const attributes = Object.fromEntries(
        Object.keys(targets[0].payload.components.attributes).map((k) => [
          k,
          50,
        ]),
      );
      const equipmentSlots = [
        ...new Set(targets.flatMap((r) => r.payload.components.equipmentSlots)),
      ];
      human = {
        resourceType: "definitions",
        sourceId: id,
        sourceRevision: 1,
        payload: CreatureDefinition.authorPayload(
          id,
          {
            name: "Human",
            description:
              "A general Human template. Default values may be adjusted for this World.",
            attributes,
            skills: {},
            health: { current: 20, maximum: 20, temporary: 0 },
            vision: { day: 60, night: 0 },
            equipmentSlots,
            equipmentPool: [],
            grantedConditions: [],
            movement: Object.entries(movementDefault).map(([mode, value]) => ({
              mode,
              distance: { unit: "foot", value },
            })),
            instanceEmbodimentPolicy: { strategy: "one-per-realization" },
          },
          clone(targets[0].payload.conformance),
        ),
      };
      records.push(human);
    }
    for (const target of targets) {
      const original = clone(target.payload);
      const { kind, ...preserved } = original;
      const c = original.components;
      const movement = { ...movementDefault };
      for (const m of c.movement ?? []) {
        assert.equal(
          m.distance.unit,
          "foot",
          "Explicit conversion required for non-foot movement",
        );
        movement[m.mode] = m.distance.value;
      }
      // These are authored per-person Item/slot assignments, not the Creature equipment pool.
      const equipment = records
        .filter(
          (r) =>
            r.resourceType === "definitions" &&
            r.payload.kind === "item" &&
            r.payload.extensions?.["aow:creatureId"] === target.sourceId &&
            r.payload.extensions?.["aow:equipmentSlot"],
        )
        .map((r) => ({
          slot: r.payload.extensions["aow:equipmentSlot"],
          itemDefinitionId: r.sourceId,
        }));
      target.resourceType = "world-character-templates";
      target.payload = CharacterTemplate.authorPayload(target.sourceId, {
        ...preserved,
        name: original.identity.name,
        description: original.identity.description ?? "",
        creatureDefinitionId: human.sourceId,
        attributes: c.attributes ?? {},
        skills: c.skills ?? {},
        health: c.health ?? { current: 20, maximum: 20, temporary: 0 },
        vision: c.vision ?? { day: 60, night: 0 },
        movement,
        equipment,
        grantedConditions: c.grantedConditions ?? [],
        images: CreatureDefinition.preservedImages(original),
      });
      target.sourceRevision = target.payload.revision;
      assert.deepEqual(target.payload.components, original.components);
      assert.deepEqual(target.payload.extensions, original.extensions);
    }
    let placements = 0;
    for (const record of records) {
      if (
        record.resourceType === "world-placements" &&
        record.payload.source?.kind === "world-creature" &&
        ids.has(record.payload.source.creatureId)
      ) {
        record.payload.source = {
          kind: "world-character",
          characterTemplateId: record.payload.source.creatureId,
        };
        record.sourceRevision = (record.sourceRevision ?? 0) + 1;
        placements++;
      }
    }
    const content = clone(before.content);
    content.definitionIds = [
      ...new Set([
        ...content.definitionIds.filter((id) => !ids.has(id)),
        human.sourceId,
      ]),
    ];
    for (const r of targets)
      check(
        CharacterTemplate.deserializePayload(r.payload, {
          sourceId: r.sourceId,
          records,
        }),
      );
    check(
      CreatureDefinition.deserializePayload(human.payload, {
        sourceId: human.sourceId,
        records,
      }),
    );
    assert.deepEqual(
      records.find((r) => r.sourceId === lamprey.sourceId),
      lamprey,
    );
    for (const original of before.snapshotRecords) {
      if (
        ids.has(original.sourceId) ||
        (original.resourceType === "world-placements" &&
          ids.has(original.payload.source?.creatureId))
      )
        continue;
      assert.deepEqual(
        records.find(
          (r) =>
            r.resourceType === original.resourceType &&
            r.sourceId === original.sourceId,
        ),
        original,
      );
    }
    const summary = {
      world: before.content.name,
      characters: targets.map((r) => ({
        name: r.payload.name,
        artwork: Object.keys(r.payload.images).length,
        equipment: r.payload.equipment.length,
      })),
      base: human.payload.identity.name,
      placements,
      mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    };
    if (process.argv.includes("--apply")) {
      const directory = fileURLToPath(
        new URL("../.recovery/", import.meta.url),
      );
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const backup = `${directory}creature-character-${Date.now()}.json`;
      await writeFile(backup, JSON.stringify(before), {
        mode: 0o600,
        flag: "wx",
      });
      await prisma.$transaction(
        async (tx) => {
          const result = await tx.worldDefinitionDraft.updateMany({
            where: { id: before.id, storageRevision: before.storageRevision },
            data: {
              content,
              snapshotRecords: records,
              storageRevision: { increment: 1 },
              validationStatus: "NOT_VALIDATED",
              validatedStorageRevision: null,
              validationReport: Prisma.DbNull,
            },
          });
          assert.equal(
            result.count,
            1,
            "Draft changed concurrently; migration aborted",
          );
          const after = await tx.worldDefinitionDraft.findUniqueOrThrow({
            where: { id: before.id },
          });
          assert.deepEqual(after.snapshotRecords, records);
          assert.deepEqual(after.content, content);
          assert.equal(after.storageRevision, before.storageRevision + 1);
        },
        { timeout: 30000 },
      );
      summary.backup = backup;
      summary.verified = true;
    }
    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
