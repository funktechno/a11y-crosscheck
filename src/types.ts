/**
 * The public shapes: what an `a11y.config` may contain, and what the scan hands back. A field
 * documented in docs/wiring.md and missing here is a bug. The internal `Plan` is what
 * `loadPlan` returns after merging the config with the command line.
 */

/** Command-line flags the scanner does not know are passed to the config as these. */
export type Args = Record<string, string | true>;

/** What "this route has rendered" means for the app (see docs/wiring.md#when-is-a-page-rendered). */
export interface Ready {
  /** Selector whose element must have children. Default `body`. */
  root?: string;
  /** Selectors that must be gone (spinners, skeletons, `[aria-busy=true]`). */
  busy?: string[];
  /** Require visible text in the body. Default true. */
  requireText?: boolean;
  /** Milliseconds to wait after "ready" for late content. Default 1000. */
  settleMs?: number;
  /** Give up waiting after this long. Default 30000. */
  timeoutMs?: number;
  /** A JavaScript expression that replaces all of the above when given. */
  check?: string;
}

export interface Viewport {
  width: number;
  height: number;
  mobile?: boolean;
}

/** How a theme is applied before the app boots. */
export type ThemeApply =
  | { localStorage: string }
  | "prefers-color-scheme"
  /** Returns the source of a script that runs at the start of every document, or null. */
  | ((theme: string) => string | null);

export interface Themes {
  values?: string[];
  default?: string;
  apply?: ThemeApply;
}

export interface Cookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

/** What an app reads back on load: any combination, planted in every engine's browser. */
export interface Session {
  cookies?: Cookie[];
  localStorage?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface SignInContext {
  baseUrl: string;
  user: string;
  pass: string;
}

export type SignIn = (ctx: SignInContext) => Promise<Session | null | undefined>;

export interface Auth {
  signIn: SignIn;
}

/** One click in an interactive state, then the selector that proves it worked. */
export interface Step {
  click: string;
  waitFor?: string;
}

export interface State {
  page: string;
  label: string;
  steps: Step[];
}

/** An axe needs-review item checked by hand. `html` or `targets` is required, so no entry can silence a whole rule. */
export type Acknowledged = {
  rule: string;
  reason?: string;
  pages?: string[] | "*";
  why?: string;
} & ({ html: string | string[]; targets?: string[] } | { targets: string[]; html?: string | string[] });

export interface AxeOptions {
  tags?: string[];
  rules?: Record<string, { enabled?: boolean }>;
}

export interface Pa11yOptions {
  standard?: string;
  [option: string]: unknown;
}

export interface Config {
  /** Base URL of the running app. Default `http://localhost:5173`. */
  baseUrl?: string;
  /** Paths to scan, each appended to the base URL. Default `["/"]`. */
  pages?: string[];
  ready?: Ready;
  themes?: Themes;
  /** Named viewports. Default: desktop 1366x900 and phone 390x844. */
  viewports?: Record<string, Viewport>;
  auth?: Auth;
  states?: State[];
  axe?: AxeOptions;
  pa11y?: Pa11yOptions;
  acknowledged?: Acknowledged[];
  /** Report directory. Default `reports/a11y`. */
  out?: string;
}

export interface ConfigContext {
  args: Args;
}

export type ConfigFactory = (ctx: ConfigContext) => Config | Promise<Config>;

/** What an `a11y.config` file's default export may be. */
export type ConfigModule = Config | ConfigFactory;

export type EngineName = "axe" | "pa11y" | "lighthouse";

/** A session after defaults: every field present. */
export interface ResolvedSession {
  cookies: Cookie[];
  localStorage: Record<string, string>;
  headers: Record<string, string>;
}

/** One axe run: a page in a theme and viewport, or a state opened by clicking. */
export interface Run {
  key: string;
  page: string;
  theme: string;
  viewport: string;
  steps?: Step[];
  label?: string;
}

export interface Plan {
  args: Args;
  configFile: string | null;
  base: string;
  site: string;
  engines: EngineName[];
  pages: string[];
  themes: {
    values: string[];
    emulateColorScheme: boolean;
    script: (theme: string) => string | null;
  };
  viewports: Record<string, Viewport>;
  viewportNames: string[];
  runs: Run[];
  ready: Required<Pick<Ready, "root" | "busy" | "requireText" | "settleMs" | "timeoutMs">> & Pick<Ready, "check">;
  auth: Auth | null;
  login: { user: string; pass: string };
  axe: { tags: string[]; rules: Record<string, { enabled?: boolean }> };
  pa11y: Pa11yOptions & { standard: string };
  acknowledged: Acknowledged[];
  out: string;
  stamp: string;
}

export interface AxeNode {
  target: string;
  html: string;
  /** axe's messageKey for why it could not decide (needs-review nodes). */
  reason?: string | null;
  acknowledged?: boolean;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface AxeIncomplete {
  id: string;
  impact: string | null;
  help: string;
  count: number;
  nodes: AxeNode[];
  newCount?: number;
  acknowledgedCount?: number;
  unlisted?: number;
}

export interface AxeRunResult {
  violations: AxeViolation[];
  incomplete: AxeIncomplete[];
  incompleteAcknowledged: number;
  incompleteNew: number;
  /** Set when an interactive state could not be opened: that row audited nothing. */
  unreachable?: string;
  /** The page never matched `ready`; the row may have been audited mid-render. */
  notReady?: boolean;
}

export interface Pa11yIssue {
  code: string;
  type: string;
  message: string;
  selector: string;
  context: string;
}

/** A page either ran (`issues`) or did not (`error`). */
export type Pa11yPageResult =
  | { issues: Pa11yIssue[]; notReady?: boolean }
  | { error: string };

export interface LighthouseFailure {
  id: string;
  weight: number;
  title: string;
  nodes: number;
  targets: string[];
}

/** A page either scored (`score`) or did not run (`error`). */
export type LighthousePageResult =
  | { score: number; failures: LighthouseFailure[] }
  | { error: string };

export interface EngineResults {
  axe?: Record<string, AxeRunResult>;
  pa11y?: Record<string, Pa11yPageResult>;
  lighthouse?: Record<string, LighthousePageResult>;
}
