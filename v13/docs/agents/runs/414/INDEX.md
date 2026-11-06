# Theme T0 (#414) run notes

Integration branch `feature/414_theme-t0`, cut from `mermaid-v13` at `dd4b9d19f`. Draft PR into `mermaid-v13` after the first merge. Machine: AI-Max (the coordinator runs on Office-max).

| Ticket | Issue | Branch | State |
| --- | --- | --- | --- |
| T0a traits, `DiagramThemeTable`, direction check | #438 | on the integration branch | done |
| T0b per-package `gen:theme`, checks over every table | #439 | `feature/439_theme-t0b` | done |
| T1a pie, quadrant, journey, timeline | #440 | `feature/440_theme-t1` | done |
| T1b gitGraph, gantt, mindmap | #440 | | waits for #398, #404, #406 for wave 2's rows |
| T2 sequence, class | #441 | | |
| T3 state, ER | #442 | `feature/442_theme-t3` | done |
| T4 flowchart | #443 | | |
| T5 docs, closure scan, final core size | #444 | | |

Frontier: T0a → T0b → T1–T4 (at most two at a time) → T5. Wave 2 (#398 gantt, #404 gitGraph, #406 mindmap) merges into `mermaid-v13` in that order; merge `mermaid-v13` here after each and migrate its rows (D330). The PR is marked ready only after all three are merged and migrated.

Files: `CONTRACT.md` (the T0a API the ports use), `IMPLEMENTER.md` (ticket brief), `GAPS.md`, `tickets/<n>.md`.

## Core size (gzip bytes)

| Point | Bench measure (`core-size.spec.ts`) | Note |
| --- | ---: | --- |
| Base `dd4b9d19f` | 92,181 | |
| T0a | 92,622 | +441; themed stub +32 (≤ 64), in-core control +443 |
| T0b | 92,619 | ±0 against its base re-measured (92,619); CDN 92,962 both |
| T2 | 92,359 | −260 against T0b (all 26 rows, with `inline()` and `inline(v, b)`); CDN 92,959 → 92,711 |
| T1a | 91,402 | −866 against `13efc0b61` re-measured (92,268); CDN 92,623 → 91,759 |
| T1a + T2 | 91,490 | T1a's 91,402 plus T2's last step (+88, `inline(v, b)` and two inputs); CDN 91,837 |
| T3 | 91,330 | −160 against T1a + T2 re-measured (91,490; 8 rows, 4 inputs); CDN 91,839 → 91,682 |
| T3 + wave 2 | 92,643 | −139 against the integration branch at `b2a76631e` (wave 2 in, 92,782); CDN 93,235 → 93,115 |
