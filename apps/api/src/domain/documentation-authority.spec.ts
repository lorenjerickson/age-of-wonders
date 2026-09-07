import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repository = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repository, path), "utf8");

describe("documentation authority", () => {
  const excluded = [
    "docs/age-of-wonders-requirements.md",
    "docs/campaign-design.md",
    "docs/project-state-gap-analysis-2026-08-31.md",
    "docs/spa-to-ssr-ssg-migration-plan.md",
    "docs/ssr-ssg-phase-0-spike-results.md",
  ];

  it.each(excluded)("keeps %s visibly excluded", (path) => {
    const source = read(path);
    expect(source).toMatch(/status: deprecated(?:-excluded)?/);
    expect(source).toMatch(/exclude-from-analysis-and-generation: true/i);
    expect(source).toMatch(/excluded/i);
  });

  it("keeps the authority index and closure decision aligned", () => {
    const index = read("docs/README.md");
    const closure = read(
      "docs/information-architecture-realignment-closure-audit.md",
    );
    for (const path of excluded) expect(index).toContain(path.slice(5));
    expect(closure).toContain("status: amended-by-post-realignment-recovery");
    expect(closure).toContain(
      "The original no-additional-wave decision is superseded",
    );
    expect(index).toContain("post-realignment-recovery-report.md");
  });
});
