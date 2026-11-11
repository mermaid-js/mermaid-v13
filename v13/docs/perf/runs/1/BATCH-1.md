# Round 1, first batch

Knut authorized starting this batch on 2026-11-10 after reviewing the round-0 baseline and
clarifying P28. Candidates are 5b (plain-text wrapping), 2b (lexer/source-view allocation),
and 1c (SVG writer allocation). Hypothesis 3a remains withdrawn; production caching is unchanged.

## Frozen base and preservation

Source snapshot: `094ec5283059b7a87c2c2745ea6dffcc5a4dcee7`, branch
`perf/round-1-base-20261110`, parent `9bee2019c2c14fccd2b9078d11c3b70c68ea66e2`.
The snapshot captures the existing preparation and published baseline without changing the
original checkout's working files or index. Each candidate starts from this exact snapshot.
The existing round-0 timing artifact and noise proofs remain the comparison reference.

Private orchestration/evidence root: `.tmp/perf-round1-batch1-20261110` in the original checkout.
`base.json` records the original status/index hash and worktree paths; `assignments.json`
records explicit role/model/effort. Hindsight tools were not exposed in this session.

| Hypothesis | Branch | Agent | Model | Effort |
| --- | --- | --- | --- | --- |
| 5b | perf/round-1-5b-20261110 | /root/round1_5b | GPT-6 Astra | high |
| 2b | perf/round-1-2b-20261110 | /root/round1_2b | GPT-6 Astra | high |
| 1c | perf/round-1-1c-20261110 | /root/round1_1c | GPT-6 Astra | medium |

## Execution constraints

Implement and review independently, then run pinned Node acceptance and build immutable
artifacts before measurement. Stop all dispatched work during the serial measurement window.
Use the frozen 5,000 records and 500 browser indices, P27 host allowance and P12 thresholds.
Do not tune the 7.40237% gain threshold or correct away the baseline A/A directional imbalance.
Every candidate must pass its named-counter condition, exact-output/public-surface gates,
repository/security checks and size budgets. The existing evaluator determines fit.
Output changes require browser/pixel/e2e evidence; these remain pending until actually verified.

Current status: **first batch complete; all three candidates rejected by the frozen fit rules.**
All candidates passed fresh Node acceptance, were frozen and pushed after normal pre-push
checks, and completed timing, byte/public-surface gates and diagnostics. The round's Pelé
reference also completed. See [the report](batch-1/REPORT.md), [aggregate results](batch-1/RESULTS.json)
and [generated ledger](LEDGER.md). Node geomean gains were 1.833% (2b), 1.690% (1c) and 3.021%
(5b), below the unchanged 7.402% threshold. All 5,000 SVGs matched byte-for-byte in every
candidate. No optimization is integrated and no combination measurement is required.

Six invalid attempts are preserved: three 2b diagnostic attempts, two 5b attempts and one Pelé
reference attempt. Docker was stopped after all candidate timing jobs, before accepted 5b
correctness/diagnostics and the accepted Pelé reference. The same P27 limits applied throughout.
Independent source, scheduler composition and publication-code reviews have no unresolved
findings. Browser validation and e2e remain unverified. Remaining round-1 hypotheses are untested;
this first batch does not count as a completed empty round for P2's stopping rule.

5b already fails its named-counter condition: targeted string constructions fall from 3,454,963
to 2,198,419, but width calls (1,198,406) and metrics calls (220,480) remain unchanged. Its timing
will be recorded for comparison; the condition will not be narrowed after seeing the evidence.
