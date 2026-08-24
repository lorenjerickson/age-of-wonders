import "reflect-metadata";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { DomainOperationsModule } from "../domain/domain-operations.module";
import { createCompressedArchive } from "../transfer/archive-files";
import { HostTransferService } from "../transfer/host-transfer.service";

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function ids(name: string): string[] {
  return (argumentValue(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function run(): Promise<void> {
  const output = argumentValue("--output");
  if (!output) throw new Error("Use --output=/path/to/transfer.aow.tar.gz.");
  const staging = await mkdtemp(join(tmpdir(), "aow-export-"));
  const application = await NestFactory.createApplicationContext(
    DomainOperationsModule,
    {
      logger: ["error", "warn"],
    },
  );
  try {
    const manifest = await application
      .get(HostTransferService)
      .exportToDirectory(staging, {
        worldIds: ids("--worlds"),
        campaignIds: ids("--campaigns"),
        sessionIds: ids("--sessions"),
      });
    await createCompressedArchive(staging, output);
    process.stdout.write(
      `${JSON.stringify(
        {
          output,
          selection: manifest.selection,
          storageObjects: manifest.storage.objects.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await application.close();
    await rm(staging, { recursive: true, force: true });
  }
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Export failed."}\n`,
  );
  process.exitCode = 1;
});
