import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPlan } from "../src/config.ts";

// Configs live in a temp dir with no node_modules above them, like a project that only has the
// tool installed globally. (The temp dir's parents hold no a11y-crosscheck either.)
function project(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "a11y-resolve-"));
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), source);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a config can import defineConfig from a package that is not installed: the running tool answers", async (t) => {
  const { dir, cleanup } = project({
    "a11y.config.mjs": `import { defineConfig } from "a11y-crosscheck";
export default defineConfig(({ args }) => ({ pages: [args.page ?? "/from-global"] }));`
  });
  t.after(cleanup);
  const plan = await loadPlan([`--config=${path.join(dir, "a11y.config.mjs")}`], { installed: ["axe"] });
  assert.deepEqual(plan.pages, ["/from-global"]);
});

test("a copy installed in the project wins over the running tool", async (t) => {
  const { dir, cleanup } = project({
    "node_modules/a11y-crosscheck/package.json": JSON.stringify({
      name: "a11y-crosscheck",
      version: "0.0.0-local",
      type: "module",
      exports: "./index.js"
    }),
    "node_modules/a11y-crosscheck/index.js": `export const defineConfig = (c) => ({ ...c, pages: ["/from-local-copy"] });`,
    "a11y.config.mjs": `import { defineConfig } from "a11y-crosscheck";
export default defineConfig({ pages: ["/ignored"] });`
  });
  t.after(cleanup);
  const plan = await loadPlan([`--config=${path.join(dir, "a11y.config.mjs")}`]);
  assert.deepEqual(plan.pages, ["/from-local-copy"]);
});

test("other missing packages still fail: the hook only answers for a11y-crosscheck", async (t) => {
  const { dir, cleanup } = project({
    "a11y.config.mjs": `import "definitely-not-installed-a11y-test";\nexport default {};`
  });
  t.after(cleanup);
  await assert.rejects(loadPlan([`--config=${path.join(dir, "a11y.config.mjs")}`]), /definitely-not-installed/);
});

test("a TypeScript config (.mts) loads, types stripped, and can import defineConfig", async (t) => {
  const { dir, cleanup } = project({
    "a11y.config.mts": `import { defineConfig, type Config } from "a11y-crosscheck";
const pages: NonNullable<Config["pages"]> = ["/typed"];
export default defineConfig({ pages });`
  });
  t.after(cleanup);
  const plan = await loadPlan([`--config=${path.join(dir, "a11y.config.mts")}`]);
  assert.deepEqual(plan.pages, ["/typed"]);
});
