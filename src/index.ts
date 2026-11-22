/**
 * The package's public API. A project config can import `defineConfig` (or only the types), and a
 * script can run a scan without the CLI:
 *
 *   import { loadPlan, scan } from "a11y-crosscheck";
 *   const exitCode = await scan(await loadPlan(["--only=axe", "--url=http://localhost:5173"]));
 *
 * Under a global install the package is not in the project's node_modules; the CLI makes this
 * import resolve anyway while it loads the config (src/resolve.ts).
 */
export { defineConfig } from "./define.ts";
export { loadPlan, parseArgs, resolveEngines, ALL_ENGINES } from "./config.ts";
export { installedEngines } from "./engines/installed.ts";
export { scan } from "./scan.ts";
export type * from "./types.ts";
