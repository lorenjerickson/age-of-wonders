import "reflect-metadata";
import { LegacyRealignmentShadowMaterializerService } from "../domain/legacy-realignment-shadow-materializer.service";
import { PrismaService } from "../prisma/prisma.service";

async function run(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const materializer = new LegacyRealignmentShadowMaterializerService(prisma);
    const report = await materializer.run({
      apply: process.argv.includes("--apply"),
      installationKey: process.env.AOW_INSTALLATION_KEY,
      ownerUserId: process.env.AOW_REALIGNMENT_OWNER_USER_ID,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.mode === "blocked") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  const detail =
    error instanceof Error
      ? error.message
          .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
          .replace(/realignment:v1:[^\s'"]+/g, "[internal reference]")
          .slice(0, 500)
      : "Unknown startup failure.";
  process.stderr.write(
    `The domain-realignment shadow materializer could not start. ${detail}\n`,
  );
  process.exitCode = 1;
});
