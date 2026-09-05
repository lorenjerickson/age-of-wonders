import "reflect-metadata";
import { LegacyRealignmentPreflightService } from "../domain/legacy-realignment-preflight";
import { PrismaService } from "../prisma/prisma.service";

async function run(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const preflight = new LegacyRealignmentPreflightService(prisma);
    const report = await preflight.run();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.readyForMigration) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  const detail =
    error instanceof Error
      ? error.message
          .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
          .slice(0, 500)
      : "Unknown startup failure.";
  process.stderr.write(
    `The domain-realignment preflight could not start. ${detail}\n`,
  );
  process.exitCode = 1;
});
