// checkPacked.mjs -- the packed manifest has no devDependencies, and packing left the tree alone (read-only).
// Usage: node scripts/tests/checkPacked.mjs <a11y-crosscheck-X.Y.Z.tgz>
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const tgz = process.argv[2];
if (!tgz) {
  console.error("usage: node scripts/tests/checkPacked.mjs <tarball>");
  process.exit(2);
}
// GNU tar on Windows reads "C:" as a host name unless told otherwise.
const flags = process.platform === "win32" ? ["--force-local"] : [];
const packed = JSON.parse(execFileSync("tar", [...flags, "-xzOf", tgz, "package/package.json"], { encoding: "utf8" }));

assert.equal(packed.devDependencies, undefined, "devDependencies are in the published manifest");
assert.ok(packed.peerDependencies && packed.bin && packed.exports, "the manifest lost fields it needs");
const dirty = execFileSync("git", ["status", "--porcelain", "--", "package.json"], { encoding: "utf8" }).trim();
assert.equal(dirty, "", `package.json was left changed by packing:\n${dirty}`);
console.log(`ok: ${packed.name}@${packed.version} has no devDependencies; package.json is as committed`);
