import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../public/terrain/v1/", import.meta.url));
const sources = JSON.parse(await readFile(root + "sources.json", "utf8"));
for (const source of sources) {
  for (const [role, map] of Object.entries(source.maps)) {
    const input = await readFile(root + map.file).catch((error) => {
      if (!process.argv.includes("--download"))
        throw new Error(
          "Raw sources are absent. Pass --download to retrieve the pinned sources.",
          { cause: error },
        );
      return execFileSync(
        "curl",
        [
          "-fsSL",
          "--retry",
          "2",
          "--max-time",
          "90",
          "-H",
          "User-Agent: AgeOfWonders-TerrainAssets/1.0",
          map.source,
        ],
        { maxBuffer: 32 * 1024 * 1024 },
      );
    });
    if (createHash("sha256").update(input).digest("hex") !== map.sha256)
      throw new Error("Source checksum mismatch");
    const size = role.endsWith("2k") ? 2048 : 1024;
    const output = await sharp(input)
      .resize(size, size, { fit: "fill" })
      .webp({ quality: role.startsWith("normal") ? 95 : 88, effort: 6 })
      .toBuffer();
    const filename = map.file.replace(/\.jpg$/, ".webp");
    await writeFile(root + filename, output);
    map.delivery = {
      file: filename,
      sha256: createHash("sha256").update(output).digest("hex"),
      bytes: output.length,
      width: size,
      height: size,
    };
  }
}
await writeFile(root + "sources.json", JSON.stringify(sources, null, 2) + "\n");
// Raw sources can be fetched again using the URLs and SHA-256 checksums in sources.json.
for (const source of sources)
  for (const map of Object.values(source.maps))
    await unlink(root + map.file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
console.log("Prepared 1K/2K terrain WebP assets.");
