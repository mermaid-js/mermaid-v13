# v12 dev server: feature inventory (from fa796a943)

Read files with `git show fa796a943:<path>`. "fa:" below means that commit.

## Entry and build

- `pnpm dev` runs `tsx .esbuild/server.ts` (fa:package.json:46-48). The helpers are fa:.esbuild/util.ts (esbuild options) and fa:.build/common.ts (package list).
- **Port:** `MERMAID_DEV_PORT` overrides. A checkout named `alana-mermaid` gets 9000; any other gets 9000 + sha1(cwd) % 100 (fa:.esbuild/server.ts:26-41). `dotenv/config` is loaded.
- **Build:** an esbuild `context()` per package (ESM, plus an IIFE build of mermaid), served from `packages/*/dist` (:60-91, :565).
- **Watch:** chokidar watches `**/src/**/*.{js,ts,langium,yaml,json}` with a 100 ms debounce, rebuilds everything, then sends an SSE broadcast at `GET /events` (:118-155, :314-330, :365). It also watches explorer assets (:337-348) and `*.mmd` files under the explorer root (:351-362).
- **Explorer root:** `MERMAID_DEV_EXPLORER_ROOT`, default `e2e` (:169).
- **Reload client:** `demos/dev/reload.js` is an SSE client that reloads the page when it sees a newer timestamp, and reconnects after 1 s.

## Dev Explorer at /dev/ (fa:.esbuild/dev-explorer/)

Built with Lit and Shoelace (dark theme); Shoelace is vendored at `/dev/vendor/shoelace` (server :373).

- `file-explorer.ts`: a `.mmd` browser with "new diagram". URL state is `?path=<dir>&file=<file>`, with popstate (explorer-app.ts:21-35, 91).
- `diagram-viewer.ts`:
  - **Header:** back, prev/next sibling with an n/N counter and the ←/→ keys (:1266-1300, :562-588).
  - **Selectors:** theme, layout, look, log level, `useMaxWidth`, and two `flowchart.*` flags (:1308-1396). They come from URL params and are saved to localStorage under `devExplorer.viewer.*` (:450-494).
  - **Status:** an error banner (:1402) and a "rendering…" indicator (:1399).
  - **Tabs:**
    - **Diagram:** an `sl-split-panel` with the SVG on the left and the console panel on the right. The split position is saved (default 75), and `bindFunctions` is applied (:1433-1452).
    - **Code:** CodeMirror 6 with `codemirror-lang-mermaid` (code-editor.ts). It shows a dirty/saved status, saves with Mod-s through `PUT /dev/api/file`, and warns when the file changed on disk while there are unsaved edits (:599-601).
    - **Profile:** per-layout benchmark for one diagram or a folder, N iterations, trimmed-mean phases, a score table and copy-as-JSON (:130-250, :995-1210).
    - **Compare:** two iframes (public/compare-pane.html, postMessage) render with two mermaid versions loaded from the jsDelivr CDN. It has a pixelmatch diff overlay toggled by a key (compare-diff.ts) and URL state `tab/left/right/diff` (compare-versions.ts:230-250).
- `console-panel.ts`: captures `console.*` and strips `%c` (:82-110). It has info/warn/error toggles, a text filter and clear.
- **API:**
  - `GET /dev/api/files?path` lists a directory.
  - `GET`/`POST`/`PUT /dev/api/file?path` reads and writes a file. It accepts `.mmd` only, guards against path traversal (:250-267), and `POST` refuses to overwrite.
  - `GET /dev/api/versions` proxies the npm registry with a 1 h TTL (:215-248, :541-548).
  - The sizes API (`POST /dev/api/sizes`) is dropped for v13.

## Dropped for v13 (spec #55)

look, logLevel, the `flowchart.*` flags, "Save sizes", demos/, e2e/platform/*.html, libavoid.wasm, ELK/ZenUML/tidy-tree/example-diagram registration, the IIFE build and the coverage mode.

## v13 starting point

- `packages/visual/src/server.ts`: a node:http front over esbuild's serve; bundles `src/browser/viewer.ts` from source; routes `/`, `POST /node-render`, `/fonts/*` and `/smoke.mjs`; Host fix from #52. `src/cli/serve.ts` uses `MERMAID_PORT`.
- `playwright.config.ts`: uses v12's port hashing, and its webServer runs `pnpm --filter @mermaid-js/visual serve`. `e2e/dom/playwright.config.ts` is separate.
- `e2e/helpers/mmd-snapshots.ts` and `e2e/rendering/mmd-snapshots.spec.ts` handle fixture discovery; v13 defaults to the `baseline` tier.
