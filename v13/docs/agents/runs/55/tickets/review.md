# Review fixes handoff (spec #55)

Branch `feature/55_review-fixes`. New dev dependency: `globby` in packages/dev (already in the root).

## Server (node specs at the HTTP seam: `explorer.spec.ts`, `supervise.spec.ts`)

- Writes (`POST`/`PUT /dev/api/file`) need `X-Mermaid-Dev: 1` (sent by `browser/explorer/api.ts`) and an `Origin` whose host equals `Host`, or none (curl). Otherwise 403. `OPTIONS /dev/api/*` is a 403 and no CORS header is ever sent there, so a cross-site page can't pass the preflight. A page on another host (the tailnet) still writes, because the check is same-origin, not localhost.
- `readBody(req, res, limit = MAX_BODY_BYTES)` in `routes.ts` streams the body. Past 1 MiB (bytes) it answers 413 (`connection: close`), discards the rest without keeping it, and resolves `undefined`, so the caller just returns. `/node-render` uses it too.
- `resolveWithin` rejects only `..` and `../…`, so `..notes.mmd` is a valid name.
- `ServerOptions.cors`: GET pathnames (exact, or a prefix ending in `/`) that get `access-control-allow-origin: *`. The explorer passes `COMPARE_PANE_FILES` (`/build/compare-pane.js`, `/mermaid.esm.mjs`, `/fonts/`).
- `pnpm dev` (`cli/dev.ts`) is a supervisor: `superviseServer` runs `cli/dev-server.ts` (the old dev.ts) in a child process (same tsx execArgv, IPC channel; the child exits if the parent goes). A change under `packages/dev/src` outside `browser/` and the specs (`restartsServer(path)`) restarts it and prints `[dev] server code changed (…); restarting the server`. Everything else stays a live rebuild. `pnpm --filter @mermaid-js/dev serve` (Playwright) is not supervised.
- Fixture discovery moved to `packages/dev/src/fixture-discovery.ts` (`FIXTURE_FOLDER_TYPES`, `supportedFixtureFolders`, `discoverMmdFixtures`, `collectMmdFixtures`, `supportedTypesOf`). `supportedTypes` is a required option there. Under Playwright, bare workspace imports resolve to `dist/`, which isn't built, so packages/dev can't import `mermaid` for this. `e2e/helpers/mmd-snapshots.ts` re-exports the module and binds `SUPPORTED_TYPES` (from the registry source); the explorer passes `supportedTypesOf(t => supportsFormat(t, 'svg'))`. A helper spec checks the two agree. The eslint-disable is gone.

## Page

- Compare panes are `sandbox="allow-scripts"` (opaque origin). Both ends `postMessage(…, '*')` and match by `event.source` identity. `compare-tab.spec.ts` checks that the pane's origin is `null` and that its GET and PUT to the file API are both blocked.
- `render.ts` `createBuildCache(load, keep = 2)`: `loadMermaid` keeps only the two most recently used builds (`render.spec.ts`).
- `ViewerContext.siblings()` (the folder's `.mmd` paths, listed now) and `read(path)`. Profile uses them. `tabs/context.spec.ts` fails if any tab imports `../api.ts`.
- The specs locate the diagram as `dev-tab-diagram .canvas > svg`. The Messages panel has v12's `sl-checkbox` toggles, a `clearable` filter, and the clipboard/trash icon buttons.

## Scripts and CI (maintainer decision)

- `pnpm e2e` = `playwright test --project chromium --project dev`. `e2e:dev` and the `dev-server` CI job are removed. The Visual baseline job's `pnpm e2e` step runs the dev specs once. The Compare offline-skip annotation is unchanged.

## Unmet / follow-ups

- See GAPS.md "After review": Node-side code in other packages is still stale until a restart; the browser keeps old build module records until a reload.
