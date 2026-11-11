# Fourth-batch review

Independent review verified all six optimization receipts, 1,059 quiet observations,
47,833 unique input/output/nested-evidence hashes, acceptance/artifact pins, and all 5,000
timing, SVG and public-surface records for each candidate. The 4c review independently
validated both final diagnostic-queue receipts, all 5,000 × 7 raw repetitions, fixed buckets,
clock controls, scope, limitations and recomputed aggregates. No open finding remains.

2c and 2d pass their named mechanism conditions, fresh Node acceptance, security, size and
output checks. Their observed Node gains of 1.875% and 1.926% remain below the unchanged
7.40237% threshold, so both are unfit. All bucket regressions remain within 1%; the largest
2d bucket is 0.770% slower. Both candidates produce byte-identical SVGs for all 5,000 records.
The round-0 A/A directional imbalance remains disclosed; no correction or exception was applied.

2c reduces actual full shape-data YAML calls from 3,858 to 646. The round-0 count of 17,172
measures lexer pieces, not reader calls; independent review verified that distinction.
2d reduces front-matter reader calls from 1,934 to 306 and summed per-record median reader
time from 12.039054 to 3.523836 ms (70.730%). That instrumented attribution is separate from
acceptance rendering time. Production caching remains intact; benchmark resets stay outside
timed renders. Source review and the adapter's preprocessing-equality guard are recorded in
[BATCH-4.md](../BATCH-4.md).

4c attributes 29.002743 ms across summed per-record conversion medians, or 0.774622% of
instrumented end-to-end render time. The large bucket contains only 27 records and accounts
for 1.143458 ms, or 0.639945%. Its median per-record conversion is 35.459 µs; seven replicate
bucket totals span 1.123958–1.223579 ms. This spread is not a confidence interval. Each
sampled diagram executes one conversion pass, so repeated fitting-pass coverage follows
instrumentation placement rather than a sampled repeated-pass example. Instrumentation
changes runtime behavior; clock controls are reported without subtraction. These costs do
not establish an achievable speedup or approve a LayoutEngine interface change.

All three worktrees passed fresh Node acceptance with `validationProfile: "node"`,
`sourceStable: true`, and `ready: true`, using Node 24.16.0, pnpm 10.30.3 and unset
`NODE_OPTIONS`. The first 2c acceptance failed because the worktree-local sample path was
missing; it remains preserved. Linking the original unchanged preparation directory resolved
that setup issue, and a new acceptance report passed. No sample was redrawn.

Four invalid attempts are preserved and excluded: three CPU-limit violations and one 4c
output-directory setup failure before diagnostic timing. The latter exposed a cross-worktree
private-path check. A fresh queue inside the diagnostic worktree completed both jobs using
the same source, artifacts and passing acceptance. The old successful gates receipt remains
preserved separately; only the fresh queue supplies the final 4c report. Eight accepted jobs
supply this batch. No failed prerequisite was bypassed or relabelled.

Publication first compared the collector's policy-file hash to the evaluator's parsed-policy
hash. A separate report-only adapter now validates the file hash against the file while
retaining deep policy equality and scheduler pin checks. The frozen adapters, queues and raw
evidence remain unchanged, and the failed publication log is retained. Independent review
approved this representation correction.

P27 limits stayed fixed at 1,536 ms total CPU per interval. Docker's VM/backend was absent
before the measurement window; existing background services remained. The observed app-server
process serves this session's command tools, so prior attribution of its activity to unrelated
Codex work was not established. The exact batch-1 Pelé reference is reused with its original
environment; it is not a direct candidate-versus-Pelé measurement.

Final publication reproduces byte-for-byte. All 16 prior publication files and the prior
283,822-byte ledger prefix are unchanged. The original checkout index, frozen sample and
browser subset remain intact. Public evidence contains aggregates and references; per-record
sources, SVGs and timings remain private.

No optimization is integrated; no combination measurement is required for this rejected batch.
Eleven optimization hypotheses and one separate diagnostic are now measured. 1b, 1d, 1e and
2a remain untested; 3a is withdrawn. Four batches within round 1 are not four completed empty
rounds under P2. Browser validation and e2e remain pending/unverified. The measurement window
is closed, and no next batch is underway.

Reviewers: `/root/review_batch4` and `/root/review_hop4`, GPT-6 Astra, high effort.
Source, adapter, repair and final audit records remain in `.tmp/perf-round1-batch4-20261111`.
