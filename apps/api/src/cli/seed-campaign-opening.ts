import "reflect-metadata";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { validateRuntimeForCapturedPair } from "../campaign-instances/campaign-instance-management.service";
import { isCanonicalSnapshotManifest } from "../domain/snapshot-manifest";

/** Development-only roster fixture. No invitations, credentials, or simulated presence. */
async function run() {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Opening fixtures require NODE_ENV=development.");
  const value = (key: string) =>
    process.argv
      .find((arg) => arg.startsWith(`--${key}=`))
      ?.slice(key.length + 3);
  const instanceId = value("instance");
  const locationName = value("location");
  if (!instanceId || !locationName)
    throw new Error(
      "Supply --instance and --location (captured Location name).",
    );
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(
      async (tx) => {
        const instance = await tx.campaignInstance.findUniqueOrThrow({
          where: { id: instanceId },
          include: {
            owner: true,
            runtime: true,
            currentSnapshot: {
              include: {
                worldDefinitionSnapshot: true,
                campaignDefinitionSnapshot: true,
              },
            },
          },
        });
        if (["ARCHIVED", "CONCLUDED"].includes(instance.status))
          throw new Error("Choose an editable Instance.");
        if (
          await tx.campaignInstanceSession.findFirst({
            where: { campaignInstanceId: instanceId, status: "ACTIVE" },
          })
        )
          throw new Error(
            "Pause the active Session before preparing the opening.",
          );
        if (!instance.owner || !instance.runtime || !instance.currentSnapshot)
          throw new Error("Owner, runtime, and capture are required.");
        const manifest =
          instance.currentSnapshot.worldDefinitionSnapshot.manifest;
        if (!isCanonicalSnapshotManifest(manifest))
          throw new Error("Captured World is unavailable.");
        const locations = manifest.records.filter(
          (r) =>
            r.resourceType === "locations" &&
            (r.payload as { name?: string }).name === locationName,
        );
        if (locations.length !== 1)
          throw new Error(
            "Location name must resolve uniquely in the captured World.",
          );
        const location = locations[0];
        const state = instance.runtime.state as Prisma.JsonObject;
        const preparation = (state.preparation ?? {}) as Prisma.JsonObject;
        if (
          preparation.startingLocationId &&
          preparation.startingLocationId !== location.sourceId
        )
          throw new Error(
            "The Instance already has another opening Location; use its preparation editor to change it.",
          );
        const nextState = {
          ...state,
          preparation: {
            ...preparation,
            startingLocationId: location.sourceId,
          },
        };
        const issues = validateRuntimeForCapturedPair(nextState, instance);
        if (issues.length) throw new Error(issues[0].detail);
        const players = ["Test Player — Ada", "Test Player — Theo"];
        if (!apply)
          return {
            mode: "preview",
            campaign: instance.name,
            gm: instance.owner.displayName,
            startingLocation: locationName,
            players,
          };
        const gm = await tx.campaignInstanceHumanMembership.findUnique({
          where: {
            campaignInstanceId_userId: {
              campaignInstanceId: instanceId,
              userId: instance.owner.id,
            },
          },
        });
        if (gm && (gm.role !== "GM" || gm.status !== "ACTIVE"))
          throw new Error(
            "Existing owner membership needs explicit review; the seed will not rewrite it.",
          );
        let changed = false;
        if (!gm) {
          await tx.campaignInstanceHumanMembership.create({
            data: {
              campaignInstanceId: instanceId,
              userId: instance.owner.id,
              displayName: instance.owner.displayName,
              role: "GM",
              status: "ACTIVE",
            },
          });
          changed = true;
        }
        for (const [index, displayName] of players.entries()) {
          const userId = `opening-test:${createHash("sha256").update(`${instanceId}/${index}`).digest("hex").slice(0, 32)}`;
          const member = await tx.campaignInstanceHumanMembership.findUnique({
            where: {
              campaignInstanceId_userId: {
                campaignInstanceId: instanceId,
                userId,
              },
            },
          });
          if (member) continue;
          await tx.user.upsert({
            where: { id: userId },
            create: { id: userId, displayName, role: "PARTICIPANT" },
            update: {},
          });
          const profile = await tx.playerProfile.upsert({
            where: { userId },
            create: { userId, displayName },
            update: {},
          });
          await tx.campaignInstanceHumanMembership.create({
            data: {
              campaignInstanceId: instanceId,
              userId,
              playerProfileId: profile.id,
              displayName,
              role: "PLAYER",
              status: "ACTIVE",
            },
          });
          changed = true;
        }
        if (!preparation.startingLocationId) {
          const saved = await tx.campaignInstanceRuntime.updateMany({
            where: {
              id: instance.runtime.id,
              revision: instance.runtime.revision,
            },
            data: { state: nextState, revision: { increment: 1 } },
          });
          if (saved.count !== 1)
            throw new Error("Runtime changed; retry from fresh state.");
          changed = true;
        }
        if (changed)
          await tx.campaignInstanceAuditEvent.create({
            data: {
              campaignInstanceId: instanceId,
              actorUserId: instance.owner.id,
              action: "instance.development-opening.seeded",
              subjectName: instance.name,
              subjectType: "Campaign opening",
              detail: {
                gmName: instance.owner.displayName,
                startingLocationName: locationName,
                testPlayers: players,
                previousPreparation: preparation,
              },
            },
          });
        return {
          mode: changed ? "applied" : "unchanged",
          campaign: instance.name,
          gm: instance.owner.displayName,
          startingLocation: locationName,
          players,
          note: "Test roster only: create Characters through the roster. No sign-in identities or Session presence were fabricated.",
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}
void run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Opening seed failed.",
  );
  process.exitCode = 1;
});
