# Round 1, fourth batch

Formal Node measurements of 2c and 2d against the same frozen base. Production analysis caching and prepare-to-render reuse are preserved; benchmark resets occur outside timed renders. Diagnostic-only 4c measures internal layout conversion separately.

All candidates use the frozen 5,000-record sample. Browser validation and e2e remain unverified; the fixed 500-index subset is preserved.

| Candidate | Node geomean gain | Named counters | Output lane | Verdict |
| --- | ---: | --- | --- | --- |
| 2c | 1.875% | pass | byte-identical | unfit |
| 2d | 1.926% | pass | byte-identical | unfit |

Counter evidence records executed operations, not physical allocation bytes. Exact definitions, controls and limitations are retained in RESULTS.json.

Diagnostic-only 4c measures conversion after compound layout and before the returned LayoutModel leaves run(). It includes all executed conversion passes and excludes compound layout and later label/fit orchestration.

| Bucket | Records | Sum of per-record median conversion time (ms) | Fraction of instrumented render time |
| --- | ---: | ---: | ---: |
| all | 5000 | 29.003 | 0.775% |
| tiny | 1426 | 3.725 | 1.016% |
| small | 3088 | 17.301 | 0.796% |
| medium | 459 | 6.833 | 0.667% |
| large | 27 | 1.143 | 0.640% |

These are instrumented diagnostic costs, not accepted gains or a promise that removing the boundary would recover this time. RESULTS.json retains clock controls, replicate spread, instrumentation comparison and precise scope. No interface change follows automatically.

The unchanged P12 threshold is 7.402%. A/A noise comes from round 0, including its disclosed directional imbalance. Every size bucket must also remain within the 1% regression limit. No threshold or noise correction was introduced.

- **2c:** Node gain/flat-time byte reduction threshold failed
- **2d:** Node gain/flat-time byte reduction threshold failed

The round-1 base summed v13/Pelé time ratio, reused from the accepted batch-1 reference, is 1.4652171383163477; the P2 target is 0.95. The base artifacts, sample and policy are unchanged; its original receipt and Docker-off environment are preserved. It is not a direct candidate-versus-Pelé measurement.

Measurements use P27's frozen 1,536 ms total background CPU limit per interval, derived from observed p95 plus 20%. All dispatched agents, builds, tests and browser jobs were idle during each serial run. Docker VM/backend were absent before this window; the idle privileged helper and existing background services remained. The exact accepted round-1 Pelé reference is reused with its original environment. All dispatched work pauses during formal measurement. 4 invalid batch-4 attempts are archived privately and excluded from accepted results: three CPU-limit violations and one output-directory setup failure before diagnostic timing. Eight jobs supply the final batch results. The successful gates job from the superseded 4c queue is also retained, but the fresh queue reran both jobs and its receipts alone supply the 4c report.

RESULTS.json contains bucket aggregates, allocation and GC diagnostics, counter values, checks, SHAs and evidence hashes. Raw per-diagram sources, SVGs and profiles remain private.

Reproduce publication from the preserved evidence:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS volta run --node 24.16.0 node .tmp/perf-round1-batch4-20261111/publish.mjs
```

No candidate qualifies, so this batch delivers no optimization and requires no combination measurement. Observed gains below the fixed threshold are not accepted speedups. Rejected changes remain on their evidence branches. Other round-1 hypotheses remain untested; browser validation and e2e remain pending.
