# a11y-crosscheck

Accessibility scans with three independent engines, wired to a real app rather than a
static page: it waits for a single-page app to actually render, signs in, runs every theme
at desktop and phone widths, and clicks its way into the dialogs a first-paint scan never sees.

| Engine | What it is | Why it's here |
| --- | --- | --- |
| [axe-core](https://github.com/dequelabs/axe-core) | Deque's rule engine, injected into the live page | The broadest, most trusted rule set, and the one that runs the full matrix |
| [pa11y](https://github.com/pa11y/pa11y) | Wraps HTML_CodeSniffer, a **different** engine | Catches things axe deliberately skips |
| [Lighthouse](https://github.com/googlechrome/lighthouse) | Google's audit, accessibility category only | The score people actually quote |

axe-core and Lighthouse share the axe engine, so Lighthouse findings are normally a *subset* of
axe's: it runs a curated rule list and weights it into a 0-100 score. pa11y is an independent
implementation, so it can disagree with both in either direction. Running all three is the
point: a clean result from one is not a clean result overall.

## See it work first

```sh
npm install
npm run demo          # starts a small demo SPA, scans it signed in: clean, exit 0
npm run demo:broken   # the same app with deliberate failures: a dirty report, exit 1
```

Then open `reports/a11y/summary-*.html`. The demo lives in [examples/demo](examples/demo) and
its wiring in [examples/demo/a11y.config.mjs](examples/demo/a11y.config.mjs) — read the two
together. The broken run is worth a look: the faint text fails in the light theme only, the
dialog has three failures that do not exist on first paint, the image without `alt` sits on a
page only a signed-in scan reaches, and axe and pa11y disagree about an input labelled only by
its placeholder.

## Add it to your project

**1. Install it** in one of two ways. Either way your project doesn't depend on it, and your
project's side is the same: an `a11y.config.mjs` and a `reports/` folder. Node 22.18 or newer.

| | Install | Run | Pick it when |
| --- | --- | --- | --- |
| **Global** (recommended) | `npm install -g a11y-crosscheck` plus the engines you want, below | `a11y-crosscheck` from any project folder | You scan regularly: one install, and one browser, for every project |
| **Vendored** | `npm pack a11y-crosscheck`, unpack the tarball into your repo (say `scripts/a11y-crosscheck/`), then add the engines you want to your devDependencies | `node scripts/a11y-crosscheck/bin/a11y-crosscheck.mjs` | You want to pin or patch the scanner, or not install anything globally |

**The engines are your choice.** Installing the tool installs none of them (and no browser): each
is an optional peer dependency, installed beside it, and a scan runs the ones that are there.

| Engine | Install | What it adds |
| --- | --- | --- |
| axe-core | `npm install -g axe-core` | The broadest rule set, and the only engine that runs the full theme and viewport matrix |
| pa11y | `npm install -g pa11y` | A second, independent rule engine. It depends on puppeteer, which downloads its own browser at install: set `PUPPETEER_SKIP_DOWNLOAD=true` for that install, because the tool brings its own |
| Lighthouse | `npm install -g lighthouse` | The 0-100 accessibility score |

```sh
PUPPETEER_SKIP_DOWNLOAD=true npm install -g a11y-crosscheck axe-core pa11y lighthouse   # all three
npm install -g a11y-crosscheck axe-core                                                  # just axe
```

In a project, use `npm install -D` with the same names. With no `--only`, a scan runs every
engine it can find; asking for one that is missing, or having none, stops with the command to
install it. Running all three is the point of the tool, so that is what the first line does.

To install straight from git instead of the registry:
`npm install -g git+https://github.com/funktechno/a11y-crosscheck.git` (it builds on install).

The command always works on the folder it is run from: it reads `./a11y.config.mjs` and writes
to `./reports/a11y`. The Chromium it needs is kept with the tool, not in your project. With a
vendored copy, add `scripts/a11y-crosscheck/.cache/` to your `.gitignore`.

The package is TypeScript and ships its types. A config can `import { defineConfig } from
"a11y-crosscheck"` even with a global install, and a script can `import { loadPlan, scan }` from
it; see [Typed config](docs/wiring.md#typed-config).

**2. Write `a11y.config.mjs`** (or `.mts`) at your project root. Start from whichever example is closest:

| Example | Shape of app |
| --- | --- |
| [static-site.config.mjs](examples/configs/static-site.config.mjs) | Server-rendered or static: pages only |
| [spa-cookie-session.config.mjs](examples/configs/spa-cookie-session.config.mjs) | SPA under `/app/`, session in cookies, three themes, nested dialogs, acknowledged findings, a custom flag |
| [localstorage-token.config.mjs](examples/configs/localstorage-token.config.mjs) | Token in localStorage plus a bearer header, `prefers-color-scheme`, an explicit ready signal, custom viewports and rule sets |

[docs/wiring.md](docs/wiring.md) walks through every field: what "rendered" means for your
app, how it signs in, how a theme is chosen, which dialogs to open.

**3. Add scripts and ignore the output.** The scripts are optional shortcuts for the global
install; with a vendored copy, replace `a11y-crosscheck` with the `node ...` command above.

```jsonc
// package.json
"scripts": {
  "a11y": "a11y-crosscheck",
  "a11y:axe": "a11y-crosscheck --only=axe",
  "a11y:served": "a11y-crosscheck --url=http://127.0.0.1:5000"
}
```

```gitignore
# a11y-crosscheck reports
reports/
```

**4. Run it** against a running app:

```sh
npm run dev                              # in another terminal
npm run a11y -- --login=user:pass        # or set A11Y_USER / A11Y_PASS
```

## Commands

```sh
a11y-crosscheck                                   # every installed engine, every page in the config
a11y-crosscheck --only=axe --login=user:pass      # the gate, signed in
a11y-crosscheck --pages=/app/,/app/about          # narrow to some routes
a11y-crosscheck --themes=dark --viewports=phone --states=off   # while fixing one thing
a11y-crosscheck --url=https://staging.example.com # same config, different target
a11y-crosscheck --install-browser                 # fetch Chromium and stop
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--config` | `./a11y.config.mjs` (or `.mts`, `.ts`, `.js`) | Optional. Without one, the pages are scanned as they are. |
| `--url` | config `baseUrl` | Full base URL. Overrides `--port`. |
| `--port` | — | Shorthand for `http://localhost:<port>`. |
| `--only` | every installed engine | Comma-separated: `axe`, `pa11y`, `lighthouse`. An engine that is not installed is an error naming what to install. |
| `--pages` | config `pages` | Comma-separated paths, each appended to the base URL. |
| `--themes` | config `themes.values` | axe only. |
| `--viewports` | `desktop,phone` | Names from the config's `viewports`. axe only. |
| `--states` | on | `--states=off` skips the interactive states. |
| `--login` | — | `user:pass`, handed to the config's `auth.signIn`. Also `A11Y_USER` / `A11Y_PASS`. |
| `--out` | `reports/a11y` | Where reports are written. |

Any other `--flag=value` is passed to your config as `args.flag`, so a project can add its own,
e.g. `--doc=` to point a viewer route at a document that exists on the install being scanned.

The scan **exits 1** if any engine reports a violation, or if an interactive state could not be
opened, so it can gate a commit or a deploy. It exits 2 if it could not run at all.

> **Git Bash caveat.** MSYS rewrites arguments that look like paths, so `--pages=/app/` arrives as
> `--pages=C:/Program Files/Git/app/`. Use PowerShell or another shell, or prefix the command
> with `MSYS2_ARG_CONV_EXCL='*'`.

## What a run covers

- **axe** runs the full matrix: every page × every theme × every viewport, plus each
  interactive state once (in the default theme and viewport). Three themes, two viewports and
  nine routes is 54 runs before the dialogs.
- **pa11y** and **Lighthouse** run once per page, in the default theme. Both get the same
  session as axe, so they see signed-in pages too. pa11y gets the same wait for the app to
  render; Lighthouse uses its own wait for the network to go quiet, and its own mobile
  emulation.

Rules: axe runs WCAG 2.0, 2.1 and **2.2** A/AA plus best-practice (2.2 brings `target-size`,
which matters on phones), and also `label-content-name-mismatch` (2.5.3 Label in Name), which
axe tags experimental and skips by default. pa11y runs `WCAG2AA`. Both are configurable.

## Where reports go

Grouped by engine, named for the site and a UTC timestamp:

```
reports/a11y/
├── axe/localhost_5173-20260826T181255Z.{json,html}
├── pa11y/localhost_5173-20260826T181429Z.{json,html}
├── lighthouse/localhost_5173-20260826T181429Z.{json,html}
└── summary-localhost_5173-20260826T181429Z.{json,html}
```

JSON for tooling and diffing, HTML for reading. Start with the `summary-*` pair, the
cross-engine comparison, then open a per-engine report for detail.
[docs/reading-results.md](docs/reading-results.md) covers what the results do and do not mean.

## The browser

pa11y and Lighthouse drive Chromium through puppeteer, and **puppeteer cannot launch Edge on
Windows**: `msedge.exe` forks and exits, so puppeteer's process handle dies and it reports
`Failed to launch the browser process` with no further detail. A real Chromium is required.

**Installing the tool downloads no browser.** The scanner looks for one when it runs, in this
order:

1. `CHROME_PATH`
2. the tool's own `.cache/puppeteer` (set `A11Y_BROWSER_CACHE` to use a different folder)
3. puppeteer's default cache, `~/.cache/puppeteer` (or `PUPPETEER_CACHE_DIR`), where a project's
   own puppeteer install may already have put one
4. a system Chrome or Chromium

It never uses Edge. If it finds none, it downloads Chromium (about 150 MB) into the tool's cache
on the first scan, and says so. To fetch it ahead of time instead, run
`a11y-crosscheck --install-browser`; to never download, set `CHROME_PATH` or install Chrome.

**In a project that installs the package as a dev dependency**, puppeteer (a dependency of
pa11y) may still download its own browser during `npm install`, because npm flattens the
dependencies and puppeteer cannot see this package's [.puppeteerrc.cjs](.puppeteerrc.cjs). To
skip it, set `PUPPETEER_SKIP_DOWNLOAD=true` for the install, or `puppeteer_skip_download=true` in
the project's `.npmrc`; the tool then uses whichever browser the list above finds. A global
install is not affected: it downloads nothing at install time.

## What no scanner covers

A clean scan says nothing about keyboard behaviour, whether focus can be seen, or what a screen
reader announces. [docs/reading-results.md](docs/reading-results.md#what-a-scan-cannot-tell-you)
says what to put alongside it.

## License

[MIT](LICENSE)
