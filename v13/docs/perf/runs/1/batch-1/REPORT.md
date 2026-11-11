# Round 1, first batch

Formal Node measurements of 2b, 1c and 5b against the same frozen base. Production caching is unchanged; benchmark resets occur outside timed renders.

All candidates use the frozen 5,000-record sample. Browser validation and e2e remain unverified; the fixed 500-index subset is preserved.

| Candidate | Node geomean gain | Named counters | Output lane | Verdict |
| --- | ---: | --- | --- | --- |
| 2b | 1.833% | pass | byte-identical | unfit |
| 1c | 1.690% | pass | byte-identical | unfit |
| 5b | 3.021% | fail | byte-identical | unfit |

The unchanged P12 threshold is 7.402%. A/A noise comes from round 0, including its disclosed directional imbalance. Every size bucket must also remain within the 1% regression limit. No threshold or noise correction was introduced.

- **2b:** Node gain/flat-time byte reduction threshold failed
- **1c:** Node gain/flat-time byte reduction threshold failed
- **5b:** Node gain/flat-time byte reduction threshold failed; Hypothesis named-counter kill condition failed

The current base summed v13/Pelé time ratio is 1.4652171383163477; the P2 target is 0.95. This separately measured base reference is not a direct candidate-versus-Pelé measurement.

Measurements use P27's frozen 1,536 ms total background CPU limit per interval, derived from observed p95 plus 20%. All dispatched agents, builds, tests and browser jobs were idle during each serial run. Six invalid attempts remain archived privately: three 2b diagnostic attempts, two 5b attempts and one Pelé reference attempt. Docker was running for all three accepted candidate timing jobs and was stopped before the accepted 5b correctness/diagnostics and Pelé reference jobs. The limits and candidate timing evidence were unchanged.

RESULTS.json contains bucket aggregates, allocation and GC diagnostics, counter values, checks, SHAs and evidence hashes. Raw per-diagram sources, SVGs and profiles remain private.

Reproduce publication from the preserved evidence:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS volta run --node 24.16.0 node .tmp/perf-round1-batch1-20261110/publish.mjs
```

No candidate qualifies, so this batch delivers no optimization and requires no combination measurement. Observed gains below the fixed threshold are not accepted speedups. Rejected changes remain on their evidence branches. Other round-1 hypotheses remain untested; browser validation and e2e remain pending.
