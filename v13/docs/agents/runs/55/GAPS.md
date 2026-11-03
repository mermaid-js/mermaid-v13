# Gaps ledger (spec #55)

Unmet criteria and cross-ticket items, listed under the ticket that owns them.

## After #63
- Docs follow-up (maintainer): R-TEST-5 says "curated subset per diagram type"; the e2e run now covers every tier folder (502 flowchart fixtures). Reword R-TEST-5.
- `katex/` fixtures run as flowcharts and only assert "not the error diagram"; v13 has no math plugin yet (R-TEXT-10, M4).
- ~~#58: list explorer folders with `supportedFixtureFolders()`~~ Closed: the explorer lists them (now from `packages/dev/src/fixture-discovery.ts`).

## After #58
- ~~Review pass: explorer.ts imports the e2e helper behind an eslint-disable.~~ Closed in review: discovery lives in `packages/dev/src/fixture-discovery.ts`, the e2e helper re-exports it (tickets/review.md).
- `useMaxWidth` selector left out (schema status pending).

## After #62
- ~~Review pass: the Profile tab reads sibling files through `api.ts`.~~ Closed in review: `ctx.siblings()` / `ctx.read(path)`; a spec checks no tab imports `api.ts`.
- Profile timers on `/dev/` are coarse (about 0.1 ms); COOP/COEP would sharpen them but may affect the Compare tab CDN iframes, so they were left off.

## After #60
- ~~Review pass: the e2e/dev specs use `dev-tab-diagram svg`.~~ Closed in review: `dev-tab-diagram .canvas > svg`; the Messages panel has v12's checkboxes, clearable filter and icon buttons.
- Warnings show no line:column, because v13 `Warning` has no position (diagnostics do).

## After #61
- Maintainer to confirm: on the npm side of Compare, v13 `layered` is sent as v12 `dagre`, and `auto` becomes `dark`/`default` from the colour scheme.
- If COOP/COEP are adopted for Profile timers, the Compare CDN import needs CORP or `credentialless`. The panes are now sandboxed (opaque origin); `/build/compare-pane.js`, `/mermaid.esm.mjs` and `/fonts/` send `access-control-allow-origin: *` for them.

## After review
- `pnpm dev` restarts the server only for `packages/dev/src` changes outside `browser/`. Node-side code from other packages (`/node-render` uses core and the diagram packages in-process) still stays stale until a restart.
- Old dev builds: the page drops its `createMermaid()` instances past the previous build, but the browser's module map keeps every imported `/mermaid.esm.mjs?build=<n>` module record (no API evicts them); a page reload clears them.
