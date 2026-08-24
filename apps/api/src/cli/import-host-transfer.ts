import "reflect-metadata";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { DomainOperationsModule } from "../domain/domain-operations.module";
import { extractCompressedArchive } from "../transfer/archive-files";
import {
  type ConflictStrategy,
  parseManifest,
  verifyHostTransferArchive,
} from "../transfer/host-transfer-archive";
import { HostTransferService } from "../transfer/host-transfer.service";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

async function run(): Promise<void> {
  const input = argumentValue("--input");
  if (!input) throw new Error("Use --input=/path/to/transfer.aow.tar.gz.");
  const conflicts = argumentValue("--conflicts") ?? "ours";
  if (
    !(["ours", "theirs", "both"] as const).includes(
      conflicts as ConflictStrategy,
    )
  ) {
    throw new Error("--conflicts must be ours, theirs, or both.");
  }
  const staging = await mkdtemp(join(tmpdir(), "aow-import-"));
  try {
    await extractCompressedArchive(input, staging);
    const manifest = parseManifest(
      JSON.parse(
        await readFile(join(staging, "manifest.json"), "utf8"),
      ) as unknown,
    );
    await verifyHostTransferArchive(staging, manifest);
    const archivedSchema = join(staging, manifest.database.prismaSchema);
    if (process.argv.includes("--upgrade-schema")) {
      await runSchemaUpgrade(archivedSchema);
    }
    const application = await NestFactory.createApplicationContext(
      DomainOperationsModule,
      {
        logger: ["error", "warn"],
      },
    );
    try {
      const report = await application
        .get(HostTransferService)
        .importFromDirectory(staging, {
          apply: process.argv.includes("--apply"),
          conflicts: conflicts as ConflictStrategy,
        });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
      await application.close();
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function runSchemaUpgrade(schemaPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@aow/api",
        "exec",
        "prisma",
        "db",
        "push",
        `--schema=${schemaPath}`,
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Schema upgrade failed with status ${code}.`));
    });
  });
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Import failed."}\n`,
  );
  process.exitCode = 1;
});
