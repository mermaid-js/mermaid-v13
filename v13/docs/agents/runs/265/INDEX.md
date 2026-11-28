# Run notes — spec #265 (render speed: exact fixes and bench reporting)

- IMPLEMENTER.md — the brief every implementer follows.
- KICKOFF.md — the prompt that starts a session on the reference machine.
- tickets/<N>.md — handoff per ticket, written by its implementer.
- LEDGER.md — every fix against the last one and against the fixed origin `f208fab9b`; `ratios.mjs` computes its ratios.

Decisions: D200–D209 (v13/docs/DECISIONS.md, last section). Follow-up spec: #281.

Tickets (sub-issues of #265, native blocked-by links):

| # | Ticket | Lands in | Blocked by |
| --- | --- | --- | --- |
| #271 | T0 identity gate in the bench | own draft PR into `mermaid-v13` | — |
| #272 | T1 remove the LRU reorder in the canvas measurer | own draft PR into `mermaid-v13` | #271 |
| #273 | T2 lean canvas measurer | `feature/265_render-speed` | #272 |
| #278 | T7 layout wrapper | `feature/265_render-speed` | #271, #273 (queue, D208) |
| #274 | T3 cheaper label wrapping | `feature/265_render-speed` | #271, #273, M3.5 (#213, #215, #218) |
| #275 | T4 SVG writer fast paths | `feature/265_render-speed` | #271, M3.5 |
| #276 | T5 per-render fixed costs | `feature/265_render-speed` | #271, M3.5 |
| #277 | T6 parser trivia and shape-data fast path | `feature/265_render-speed` | #271, M3.5 |
| #279 | T8 bench reporting | `feature/265_render-speed` | M3.5 |
| #280 | T9 close-out | `feature/265_render-speed` | #272–#279 |

One ticket at a time on the reference machine (D208). Start order: T0, T1, T2, T7. The others wait for the M3.5 integration PRs to merge (D209).

## Measured before the spec (reference machine, `eba5c0e6c`, 2026-11-05)

| | v13 against the reference implementation |
| --- | --- |
| Warm geomean, 161 fixtures | 1.45× slower |
| 14 largest, full sample | 1.45× |
| 14 largest with T1 only | 1.23× |
| 14 largest with T1 and T2 | 1.15× |
| 116 tiny, full sample | 1.44× (1.36× with T1 and T2) |
| perf/huge1 render, fresh page → after the corpus | 2.76× → 5.13× (2.25× → 2.39× with T1) |

The 14 largest are every `perf/` fixture plus `pele/flowchart-500`. The 116 tiny are the fixtures the reference implementation renders in under 0.5 ms.

## Finish rule

The integration PR stays a draft while tickets land. Run `gh pr ready` on it only when all hold:

1. Every ticket is merged into `feature/265_render-speed` (T0 and T1 into `mermaid-v13`).
2. The close-out bench (T9) has run on the reference machine and its numbers are in the PR description.
3. The 14 largest are at 1.15× of the reference implementation or better, and render time is independent of page history.
4. `pnpm check` is green on the integration branch.

Never merge it.
