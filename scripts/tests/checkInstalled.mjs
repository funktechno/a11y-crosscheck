// checkInstalled.mjs -- smoke test of an installed copy of the package (read-only).
// Usage: node scripts/tests/checkInstalled.mjs <path to the installed a11y-crosscheck folder>
//
// Loads a config that imports { defineConfig } from "a11y-crosscheck" while that package is not
// resolvable from the config's folder (a global install), and checks the public API is there.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const pkg = process.argv[2];
if (!pkg) {
  console.error("usage: node scripts/tests/checkInstalled.mjs <installed package folder>");
  process.exit(2);
}

const api = await import(pathToFileURL(path.resolve(pkg, "dist", "index.js")).href);
assert.deepEqual(
  ["defineConfig", "loadPlan", "scan", "parseArgs"].filter((n) => typeof api[n] !== "function"),
  [],
  "public API is missing exports"
);

const dir = mkdtempSync(path.join(tmpdir(), "a11y-installed-"));
try {
  writeFileSync(
    path.join(dir, "a11y.config.mts"),
    `import { defineConfig, type Config } from "a11y-crosscheck";
const pages: NonNullable<Config["pages"]> = ["/installed"];
export default defineConfig({ pages });
`
  );
  const plan = await api.loadPlan([`--config=${path.join(dir, "a11y.config.mts")}`]);
  assert.deepEqual(plan.pages, ["/installed"]);
  console.log(`ok: ${pkg} exports the API and resolves its own name from a config outside node_modules`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
