import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const app = process.argv[2];
if (!["api", "web"].includes(app)) throw new Error("Choose api or web.");
const libraries = app === "api" ? ["common"] : ["common", "ui"];
const manifests = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/common/package.json",
  "packages/ui/package.json",
];
let child;
let stopping = false;
let installed;
let generated;
let initializedDatabase = false;

async function fingerprint(paths) {
  const hash = createHash("sha256");
  async function visit(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (!["node_modules", "dist", ".git"].includes(entry.name))
          await visit(join(path, entry.name));
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        hash.update(`missing:${path}`);
        return;
      }
      if (error.code !== "ENOTDIR") throw error;
      hash.update(path).update(await readFile(path));
    }
  }
  for (const path of paths) await visit(path);
  return hash.digest("hex");
}
function launch(args) {
  console.log(`[dev:${app}] pnpm ${args.join(" ")}`);
  const worker = spawn("pnpm", args, {
    stdio: "inherit",
    detached: true,
    env: { ...process.env, CI: "1" },
  });
  const done = new Promise((resolve) => {
    worker.once("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    worker.once("exit", (code) => resolve(code ?? 1));
  });
  child = { process: worker, done };
  return child;
}
async function stop() {
  const current = child;
  if (!current) return;
  child = undefined;
  try {
    process.kill(-current.process.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const exited = await Promise.race([
    current.done.then(() => true),
    delay(5000).then(() => false),
  ]);
  if (!exited) {
    try {
      process.kill(-current.process.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await current.done;
  }
}
async function run(args) {
  if (stopping) throw new Error("Stopping");
  const current = launch(args);
  const code = await current.done;
  if (child === current) child = undefined;
  if (code !== 0) throw new Error(`pnpm ${args.join(" ")} exited ${code}`);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    void stop().then(() => process.exit(0));
  });

let lastAttempt;
while (!stopping) {
  const dependencies = await fingerprint(manifests);
  const schema =
    app === "api" ? await fingerprint(["apps/api/prisma/schema.prisma"]) : "";
  const sources = await fingerprint(
    libraries.flatMap((name) => [
      `packages/${name}/src`,
      `packages/${name}/vite.config.ts`,
      `packages/${name}/tsconfig.json`,
      `packages/${name}/tsconfig.build.json`,
    ]),
  );
  const version = `${dependencies}:${schema}:${sources}`;
  if (version !== lastAttempt) {
    lastAttempt = version;
    await stop();
    try {
      if (installed !== dependencies) {
        await run(["install", "--frozen-lockfile"]);
        installed = dependencies;
      }
      for (const name of libraries)
        await run(["--filter", `@aow/${name}`, "build"]);
      if (app === "api" && generated !== `${schema}:${dependencies}`) {
        await run(["--filter", "@aow/api", "db:generate"]);
        generated = `${schema}:${dependencies}`;
      }
      // Preserve the existing development-only initial schema setup. Package rebuilds
      // never apply schema changes; subsequent migrations remain explicit GM work.
      if (app === "api" && !initializedDatabase) {
        await run(["--filter", "@aow/api", "exec", "prisma", "db", "push"]);
        initializedDatabase = true;
      }
      if (app === "web" && process.env.API_INTERNAL_URL) {
        console.log(
          "[dev:web] Waiting for the API to be ready before starting the web app.",
        );
        while (!stopping) {
          try {
            const response = await fetch(
              `${process.env.API_INTERNAL_URL.replace(/\/$/, "")}/health`,
              { signal: AbortSignal.timeout(3000) },
            );
            if (response.ok) break;
          } catch {
            /* API compilation or restart is still in progress. */
          }
          await delay(1000);
        }
      }
      if (stopping) break;
      const server = launch(
        app === "api"
          ? [
              "--filter",
              "@aow/api",
              "exec",
              "nest",
              "start",
              "--watch",
              "--path",
              "tsconfig.docker.json",
              "--debug",
              "0.0.0.0:9229",
            ]
          : ["--filter", "@aow/web", "dev", "--host", "0.0.0.0"],
      );
      void server.done.then((code) => {
        if (child === server && !stopping) {
          console.error(
            `[dev:${app}] App exited (${code}); restarting the container.`,
          );
          process.exit(1);
        }
      });
      console.log(
        `[dev:${app}] Shared packages ready. Watching package sources, dependency manifests, and Prisma schema.`,
      );
    } catch (error) {
      if (!stopping)
        console.error(
          `[dev:${app}] ${error.message}. Waiting for an input change before retrying.`,
        );
    }
  }
  await delay(1000);
}
