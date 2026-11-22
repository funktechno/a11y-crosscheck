/**
 * Turns the project's a11y.config.mjs plus the command line into one plan the engines run.
 *
 * Everything that is specific to an app lives in the config: which routes exist, how to tell
 * that a route has actually rendered, how to sign in, how a theme is chosen, which dialogs to
 * open. The engines know none of it. See docs/wiring.md for every field.
 *
 * The command line narrows or retargets a config; it never has to repeat it. Any flag the
 * scanner does not know is still handed to the config (as `args`), so a project can add its
 * own -- e.g. `--book=` for a reader route that needs a document to point at.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { allowSelfImport } from "./resolve.ts";
import { enginePackage, installedEngines } from "./engines/installed.ts";
import type { Args, Config, ConfigModule, EngineName, Plan, Themes, Viewport } from "./types.ts";

/** Every engine the tool knows. Which of them run is `resolveEngines`: the installed ones. */
export const ALL_ENGINES: EngineName[] = ["axe", "pa11y", "lighthouse"];

// .mts and .ts load through Node's built-in type stripping (22.18+); .mts needs no package "type".
const CONFIG_NAMES = ["a11y.config.mjs", "a11y.config.mts", "a11y.config.ts", "a11y.config.js"];

/** 1366x900 is a laptop; 390x844 is a phone in portrait, where layouts genuinely differ. */
const DEFAULT_VIEWPORTS: Record<string, Viewport> = {
  desktop: { width: 1366, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true }
};

/**
 * WCAG 2.0, 2.1 and 2.2 A/AA plus best-practice. 2.2 brings `target-size` (2.5.8), which
 * matters for phone layouts.
 */
const DEFAULT_AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/**
 * WCAG 2.5.3 Label in Name (Level A). axe tags it experimental and skips it by default;
 * Lighthouse turns it on. Where Lighthouse cannot reach a route (signed-in pages, dialogs),
 * nothing would check the rule there without this.
 */
const DEFAULT_AXE_RULES: Record<string, { enabled?: boolean }> = { "label-content-name-mismatch": { enabled: true } };

/**
 * Which engines a scan runs. The engines are optional peer dependencies, so the default is every
 * engine that is installed, and asking for one that is not (or having none) is an error that says
 * what to install, rather than a failure deep inside a scan.
 *
 * @param requested the `--only` list, or null for "whatever is installed"
 */
export function resolveEngines(requested: string[] | null, installed: EngineName[]): EngineName[] {
  const unknown = (requested ?? []).filter((e) => !ALL_ENGINES.includes(e as EngineName));
  if (unknown.length) throw new Error(`unknown engine(s): ${unknown.join(", ")}`);
  const engines = (requested ?? installed) as EngineName[];
  const missing = engines.filter((e) => !installed.includes(e));
  if (missing.length) {
    throw new Error(
      `engine(s) not installed: ${missing.join(", ")}. Install ${missing.map(enginePackage).join(" ")} ` +
        "next to a11y-crosscheck: `npm install -g " + missing.map(enginePackage).join(" ") + "` for a global " +
        "install, or `npm install -D " + missing.map(enginePackage).join(" ") + "` in the project."
    );
  }
  if (!engines.length) {
    throw new Error(
      "no engines are installed. a11y-crosscheck runs axe-core, pa11y and Lighthouse, and installs none " +
        "of them itself. Install the ones you want, e.g. `npm install -g axe-core pa11y lighthouse` " +
        "(`npm install -D` in a project)."
    );
  }
  return engines;
}

/**
 * Split argv into flags. Splits on the first "=" only: a route can carry its own query string
 * (`--pages=/viewer/?doc=a.pdf`), and splitting on every one cuts it down to `/viewer/?doc`.
 */
export function parseArgs(argv: string[]): Args {
  return Object.fromEntries(
    argv.map((a) => {
      const flag = a.replace(/^--/, "");
      const at = flag.indexOf("=");
      return at === -1 ? [flag, true] : [flag.slice(0, at), flag.slice(at + 1)];
    })
  );
}

const list = (v: unknown): string[] =>
  String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

async function readConfig(args: Args): Promise<{ file: string | null; config: Config }> {
  const explicit = typeof args.config === "string" ? path.resolve(args.config) : null;
  const file = explicit || CONFIG_NAMES.map((n) => path.resolve(n)).find((f) => existsSync(f));
  if (!file) {
    // A config is optional: with none, the scan is "these pages, as they are" -- enough for a
    // static site, and a fair first look at anything else.
    return { file: null, config: {} };
  }
  if (!existsSync(file)) throw new Error(`config not found: ${file}`);
  allowSelfImport(); // so the config can `import { defineConfig } from "a11y-crosscheck"` under a global install
  const mod = (await import(pathToFileURL(file).href)) as { default?: ConfigModule } & Config;
  const exported: ConfigModule = mod.default ?? mod;
  const config = typeof exported === "function" ? await exported({ args }) : exported;
  return { file, config: config || {} };
}

