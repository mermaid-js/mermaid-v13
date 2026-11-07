# Final whole-branch review (spec #293)

- Review over `mermaid-v13...feature/293_gantt` focused on how the tickets fit together; findings and their fixes in `GAPS.md` "Final whole-branch review". Fixed on `feature/379_gantt-schedule` (605ce32f2), merged ff.
- Maintainer decisions after the review: D542 (`maxLayoutWork`, `MAX_STEPS`), and "only real diagrams" for the corpus (hand-written TS source lists replaced by `.mmd` fixtures and `gantt-cases.json`; `feature/293_gantt-corpus-fixtures`, merged ff).
- Final checks on b21ed2809: `pnpm check` green (pre-push); hosted CI green; `pnpm e2e` in `mcr.microsoft.com/playwright:v1.62.1-noble`: 1,862 passed, 4 failed, all dev-tool specs on flowchart text (a browser crash, a disk-watch event in the container, the network mermaid@12 fetch, an empty render after the crash); the three spec files rerun alone: 19 passed.
- Core (INDEX method): bench 92,386 B, CDN 92,859 B, limit 94,208 B. Gantt since #410: bench +184, CDN +311 (wave-2 share ~465 B).
