# Colleague handover — 2026-11-11

Start with the current checkpoint at the top of [START.md](START.md), then the
[round-1 ledger](runs/1/LEDGER.md) and [remaining hypotheses](runs/1/HYPOTHESES.md).
The older round-0 launch instructions below the checkpoint are historical.

## Git entry points

- Complete preparation, harness and reports: [docs/perf-loop-handoff](https://github.com/mermaid-js/mermaid-v13/tree/docs/perf-loop-handoff).
- Reviewed report PR: [#658](https://github.com/mermaid-js/mermaid-v13/pull/658), on
  `docs/perf-round-1-batch-1-20261110`. The PR targets the preparation/base branch.
- Frozen experiment base: **`094ec5283059b7a87c2c2745ea6dffcc5a4dcee7`**. Use the full SHA,
  not a moving branch tip, for comparisons.
- Each rejected implementation remains pushed on its own `perf/round-1-<id>-<date>` branch;
  exact branch names and SHAs are in `runs/1/hypotheses.jsonl`.

The original checkout's previously uncommitted preparation and accumulated reports were
committed at Knut's request without changing their bytes. This advances that checkout's HEAD
and index; earlier preservation records describe their state at measurement time. Samples,
policy, source contents and measurement artifacts remain unchanged. Rejected candidates have
not been merged into this handover branch or the report branch.

## Completed and remaining work

Round 0 and five batches within round 1 are complete: twelve optimization hypotheses were
measured and rejected, and the separate 4c conversion diagnostic is complete. No accepted
optimization or combination exists. The latest 2a result is 2.459% observed Node gain and
2.852% lower sampled renderer allocation, below the unchanged 7.40237% gain threshold.
All 5,000 SVGs match. Its lazy-metadata tradeoff and unapproved requirement proposal are recorded
in [batch 5](runs/1/batch-5/REPORT.md) and its [review](runs/1/batch-5/REVIEW.md).

Only **1b, 1d and 1e** remain untested. 1b needs the stated security requirement amendment
before delivery. 1d/1e change output and need the exact-pixel and browser/e2e gates. Browser
validation and e2e are still pending/unverified. 3a is withdrawn: cache reset is harness-only;
production caching stays intact. No next experiment is running or already authorized by this
handover. Select the next hypothesis with Knut and follow [LOOP.md](LOOP.md).

## Local evidence needed to reproduce or continue

The execution machine is MAI-Max. The original checkout is
`/Users/knsv/repos/mermaid-v13-perf`; sibling worktrees contain individual candidates.
The frozen sample is `.tmp/perf-prep/validated-node24-v1/sample.jsonl`; its fixed 500-index
browser subset and pins are documented in [SAMPLE.md](SAMPLE.md). Round-0 evidence is in
`.tmp/perf-round-0-p27`; round-1 evidence is in `.tmp/perf-round1-batch*-20261110` and
`.tmp/perf-round1-batch*-20261111`. Candidate worktrees also hold acceptance reports and
private counter data under their own `.tmp` directories. Headers reference exact absolute paths.

These Git-ignored directories contain raw diagrams, SVGs, timings, profiles and batch-specific
report adapters. They are intentionally not pushed. A Git clone contains the harness and
aggregate reports but is not enough to reproduce the existing runs: arrange access to the
preserved checkout and sibling worktrees on MAI-Max, or transfer the complete referenced
private evidence separately. Do not redraw the sample or recreate missing evidence as if it
were the original run.

Use Node **24.16.0**, pnpm **10.30.3**, and unset `NODE_OPTIONS`. Preserve P27's existing
1,536 ms background CPU limit and all measurement/fit rules. Fresh acceptance must be Node,
source-stable and ready before freezing a new candidate. During a formal serial run, pause
all dispatched agents/builds/tests/browser work and only wait on the existing process handle.
All runs are currently stopped; Docker and unrelated work may resume.
