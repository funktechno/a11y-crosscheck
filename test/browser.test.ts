import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findLocalBrowser } from "../src/browser.ts";

// A fake puppeteer-style cache: <cache>/chrome/<build>/chrome-linux64/chrome
function cache(...builds: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "a11y-browser-"));
  for (const b of builds) {
    const exe = path.join(dir, "chrome", b, "chrome-linux64", "chrome");
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, "");
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("browser lookup", () => {
  test("no browser in any cache: null, so the first scan downloads one", () => {
    assert.equal(findLocalBrowser([path.join(tmpdir(), "a11y-no-such-cache")]), null);
  });

  test("the newest build in a cache wins", (t) => {
    const c = cache("linux-130.0.1", "linux-156.0.2", "linux-99.0.0");
    t.after(c.cleanup);
    assert.equal(findLocalBrowser([c.dir]), path.join(c.dir, "chrome", "linux-156.0.2", "chrome-linux64", "chrome"));
  });

  test("the first cache with a browser wins, even over a newer one in a later cache", (t) => {
    const tool = cache("linux-130.0.1");
    const home = cache("linux-156.0.2");
    t.after(() => {
      tool.cleanup();
      home.cleanup();
    });
    assert.equal(findLocalBrowser([tool.dir, home.dir]), path.join(tool.dir, "chrome", "linux-130.0.1", "chrome-linux64", "chrome"));
  });

  test("an empty first cache falls through to the next", (t) => {
    const home = cache("linux-156.0.2");
    t.after(home.cleanup);
    assert.equal(findLocalBrowser([path.join(tmpdir(), "a11y-no-such-cache"), home.dir]), path.join(home.dir, "chrome", "linux-156.0.2", "chrome-linux64", "chrome"));
  });
});
