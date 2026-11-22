// Not run: `npm run typecheck` compiles it. Each `@ts-expect-error` line must keep failing to
// compile, and everything else must compile, so the shipped config types stay honest.
import { defineConfig, type Config } from "../../src/index.ts";

// The object form and the function form (sync and async).
export const asObject = defineConfig({ baseUrl: "http://localhost:4173", pages: ["/"] });
export const asFunction = defineConfig(({ args }) => ({ pages: [String(args.page ?? "/")] }));
export const asAsync = defineConfig(async () => ({ pages: ["/"] }));

// Every documented field.
export const full: Config = {
  baseUrl: "http://localhost:5173",
  pages: ["/", "/about"],
  ready: { root: "#app", busy: [".spinner"], requireText: true, settleMs: 300, timeoutMs: 20000 },
  themes: { values: ["light", "dark"], apply: { localStorage: "theme" } },
  viewports: { desktop: { width: 1366, height: 900 }, phone: { width: 390, height: 844, mobile: true } },
  auth: {
    async signIn({ baseUrl, user, pass }) {
      void [baseUrl, user, pass];
      return { cookies: [{ name: "s", value: "1" }], localStorage: { k: "v" }, headers: { Authorization: "Bearer x" } };
    }
  },
  states: [{ page: "/", label: "dialog", steps: [{ click: "#open", waitFor: '[role="dialog"]' }] }],
  axe: { tags: ["wcag2a"], rules: { "label-content-name-mismatch": { enabled: true } } },
  pa11y: { standard: "WCAG2AA", includeWarnings: true },
  acknowledged: [
    { rule: "color-contrast", reason: "bgOverlap", html: 'role="presentation"', why: "text layer" },
    { rule: "color-contrast", targets: ["#a"], pages: ["/"] }
  ],
  out: "reports/a11y"
};
export const prefers: Config = { themes: { values: ["light"], apply: "prefers-color-scheme" } };
export const themeFn: Config = { themes: { apply: (theme) => `document.documentElement.dataset.t = ${JSON.stringify(theme)}` } };

// Must not compile.
// @ts-expect-error an acknowledged entry needs `html` or `targets`, or it would silence a whole rule
export const noMatcher: Config = { acknowledged: [{ rule: "color-contrast" }] };
// @ts-expect-error unknown way to apply a theme
export const badApply: Config = { themes: { apply: "class" } };
// @ts-expect-error pages are paths
export const badPages: Config = { pages: [1] };
// @ts-expect-error a step needs a selector to click
export const badStep: Config = { states: [{ page: "/", label: "x", steps: [{ waitFor: "#a" }] }] };
