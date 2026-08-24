import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { DomainOperationsModule } from "../domain/domain-operations.module";
import { ScienceDomainArchiveService } from "../domain/science-domain-archive.service";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

async function run() {
  const inputPath = argumentValue("--input");
  if (!inputPath?.trim()) {
    process.stderr.write(
      "An input file is required. Use --input=/path/to/domain-archive.json.\n",
    );
    process.exitCode = 1;
    return;
  }
  const source: unknown = JSON.parse(await readFile(inputPath, "utf8"));
  const application = await NestFactory.createApplicationContext(
    DomainOperationsModule,
    { logger: ["error", "warn"] },
  );
  try {
    const archives = application.get(ScienceDomainArchiveService);
    const report = await archives.import(source, {
      apply: process.argv.includes("--apply"),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.failures.length > 0) process.exitCode = 1;
  } finally {
    await application.close();
  }
}

void run().catch(() => {
  process.stderr.write(
    "The archive could not be imported. Verify the input JSON, database connectivity, and configuration.\n",
  );
  process.exitCode = 1;
});
