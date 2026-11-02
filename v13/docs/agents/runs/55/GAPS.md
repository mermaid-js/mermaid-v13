# Gaps ledger (spec #55)

Unmet criteria and cross-ticket items, listed under the ticket that owns them.

## After #63
- Docs follow-up (maintainer): R-TEST-5 says "curated subset per diagram type"; the e2e run now covers every tier folder (502 flowchart fixtures). Reword R-TEST-5.
- `katex/` fixtures run as flowcharts and only assert "not the error diagram"; v13 has no math plugin yet (R-TEXT-10, M4).
- #58: list explorer folders with `supportedFixtureFolders()` from `e2e/helpers/mmd-snapshots.ts` (see tickets/63.md).

## After #58
- Review pass: `packages/dev/src/explorer.ts` imports `e2e/helpers/mmd-snapshots.ts` by relative path behind an eslint-disable for `mermaid/import-boundaries`. Prefer moving discovery into packages/dev and re-exporting it from the e2e helper.
- `useMaxWidth` selector left out (schema status pending).

## After #62
- Review pass: the Profile tab reads sibling files through `api.ts` directly (against the #58 tab contract). Add `siblings`/`read` to `ViewerContext` in the shell and switch the tab to it.
- Profile timers on `/dev/` are coarse (about 0.1 ms); COOP/COEP would sharpen them but may affect the Compare tab CDN iframes, so they were left off.
