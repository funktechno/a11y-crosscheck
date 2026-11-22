const path = require("node:path");

/**
 * pa11y depends on puppeteer, whose install would download a ~150 MB browser. This tool never
 * needs that download at install time: it passes its own browser to pa11y and Lighthouse, finds
 * one itself (CHROME_PATH, its own cache, puppeteer's default cache, a system Chrome) and only
 * downloads one on the first scan that finds none, or on `a11y-crosscheck --install-browser`.
 *
 * This file is NOT published. pa11y is an optional peer dependency, installed by the user beside
 * this package, so puppeteer never lands inside the package where it would look for this file; users
 * set PUPPETEER_SKIP_DOWNLOAD=true instead (README, "The browser"). It serves this repo's own
 * development and CI, where `npm ci` installs pa11y here.
 *
 * So the install-time download is off, and where it is switched back on (PUPPETEER_SKIP_DOWNLOAD=false)
 * it lands in the tool's own cache, the same place src/browser.ts looks first.
 *
 * Puppeteer looks for this file upwards from its own folder, which in a global install is inside
 * this package. In a project install the packages are flattened and it is not found there: set
 * PUPPETEER_SKIP_DOWNLOAD=true (or `puppeteer_skip_download=true` in the project's .npmrc) to
 * skip the download, or leave it and the browser is found in puppeteer's default cache.
 */
module.exports = {
  skipDownload: true,
  cacheDirectory: path.join(__dirname, ".cache", "puppeteer")
};
