import { BadRequestException } from "@nestjs/common";
import { open, rename, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";

export async function createCompressedArchive(
  sourceDirectory: string,
  outputPath: string,
): Promise<void> {
  const reservation = await open(outputPath, "wx");
  await reservation.close();
  const temporary = `${outputPath}.partial`;
  try {
    await runTar(["-czf", temporary, "-C", sourceDirectory, "."]);
    await rename(temporary, outputPath);
  } catch (error) {
    await Promise.allSettled([unlink(outputPath), unlink(temporary)]);
    throw error;
  }
}

export async function extractCompressedArchive(
  inputPath: string,
  destination: string,
): Promise<void> {
  const entries = (await runTar(["-tzf", inputPath]))
    .split("\n")
    .filter(Boolean);
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, "");
    if (
      normalized.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.includes("/../")
    ) {
      throw new BadRequestException("The archive contains an unsafe path.");
    }
    if (
      normalized &&
      normalized !== "." &&
      normalized !== "manifest.json" &&
      normalized !== "schema.prisma" &&
      normalized !== "domain-records.json" &&
      normalized !== "media-assets.json" &&
      normalized !== "storage" &&
      !normalized.startsWith("storage/")
    ) {
      throw new BadRequestException("The archive contains an unexpected path.");
    }
  }
  const verbose = await runTar(["-tvzf", inputPath]);
  if (
    verbose
      .split("\n")
      .filter(Boolean)
      .some((line) => line.startsWith("l") || line.startsWith("h"))
  ) {
    throw new BadRequestException("Archive links are not allowed.");
  }
  await runTar(["-xzf", inputPath, "-C", destination, "--no-same-owner"]);
}

function runTar(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `tar exited with status ${code}`));
    });
  });
}
