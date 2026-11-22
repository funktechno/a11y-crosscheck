/**
 * Resolve a Chromium for the scan, downloading one if there is none.
 *
 * Why not the installed Edge: pa11y and Lighthouse both drive the browser through puppeteer,
 * and puppeteer cannot launch Windows' msedge.exe -- it forks and exits, so puppeteer's
 * process handle dies and it reports "Failed to launch the browser process" with no further
 * detail. A real Chromium is required, and a pinned one also makes results reproducible.
 *
 * Resolution order: CHROME_PATH, then the tool's own cache, then puppeteer's default cache (a
 * browser a project's own puppeteer install already fetched), then a system Chrome/Chromium.
 * Nothing is downloaded at install time; the download happens here, on the first scan that
 * finds no browser, or on `--install-browser`.
 *
 * The cache lives with the tool, not with the project being scanned (override with
 * A11Y_BROWSER_CACHE): a global install downloads one browser for every project, a dev
 * dependency keeps it inside node_modules, and the scanned repo gets nothing to gitignore but
 * its reports. Set A11Y_BROWSER_CACHE to keep the browser and the scan's profile folder outside the
 * package, e.g. when a global install is not writable or a reinstall should not lose them.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where this tool is installed: the repo, node_modules/a11y-crosscheck, or the global prefix. */
export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CACHE = process.env.A11Y_BROWSER_CACHE
  ? path.resolve(process.env.A11Y_BROWSER_CACHE)
  : path.join(TOOL_ROOT, ".cache", "puppeteer");

/**
 * The scan's browser profile (cookies and storage it clears itself, but also the service workers and
 * caches it must not inherit). It follows A11Y_BROWSER_CACHE, so nothing is written inside a package
 * that cannot be written to; the dot keeps it from being read as a browser by `findLocalBrowser`.
 */
export const PROFILE_DIR = process.env.A11Y_BROWSER_CACHE
  ? path.join(CACHE, ".a11y-profile")
  : path.join(TOOL_ROOT, ".cache", "a11y-profile");

/**
 * Where puppeteer itself keeps browsers when nothing configures it. A project that installs this
 * package (or puppeteer) next to its own deps usually ends up with one here.
 */
export const PUPPETEER_DEFAULT_CACHE = process.env.PUPPETEER_CACHE_DIR
  ? path.resolve(process.env.PUPPETEER_CACHE_DIR)
  : path.join(os.homedir(), ".cache", "puppeteer");

/** Executable layouts used by Chrome for Testing / Chromium across platforms. */
const EXE_CANDIDATES = [
  "chrome-win64/chrome.exe",
  "chrome-win32/chrome.exe",
  "chrome-linux64/chrome",
  "chrome-linux/chrome",
  "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium"
];

/**
 * Look through the caches, in order, for an installed Chromium build; the first cache that has
 * one wins, so the tool's own pinned browser beats whatever puppeteer left in the home folder.
 */
export function findLocalBrowser(caches: string[] = [CACHE, PUPPETEER_DEFAULT_CACHE]): string | null {
  for (const cache of caches) {
    const hit = findIn(cache);
    if (hit) return hit;
  }
  return null;
}

function findIn(cache: string): string | null {
  if (!existsSync(cache)) return null;
  const found: string[] = [];
  // cache layout: <cache>/<browser>/<platform-buildId>/<exe layout>
  for (const browser of readdirSync(cache)) {
    if (browser.startsWith(".")) continue; // the scan profile, not a browser
    const bdir = path.join(cache, browser);
    let builds: string[] = [];
    try {
      builds = readdirSync(bdir);
    } catch {
      continue;
    }
    for (const build of builds) {
      for (const exe of EXE_CANDIDATES) {
        const full = path.join(bdir, build, exe);
        if (existsSync(full)) found.push(full);
      }
    }
  }
  // Build ids look like win64-156.0.8078.47: compare the numbers as numbers, or 99 outranks 156.
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop() || null;
}

/** Any system Chromium/Chrome, as a last resort. Edge is deliberately excluded. */
function findSystemChrome(): string | null {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Chromium/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  return candidates.find((c) => existsSync(c)) || null;
}

/**
 * @param {{quiet?: boolean}} [opts]
 * @returns {string} absolute path to a Chromium executable
 */
export function ensureBrowser(opts: { quiet?: boolean } = {}): string {
  const log = (m: string) => {
    if (!opts.quiet) console.log(m);
  };

  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH is set but does not exist: ${process.env.CHROME_PATH}`);
  }

  const local = findLocalBrowser();
  if (local) {
    log(`Chromium ready: ${local}`);
    return local;
  }

  const system = findSystemChrome();
  if (system) {
    log(`Using system Chromium: ${system}`);
    return system;
  }

  // Said even when quiet: a first scan otherwise sits silent through a ~150MB download.
  console.log(`No local Chromium found - downloading (one-time, into ${CACHE})...`);
  // "chromium" has no pinned build in every puppeteer version, so ask for latest; the
  // Chrome for Testing build is the fallback and is itself an unbranded Chromium.
  for (const id of ["chromium@latest", "chrome@stable"]) {
    // shell:true so Windows resolves npx.cmd/npx.ps1 off PATH; spawning "npx.cmd"
    // directly fails silently there -- and with a shell, the path needs its own quotes.
    const r = spawnSync("npx", ["--yes", "@puppeteer/browsers", "install", id, "--path", `"${CACHE}"`], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true
    });
    if (r.status === 0) {
      const got = findLocalBrowser();
      if (got) {
        log(`Installed ${id}: ${got}`);
        return got;
      }
    }
    log(`Could not install ${id}, trying next option...`);
  }
  throw new Error(
    "Could not obtain a Chromium build.\n" +
      "Install one manually, then set CHROME_PATH:\n" +
      "  npx @puppeteer/browsers install chrome@stable"
  );
}
