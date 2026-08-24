import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DomainOperationsModule } from "../domain/domain-operations.module";
import { ScienceDomainMigrationRunnerService } from "../domain/science-domain-migration-runner.service";

function batchSizeFromArguments(arguments_: readonly string[]) {
  const argument = arguments_.find((value) =>
    value.startsWith("--batch-size="),
  );
  if (!argument) return undefined;
  const value = Number(argument.slice("--batch-size=".length));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

async function run() {
  const application = await NestFactory.createApplicationContext(
    DomainOperationsModule,
    { logger: ["error", "warn"] },
  );
  try {
    const apply = process.argv.includes("--apply");
    const migration = application.get(ScienceDomainMigrationRunnerService);
    const report = await migration.run({
      apply,
      batchSize: batchSizeFromArguments(process.argv.slice(2)),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.failures.length > 0) process.exitCode = 1;
  } finally {
    await application.close();
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
    `The science-domain migration could not start. ${detail}\n`,
  );
  process.exitCode = 1;
});
