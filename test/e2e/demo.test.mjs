// End to end: the demo app, scanned by all three engines in a real Chromium. Slow (a minute or
// two), so it is `npm run test:e2e`, not part of `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEMO = path.join(ROOT, "examples", "demo", "run.mjs");
const TIMEOUT = 10 * 60 * 1000;

function demo(t, ...flags) {
  const out = mkdtempSync(path.join(tmpdir(), "a11y-e2e-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [DEMO, `--out=${out}`, ...flags], {
    encoding: "utf8",
    timeout: TIMEOUT
  });
  // The scanner's console is the useful part of a failure; keep it in the test output.
  t.diagnostic(r.stdout.slice(-4000));
  if (r.stderr) t.diagnostic(r.stderr.slice(-2000));
  return { status: r.status, stdout: r.stdout, out };
}

const reports = (out) =>
  ["axe", "pa11y", "lighthouse"].map((e) =>
    existsSync(path.join(out, e)) ? readdirSync(path.join(out, e)).filter((f) => f.endsWith(".json")).length : 0
  );

test("the demo app as written is clean: exit 0, a report from every engine", { timeout: TIMEOUT }, (t) => {
  const { status, out } = demo(t);
  assert.deepEqual([status, reports(out)], [0, [1, 1, 1]]);
  assert.ok(readdirSync(out).some((f) => /^summary-.*\.html$/.test(f)), "summary HTML written");
});

test("the broken demo fails the scan with exit 1, including the dialog state", { timeout: TIMEOUT }, (t) => {
  const { status, stdout } = demo(t, "--broken", "--only=axe");
  assert.equal(status, 1);
  assert.match(stdout, /<dialog>\s+[1-9]\d* rule\(s\)/);
});
