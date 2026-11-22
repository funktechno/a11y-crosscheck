/**
 * Makes `import ... from "a11y-crosscheck"` work inside an a11y.config under a global install.
 *
 * A global install lives outside the project, so Node cannot find the package from the config's
 * folder. This hook answers only that one specifier, only when normal resolution has already
 * failed, with the copy of the tool that is running. A copy installed in the project still wins
 * (normal resolution succeeds, so the hook never steps in). Needs Node 22.15+ (`registerHooks`).
 */
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACKAGE_NAME = "a11y-crosscheck";

/** The tool's own public entry: index.js beside the compiled files, index.ts when run from source. */
const ENTRY = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), `index${path.extname(fileURLToPath(import.meta.url))}`)
).href;

let registered = false;

export function allowSelfImport(): void {
  if (registered) return;
  registered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (e) {
        const missing = (e as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND";
        if (specifier === PACKAGE_NAME && missing) return { url: ENTRY, shortCircuit: true };
        throw e;
      }
    }
  });
}
