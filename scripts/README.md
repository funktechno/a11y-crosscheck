# scripts

Run from anywhere: each script finds the repo root with `git rev-parse --show-toplevel`.

## version

| Script | Platform | Called by | What it does |
| --- | --- | --- | --- |
| `generateVersion.sh` / `.ps1` | any | `tests.yml`, `publish.yml`, `npm run version:generate` | Runs GitVersion 6 (`GITVERSION_BIN`, a dotnet tool on PATH, or Docker), applies `versionRules`, writes `version-<version>.txt` (git-ignored) |
| `versionRules.sh` / `.ps1` | any | sourced by `generateVersion` | The version scheme: main is MAJOR.MINOR.(tag patch + PRs merged since the tag); any other branch is that, `-<commits on the branch>`; a tagged commit is its tag |
| `updateVersion.sh` / `.ps1` | any | `tests.yml`, `publish.yml`, `npm run version:update` | Stamps `version=` from `version-*.txt` (or `--version X.Y.Z` / `VERSION_OVERRIDE`) into `package.json`. **Changes the tree** |
| `resetVersion.sh` / `.ps1` | any | manual, `npm run version:reset` | Puts `package.json` back to the committed `0.1.0` baseline. **Changes the tree** |

Try it locally (needs GitVersion 6: `dotnet tool install --global GitVersion.Tool --version 6.8.2`):

```bash
npm run version:generate && npm run version:update
npm run version:reset    # before committing
```

```powershell
pwsh scripts/version/generateVersion.ps1; pwsh scripts/version/updateVersion.ps1
pwsh scripts/version/resetVersion.ps1    # before committing
```
