# Ledger — spec #265, each change against the last and against the origin

One row per fix ticket, added by its implementer (IMPLEMENTER step 5). The reference machine only (D208). Pele 1.13.0 is the fixed yardstick, so head/Pele stays comparable from row to row.

- **Origin:** `f208fab9b`, the tip of `mermaid-v13` just before the first fix (T0 merged, no render change). It never moves.
- **Step:** head against the ticket's own base, in one interleaved run. **#265 so far** multiplies the steps: the effect of #265's changes alone.
- **Since origin:** head against the origin, in a second interleaved run. This also counts whatever else merged into the base (M3.5). Its gap from "#265 so far" is that drift.
- Each cell reads `14 largest · all common · tiny`. Ratios come from `node v13/docs/agents/runs/265/ratios.mjs packages/bench/dist/reports/latest.json`. Below 1 means faster.

| Step | Head | Base | head / Pele | Step (head / base) | #265 so far | Since origin (head / origin) |
| --- | --- | --- | --- | --- | --- | --- |
| Origin | `f208fab9b` | — | 1.35 · 1.35 · 1.45 | — | 1 | 1 |
| T1 #272 | `9619ae119` (merged `935a4b857`) | `f208fab9b` | 1.25 · 1.26 · 1.45 | 0.926 · 0.933 · 1.002 | 0.926 · 0.933 · 1.002 | same run (base is the origin) |

The spec's own measurement at `eba5c0e6c` (1.45× on the 14 largest) is older than the origin. The base had already reached 1.35× before T1, through other merges.
