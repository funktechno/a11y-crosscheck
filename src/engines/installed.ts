/**
 * The engines are optional peer dependencies: installing this package installs none of them, and
 * a scan runs the ones that are there. Each is looked up the way the engine's own code loads it,
 * from this package outward, so a global install finds engines installed beside it and a project
 * install finds the project's.
 */
import type { EngineName } from "../types.ts";

/** What to resolve to tell whether an engine is installed, and what to install if it is not. */
const ENGINES: Record<EngineName, { probe: string; pkg: string }> = {
  axe: { probe: "axe-core/axe.min.js", pkg: "axe-core" },
  pa11y: { probe: "pa11y", pkg: "pa11y" },
  lighthouse: { probe: "lighthouse", pkg: "lighthouse" }
};

export const ENGINE_NAMES = Object.keys(ENGINES) as EngineName[];

const isInstalled = (engine: EngineName): boolean => {
  try {
    import.meta.resolve(ENGINES[engine].probe);
    return true;
  } catch {
    return false;
  }
};

/** Engines whose package can be resolved from here, in the usual order. */
export function installedEngines(): EngineName[] {
  return ENGINE_NAMES.filter(isInstalled);
}

/** The package to install for an engine: `axe` -> `axe-core`. */
export const enginePackage = (engine: EngineName): string => ENGINES[engine].pkg;
