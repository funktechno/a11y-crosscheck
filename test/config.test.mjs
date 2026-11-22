import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs, loadPlan, ALL_ENGINES } from "../src/config.mjs";

// A config in a temp dir, so no test reads an a11y.config.mjs that happens to sit in the cwd.
function withConfig(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "a11y-config-"));
  const file = path.join(dir, "a11y.config.mjs");
  writeFileSync(file, source);
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const MATRIX = `export default ({ args }) => ({
  baseUrl: "http://localhost:4173/",
  pages: ["/", "/about"],
  themes: { values: ["light", "dark"], apply: { localStorage: "theme" } },
  states: [
    { page: "/", label: "dialog", steps: [] },
    { page: "/elsewhere", label: "skipped", steps: [] }
  ],
  custom: args.doc ?? null
});`;

test("parseArgs splits on the first = only, so a route keeps its query string", () => {
  assert.deepEqual(parseArgs(["--pages=/viewer/?doc=a.pdf", "--states=off", "--help"]), {
    pages: "/viewer/?doc=a.pdf",
    states: "off",
    help: true
  });
});

test("--url beats --port, which beats the config's baseUrl; trailing slashes go", async (t) => {
  const { file, cleanup } = withConfig(MATRIX);
  t.after(cleanup);
  const fromConfig = await loadPlan([`--config=${file}`]);
  const fromPort = await loadPlan([`--config=${file}`, "--port=9000"]);
  const fromUrl = await loadPlan([`--config=${file}`, "--port=9000", "--url=https://staging.example.com/"]);
  assert.deepEqual(
    [fromConfig.base, fromPort.base, fromUrl.base, fromConfig.site],
    ["http://localhost:4173", "http://localhost:9000", "https://staging.example.com", "localhost_4173"]
  );
});

test("runs cover page x theme x viewport, plus states whose page is scanned", async (t) => {
  const { file, cleanup } = withConfig(MATRIX);
  t.after(cleanup);
  const plan = await loadPlan([`--config=${file}`]);
  const keys = plan.runs.map((r) => r.key);
  assert.equal(plan.runs.length, 2 * 2 * 2 + 1);
  assert.deepEqual(
    [keys[0], keys[1], keys.at(-1), plan.runs.at(-1).theme, plan.runs.at(-1).viewport],
    ["/", "/ [light, phone]", "/ <dialog>", "light", "desktop"]
  );
});

test("--states=off and narrowing flags shrink the matrix", async (t) => {
  const { file, cleanup } = withConfig(MATRIX);
  t.after(cleanup);
  const plan = await loadPlan([
    `--config=${file}`,
    "--states=off",
    "--themes=dark",
    "--viewports=phone",
    "--pages=/about",
    "--only=axe,pa11y"
  ]);
  assert.deepEqual(
    [plan.runs.map((r) => r.key), plan.engines],
    [["/about"], ["axe", "pa11y"]]
  );
});

test("unknown engines and viewports are refused", async () => {
  await assert.rejects(loadPlan(["--only=axe,wave"]), /unknown engine\(s\): wave/);
  await assert.rejects(loadPlan(["--viewports=tablet"]), /unknown viewport: tablet/);
});

test("a password may contain ':'; the environment fills in what --login leaves out", async (t) => {
  const saved = { user: process.env.A11Y_USER, pass: process.env.A11Y_PASS };
  t.after(() => {
    for (const [k, v] of [["A11Y_USER", saved.user], ["A11Y_PASS", saved.pass]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  process.env.A11Y_USER = "env-user";
  process.env.A11Y_PASS = "env-pass";
  const explicit = await loadPlan(["--login=me:pa:ss"]);
  const fromEnv = await loadPlan([]);
  assert.deepEqual(
    [explicit.login, fromEnv.login],
    [{ user: "me", pass: "pa:ss" }, { user: "env-user", pass: "env-pass" }]
  );
});

test("unknown flags reach the config as args, and theme scripts set localStorage", async (t) => {
  const { file, cleanup } = withConfig(MATRIX);
  t.after(cleanup);
  const plan = await loadPlan([`--config=${file}`, "--doc=a.pdf"]);
  assert.equal(plan.args.doc, "a.pdf");
  assert.match(plan.themes.script("dark"), /localStorage\.setItem\("theme", "dark"\)/);
});

test("without a config: one page, every engine, default axe rules", async () => {
  await assert.rejects(
    loadPlan(["--config=" + path.join(tmpdir(), "a11y-does-not-exist.mjs")]),
    /config not found/
  );

  const bare = await loadPlan([]);
  assert.deepEqual(
    [bare.pages, bare.engines, bare.axe.rules["label-content-name-mismatch"]?.enabled],
    [["/"], ALL_ENGINES, true]
  );
});
