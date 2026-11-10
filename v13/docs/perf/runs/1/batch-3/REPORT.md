# Round 1, third batch

Formal Node measurements of 3b, 4a and 5a against the same frozen base. Production analysis caching and prepare-to-render reuse are preserved; benchmark resets occur outside timed renders. Hypothesis 3b changes reuse of theme construction work.

All candidates use the frozen 5,000-record sample. Browser validation and e2e remain unverified; the fixed 500-index subset is preserved.

| Candidate | Node geomean gain | Named counters | Output lane | Verdict |
| --- | ---: | --- | --- | --- |
| 3b | 2.312% | pass | byte-identical | unfit |
| 4a | 1.503% | pass | byte-identical | unfit |
| 5a | 2.504% | pass | byte-identical | unfit |

Counter evidence records executed operations, not physical allocation bytes. Exact definitions, controls and limitations are retained in RESULTS.json.

The unchanged P12 threshold is 7.402%. A/A noise comes from round 0, including its disclosed directional imbalance. Every size bucket must also remain within the 1% regression limit. No threshold or noise correction was introduced.

- **3b:** Node gain/flat-time byte reduction threshold failed
- **4a:** Node gain/flat-time byte reduction threshold failed
- **5a:** Node gain/flat-time byte reduction threshold failed

The round-1 base summed v13/Pelé time ratio, reused from the accepted batch-1 reference, is 1.4652171383163477; the P2 target is 0.95. The base artifacts, sample and policy are unchanged; its original receipt and Docker-off environment are preserved. It is not a direct candidate-versus-Pelé measurement.

Measurements use P27's frozen 1,536 ms total background CPU limit per interval, derived from observed p95 plus 20%. All dispatched agents, builds, tests and browser jobs were idle during each serial run. Docker Desktop and its VM/backend were absent before the batch-3 window; only its idle privileged helper remained. Existing background services remain subject to unchanged P27 monitoring. All dispatched agent work, builds, tests and browser jobs were idle during serial measurement. The exact round-1 Pelé reference is reused from batch 1 with its original Docker-off environment. 2 invalid batch-3 attempts are archived privately and excluded from accepted results.

RESULTS.json contains bucket aggregates, allocation and GC diagnostics, counter values, checks, SHAs and evidence hashes. Raw per-diagram sources, SVGs and profiles remain private.

Reproduce publication from the preserved evidence:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS volta run --node 24.16.0 node .tmp/perf-round1-batch3-20261110/publish.mjs
```

No candidate qualifies, so this batch delivers no optimization and requires no combination measurement. Observed gains below the fixed threshold are not accepted speedups. Rejected changes remain on their evidence branches. Other round-1 hypotheses remain untested; browser validation and e2e remain pending.