/**
 * How a theme is applied before the app boots. Returns the source of a script that runs at
 * the start of every document, or null when the theme is applied another way (emulated media).
 */
function themeScript(apply: Themes["apply"], theme: string): string | null {
  if (!apply) return null;
  if (typeof apply === "function") return apply(theme);
  if (typeof apply === "object") {
    return `try { localStorage.setItem(${JSON.stringify(apply.localStorage)}, ${JSON.stringify(theme)}); } catch {}`;
  }
  return null;
}

export async function loadPlan(argv: string[]): Promise<Plan> {
  const args = parseArgs(argv);
  const { file, config } = await readConfig(args);

  // --url wins over --port, which wins over the config, so the same config can target a dev
  // server, a served build, or production.
  const base = (
    args.url
      ? String(args.url)
      : args.port
        ? `http://localhost:${args.port}`
        : config.baseUrl || "http://localhost:5173"
  ).replace(/\/+$/, "");

  /** Filesystem-safe site label: drop the scheme, and lose ':' and '/' which break paths. */
  const site = base
    .replace(/^https?:\/\//, "")
    .replace(/:/g, "_")
    .replace(/[/\\]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_");

  const engines = resolveEngines(args.only ? list(args.only) : null, installedEngines());

  const pages = args.pages ? list(args.pages) : config.pages || ["/"];

  const themeCfg = config.themes || {};
  const themeValues = args.themes
    ? list(args.themes)
    : themeCfg.values || [themeCfg.default || "default"];

  const viewports = config.viewports || DEFAULT_VIEWPORTS;
  const viewportNames = args.viewports ? list(args.viewports) : Object.keys(viewports);
  for (const v of viewportNames) {
    if (!viewports[v]) throw new Error(`unknown viewport: ${v} (have ${Object.keys(viewports).join(", ")})`);
  }

  // The "default variant" is what interactive states run in, and the one whose run key is the
  // bare page path -- so a run narrowed to one theme and one viewport reads like a plain list.
  const defaultTheme = themeCfg.default || themeValues[0];
  const defaultViewport = viewportNames[0];

  const states = args.states === "off" ? [] : config.states || [];

  const runs: Plan["runs"] = [];
  for (const page of pages) {
    for (const theme of themeValues) {
      for (const viewport of viewportNames) {
        const plain = theme === defaultTheme && viewport === defaultViewport;
        runs.push({
          key: plain ? page : `${page} [${theme}, ${viewport}]`,
          page,
          theme,
          viewport
        });
      }
    }
  }
  for (const state of states) {
    if (!pages.includes(state.page)) continue;
    runs.push({
      key: `${state.page} <${state.label}>`,
      page: state.page,
      theme: defaultTheme,
      viewport: defaultViewport,
      steps: state.steps,
      label: state.label
    });
  }

  // Credentials from --login=user:pass or A11Y_USER / A11Y_PASS. The password may contain ':'.
  const raw = args.login === true ? "" : String(args.login || "");
  const [user, ...rest] = raw.split(":");
  const login = {
    user: user || process.env.A11Y_USER || "",
    pass: rest.join(":") || process.env.A11Y_PASS || ""
  };

  const out = path.resolve(String(args.out || config.out || path.join("reports", "a11y")));
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

  return {
    args,
    configFile: file,
    base,
    site,
    engines,
    pages,
    themes: {
      values: themeValues,
      emulateColorScheme: themeCfg.apply === "prefers-color-scheme",
      script: (theme) => themeScript(themeCfg.apply, theme)
    },
    viewports,
    viewportNames,
    runs,
    ready: {
      root: "body",
      busy: [],
      requireText: true,
      settleMs: 1000,
      timeoutMs: 30000,
      ...(config.ready || {})
    },
    auth: config.auth || null,
    login,
    axe: {
      tags: config.axe?.tags || DEFAULT_AXE_TAGS,
      rules: { ...DEFAULT_AXE_RULES, ...(config.axe?.rules || {}) }
    },
    pa11y: { standard: "WCAG2AA", ...(config.pa11y || {}) },
    acknowledged: config.acknowledged || [],
    out,
    stamp
  };
}
