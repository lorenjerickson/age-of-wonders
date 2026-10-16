/** Consolidate the requested World's legacy creatures. Dry run unless --apply.
 * Run in API container; private backup + revision CAS guard every write.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient, Prisma } = require("@prisma/client");
const { CreatureDefinition, CharacterTemplate } = require("@aow/domain");
const p = new PrismaClient();
const people = [
  "Constable O'Malley",
  "Harold Fink",
  "Cedric Munteanu",
  "Ser Roderick",
];
const beasts = [
  "Feral Dog",
  "Feral Cat",
  "Black Adder",
  "Ionic Wight",
  "Giant Rat",
];
const supported = [
  "walk",
  "run",
  "sprint",
  "jump",
  "swim",
  "climb",
  "crawl",
  "fly",
  "burrow",
];
function validate(entity) {
  try {
    assert.deepEqual(
      entity.state.metadata.validity.issues.filter(
        (i) => i.blocking !== false && !i.unresolved,
      ),
      [],
    );
  } finally {
    entity.dispose();
  }
}
try {
  const ds = (await p.worldDefinitionDraft.findMany()).filter(
    (d) => d.content.name === "Turn of the Century",
  );
  assert.equal(ds.length, 1);
  const before = ds[0],
    records = structuredClone(before.snapshotRecords),
    content = structuredClone(before.content);
  const legacy = records.filter((r) => r.resourceType === "creatures");
  if (!legacy.length) {
    assert(
      people.every((name) =>
        records.some(
          (r) =>
            r.resourceType === "world-character-templates" &&
            r.payload.name === name,
        ),
      ),
    );
    assert(
      beasts.every((name) =>
        records.some(
          (r) =>
            r.resourceType === "definitions" &&
            r.payload.kind === "creature" &&
            r.payload.identity.name === name,
        ),
      ),
    );
    console.log("Already consolidated; no changes.");
  } else {
    assert.deepEqual(
      legacy.map((r) => r.payload.name).sort(),
      [...people, ...beasts].sort(),
    );
    const human = records.find(
      (r) =>
        r.resourceType === "definitions" &&
        r.payload.kind === "creature" &&
        r.payload.identity.name === "Human",
    );
    assert(human, "Human base is required");
    const peopleIds = new Set(
      legacy
        .filter((r) => people.includes(r.payload.name))
        .map((r) => r.sourceId),
    );
    const changedIds = new Set(legacy.map((r) => r.sourceId));
    const summary = [];
    for (const r of legacy) {
      assert(
        !records.some(
          (x) =>
            x !== r &&
            x.sourceId === r.sourceId &&
            ["definitions", "world-character-templates"].includes(
              x.resourceType,
            ),
        ),
        "Destination collision",
      );
      const source = structuredClone(r.payload);
      const attributes = Object.fromEntries(
        Object.entries(source.attributes?.standard ?? {}).map(([key, v]) => [
          `aow:attribute-${key === "will" ? "wisdom" : key}`,
          v.score,
        ]),
      );
      const movement = (source.speeds ?? [])
        .filter((s) => supported.includes(s.mode))
        .map((s) => {
          assert.equal(s.distance.unit, "foot");
          return structuredClone(s);
        });
      // Hover uses the existing flight field; the full authored mode stays in the archive.
      for (const speed of source.speeds ?? [])
        if (speed.mode === "hover") {
          assert.equal(speed.distance.unit, "foot");
          movement.push({
            mode: "fly",
            distance: structuredClone(speed.distance),
          });
        }
      const health = source.hitPoints ?? {
        current: 20,
        maximum: 20,
        temporary: 0,
      };
      const vision = {
        day:
          source.senses?.find((s) => s.sense === "normal")?.range?.value ?? 60,
        night: 0,
      };
      const equipment = [];
      for (const [slot, itemId] of Object.entries(
        source.equipment?.slots ?? {},
      )) {
        const item = records.find(
          (x) => x.resourceType === "items" && x.sourceId === itemId,
        );
        assert(item, `Missing equipped Item for ${source.name}`);
        assert(
          records.some(
            (x) =>
              x.resourceType === "definitions" &&
              x.sourceId === item.payload.definitionId &&
              x.payload.kind === "item",
          ),
        );
        equipment.push({ slot, itemDefinitionId: item.payload.definitionId });
      }
      const extensions = {
        ...source.extensions,
        "aow:legacy-creature": {
          resourceType: "creatures",
          ...(r.sourceRevision === undefined
            ? {}
            : { sourceRevision: r.sourceRevision }),
          payload: source,
        },
      };
      if (peopleIds.has(r.sourceId)) {
        r.resourceType = "world-character-templates";
        r.payload = CharacterTemplate.authorPayload(r.sourceId, {
          ...source,
          extensions,
          name: source.name,
          description: source.description ?? "",
          creatureDefinitionId: human.sourceId,
          attributes,
          skills: {},
          health,
          vision,
          movement: Object.fromEntries(
            movement.map((s) => [s.mode, s.distance.value]),
          ),
          equipment,
          grantedConditions: [],
          images: source.images ?? {},
          instanceEmbodimentPolicy: {
            strategy: "one-per-instance",
            maximumPerCampaignInstance: 1,
          },
        });
        delete r.payload.kind;
        r.sourceRevision = r.payload.revision;
      } else {
        r.resourceType = "definitions";
        r.payload = CreatureDefinition.authorPayload(
          r.sourceId,
          {
            name: source.name,
            description: source.description ?? "",
            attributes,
            skills: {},
            health,
            vision,
            equipmentSlots: [],
            equipmentPool: [],
            movement,
            images: source.images ?? {},
            grantedConditions: [],
            instanceEmbodimentPolicy: { strategy: "one-per-realization" },
          },
          human.payload.conformance,
          { ...source, extensions },
        );
        r.sourceRevision = (r.sourceRevision ?? 0) + 1;
      }
      assert.deepEqual(
        r.payload.extensions["aow:legacy-creature"].payload,
        source,
      );
      summary.push({
        name: source.name,
        destination: peopleIds.has(r.sourceId) ? "Characters" : "Bestiary",
        artwork: Object.keys(source.images ?? {}).length,
        equipment: equipment.length,
        retainedCustomMovement: (source.speeds ?? [])
          .filter((s) => !supported.includes(s.mode) && s.mode !== "hover")
          .map((s) => s.mode),
      });
    }
    let placements = 0;
    for (const r of records)
      if (
        r.resourceType === "world-placements" &&
        r.payload.source?.kind === "world-creature" &&
        peopleIds.has(r.payload.source.creatureId)
      ) {
        r.payload.source = {
          kind: "world-character",
          characterTemplateId: r.payload.source.creatureId,
        };
        r.sourceRevision = (r.sourceRevision ?? 0) + 1;
        placements++;
      }
    if (Array.isArray(content.creatureIds))
      content.creatureIds = content.creatureIds.filter(
        (id) => !changedIds.has(id),
      );
    content.definitionIds = [
      ...new Set([
        ...content.definitionIds,
        ...legacy
          .filter((r) => r.resourceType === "definitions")
          .map((r) => r.sourceId),
      ]),
    ];
    for (const r of legacy)
      validate(
        (r.resourceType === "definitions"
          ? CreatureDefinition
          : CharacterTemplate
        ).deserializePayload(r.payload, { sourceId: r.sourceId, records }),
      );
    for (const old of before.snapshotRecords) {
      if (
        changedIds.has(old.sourceId) ||
        (old.resourceType === "world-placements" &&
          peopleIds.has(old.payload.source?.creatureId))
      )
        continue;
      assert.deepEqual(
        records.find(
          (r) =>
            r.resourceType === old.resourceType && r.sourceId === old.sourceId,
        ),
        old,
      );
    }
    let backup;
    if (process.argv.includes("--apply")) {
      const dir = fileURLToPath(new URL("../.recovery/", import.meta.url));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      backup = `${dir}actor-library-consolidation-${Date.now()}.json`;
      await writeFile(backup, JSON.stringify(before), {
        mode: 0o600,
        flag: "wx",
      });
      await p.$transaction(
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
            "World was edited concurrently; retry migration",
          );
          const after = await tx.worldDefinitionDraft.findUniqueOrThrow({
            where: { id: before.id },
          });
          assert.deepEqual(after.snapshotRecords, records);
          assert.deepEqual(after.content, content);
        },
        { timeout: 30000 },
      );
    }
    console.log(
      JSON.stringify(
        {
          mode: process.argv.includes("--apply") ? "apply" : "dry-run",
          summary,
          placements,
          backup,
          revisionBefore: before.storageRevision,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await p.$disconnect();
}
