// cleanManifest.mjs -- keep devDependencies out of the published package.json.
// Usage: node scripts/build/cleanManifest.mjs strip|restore     (run by the prepack / postpack hooks)
//
// npm copies devDependencies into the tarball's manifest whatever `files` says. `strip` backs up
// package.json and rewrites it without them just before npm packs; `restore` puts the backup back
// byte for byte. This CHANGES THE TREE between the two. If a pack is killed before `restore`, the
// next `strip` restores first, and `restore` can be run by hand.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = execFileSync("git", ["-C", here, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const manifest = path.join(root, "package.json");
const backup = path.join(root, ".cache", "package.json.orig");

function restore() {
  if (!existsSync(backup)) return false;
  copyFileSync(backup, manifest);
  rmSync(backup);
  return true;
}

const mode = process.argv[2];
if (mode === "strip") {
  if (restore()) console.log("cleanManifest: restored a package.json left stripped by an interrupted pack");
  mkdirSync(path.dirname(backup), { recursive: true });
  copyFileSync(manifest, backup);
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  delete pkg.devDependencies;
  writeFileSync(manifest, JSON.stringify(pkg, null, 2) + "\n");
  console.log("cleanManifest: devDependencies left out of the packed manifest");
} else if (mode === "restore") {
  if (restore()) console.log("cleanManifest: package.json restored");
} else {
  console.error("usage: node scripts/build/cleanManifest.mjs strip|restore");
  process.exit(2);
}
