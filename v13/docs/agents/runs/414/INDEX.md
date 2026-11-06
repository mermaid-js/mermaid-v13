# Theme T0 (#414) run notes

Integration branch `feature/414_theme-t0`, cut from `mermaid-v13` at `dd4b9d19f`. Draft PR into `mermaid-v13` after the first merge. Machine: AI-Max (the coordinator runs on Office-max).

| Ticket | Issue | Branch | State |
| --- | --- | --- | --- |
| T0a traits, `DiagramThemeTable`, direction check | #438 | on the integration branch | done |
| T0b per-package `gen:theme`, checks over every table | #439 | | |
| T1 pie, quadrant, journey, timeline, gitGraph, gantt, mindmap | #440 | | waits for #398, #404, #406 for wave 2's rows |
| T2 sequence, class | #441 | | |
| T3 state, ER | #442 | | |
| T4 flowchart | #443 | | |
| T5 docs, closure scan, final core size | #444 | | |

Frontier: T0a → T0b → T1–T4 (at most two at a time) → T5. Wave 2 (#398 gantt, #404 gitGraph, #406 mindmap) merges into `mermaid-v13` in that order; merge `mermaid-v13` here after each and migrate its rows (D330). The PR is marked ready only after all three are merged and migrated.

Files: `CONTRACT.md` (the T0a API the ports use), `IMPLEMENTER.md` (ticket brief), `GAPS.md`, `tickets/<n>.md`.

## Core size (gzip bytes)

| Point | Bench measure (`core-size.spec.ts`) | Note |
| --- | ---: | --- |
| Base `dd4b9d19f` | 92,181 | |
| T0a | 92,622 | +441; themed stub +32 (≤ 64), in-core control +443 |
