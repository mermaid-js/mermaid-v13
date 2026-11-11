# Round 1, fourth batch

Knut authorized 2c and diagnostic-only 4c, with 2d conditional on baseline feature counts.
The frozen baseline contains front matter in 1,934 of 5,000 diagrams (38.68%), so 2d is
included. Shape data occurs 17,172 times across 512 diagrams. These are recorded round-0
counts, not newly sampled inputs.

All three worktrees start from `094ec5283059b7a87c2c2745ea6dffcc5a4dcee7`.
Previous rejected implementations remain separate. No sample, policy or threshold changes.

| Hypothesis | Work | Agent | Model | Effort |
| --- | --- | --- | --- | --- |
| 2c | Conservative flat shape-data reader with full YAML fallback | /root/round1_2c | GPT-6 Astra | high |
| 2d | Conservative front-matter fast path with full YAML fallback | /root/round1_2d | GPT-6 Astra | high |
| 4c | Measure CNode to LayoutModel conversion, especially the large bucket | /root/round1_4c | GPT-6 Astra | high |

2c counts actual full YAML calls attributable to shape data. 2d counts actual full YAML
calls attributable to front matter and separately measures time inside that reader in its
formal diagnostic pass. All attempts, hits, fallbacks, counter scope and timing overhead
remain disclosed. Unsupported syntax falls back without changing parse results, diagnostics
or public behavior. Production analysis caching remains intact.

4c makes no renderer optimization or interface change. Its instrumented conversion timings
are diagnostic evidence, with full-sample coverage, the fixed size buckets, seven replicates,
clock controls and uncertainty. No fit verdict or automatic redesign follows from them.

Status: source/tool review, normal push checks and fresh Node acceptance passed for all three
worktrees. Both optimization queues are complete: 2c measured a 1.875% gain and 2d a 1.926%
gain, both unfit against the unchanged 7.402% threshold. The final 4c diagnostic is complete.
Its original queue failed before timing because the private-output check used the source
worktree Git context with an output path in the coordinator checkout. That queue and failure
remain preserved; a fresh queue used the source worktree’s ignored private directory and completed both jobs.
No source, acceptance report, artifact, sample or policy changed for this repair.

| Hypothesis | Committed source | Untimed evidence |
| --- | --- | --- |
| 2c | `cc6cd28f7a16afebeeefaa91947ea570fa9cd85c` | Full shape-data YAML calls 3,858 → 646; all 5,000 outputs identical |
| 2d | `412e7f06a0ddf0a785841117573498e41f24375c` | Full front-matter YAML calls 1,934 → 306; all 5,000 outputs and preprocessing results identical |
| 4c | `d51bcb7891e08a93739d01af100d32d82f89d204` | Diagnostic tooling only; all 5,000 SVGs and layout models identical |

Round-0's 17,172 shape-data occurrences count lexer pieces: 3,858 opening tokens, 4,764 quote
tokens and 8,550 body tokens. The counter measures actual full-reader calls, not lexer pieces.
Independent review verified the decomposition and both counter reductions. 4c covers the fixed
buckets (1,426 tiny, 3,088 small, 459 medium, 27 large). Every sampled record executes one
conversion; coverage of repeated fitting/growth passes follows the shared instrumentation
boundary and is not demonstrated by this sample.

The 2d recognizer's trailing-blank/empty-config edge was fixed before the final source commit.
Review also required the adapter to reject absent/nonzero preprocessing-difference evidence;
that guard and its negative controls pass. Earlier preparation evidence remains preserved.
These untimed findings do not establish any speed gain. Browser validation and e2e remain pending/unverified.
The fixed 500 browser indices remain preserved. Other agent work, builds and tests pause
throughout acceptance and measurement as required by the operating manual.

Private evidence root: `.tmp/perf-round1-batch4-20261111`. Earlier publications and the prior
nine-entry ledger prefix are pinned there. Hindsight tools were not exposed in tool discovery.

The first 2c acceptance failed because its worktree lacked the expected local sample path.
The original frozen sample and subset were intact. Linking that exact preparation directory
resolved the setup issue; a fresh acceptance report passed, and the failed report is retained.
Three CPU-contaminated attempts are also retained and excluded. The observed app-server PID
serves this session’s command tools; attribution to unrelated Codex work was not established.

Formal publication: [REPORT.md](batch-4/REPORT.md), [RESULTS.json](batch-4/RESULTS.json),
and [REVIEW.md](batch-4/REVIEW.md). Eight final accepted jobs supply the report; the old
4c gates receipt remains preserved separately. Four invalid attempts (three CPU-limit
violations, one output-path setup failure) contribute no accepted evidence.

The separate 2d diagnostic records summed per-record median full-reader time of
12.039054 ms → 3.523836 ms (70.730% less), with 1,934 → 306 calls. This passes the
named mechanism condition but does not override the failed end-to-end P12 fit gate.

4c records 29.002743 ms of conversion across summed per-record medians (0.774622% of
instrumented render time). The 27 large records account for 1.143458 ms (0.639945%).
Their median per-record conversion is 35.459 µs. Seven large-bucket replicate totals
range from 1.123958 to 1.223579 ms; this spread is not a confidence interval.
Instrumentation affects code layout and runtime behavior; clock controls are disclosed,
with no subtraction. No interface change or achievable optimization gain is inferred.

Publication initially compared the diagnostic’s policy-file hash with the scheduler’s
parsed-policy hash. A separate report-only adapter now checks each representation against
its own source and retains deep policy equality; both original frozen adapters and raw
receipts remain unchanged. The failed publication log is preserved.

No optimization is integrated. The measurement window is closed; other work and Docker
may resume. Browser validation/e2e remain pending/unverified, and the next batch is not started.
