import "reflect-metadata";
import { writeFile } from "node:fs/promises";
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
  const outputPath = argumentValue("--output");
  if (!outputPath?.trim()) {
    process.stderr.write(
      "An output file is required. Use --output=/path/to/domain-archive.json.\n",
    );
    process.exitCode = 1;
    return;
  }
  const application = await NestFactory.createApplicationContext(
    DomainOperationsModule,
    { logger: ["error", "warn"] },
  );
  try {
    const archives = application.get(ScienceDomainArchiveService);
    const archive = await archives.export();
    await writeFile(outputPath, `${JSON.stringify(archive, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    process.stdout.write(
      `${JSON.stringify({ exported: archive.records.length, exceptions: archive.exceptions, output: outputPath }, null, 2)}\n`,
    );
  } finally {
    await application.close();
  }
}

void run().catch((error: unknown) => {
  const reason =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
      ? "The output file already exists; choose a new path to avoid overwriting a backup."
      : "The archive could not be exported. Verify the output path, database connectivity, and stored aggregates.";
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
