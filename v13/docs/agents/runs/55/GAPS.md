# Gaps ledger (spec #55)

Unmet criteria and cross-ticket items, listed under the ticket that owns them.

## After #63
- Docs follow-up (maintainer): R-TEST-5 says "curated subset per diagram type"; the e2e run now covers every tier folder (502 flowchart fixtures). Reword R-TEST-5.
- `katex/` fixtures run as flowcharts and only assert "not the error diagram"; v13 has no math plugin yet (R-TEXT-10, M4).
- #58: list explorer folders with `supportedFixtureFolders()` from `e2e/helpers/mmd-snapshots.ts` (see tickets/63.md).
