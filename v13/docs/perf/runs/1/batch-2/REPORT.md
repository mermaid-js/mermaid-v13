# Round 1, second batch

Formal Node measurements of 1a, 3c and 4b against the same frozen base. Production analysis caching and prepare-to-render reuse are preserved; benchmark resets occur outside timed renders. Hypothesis 1a includes its planned one-value attribute-escaping memo.

All candidates use the frozen 5,000-record sample. Browser validation and e2e remain unverified; the fixed 500-index subset is preserved.

| Candidate | Node geomean gain | Named counters | Output lane | Verdict |
| --- | ---: | --- | --- | --- |
| 1a | 2.251% | pass | byte-identical | unfit |
| 3c | 2.405% | pass | byte-identical | unfit |
| 4b | 2.702% | pass | byte-identical | unfit |

Counter interpretation: 1a counts explicit RegExp.test calls separately from String.replace passes. Replacement passes increased from 119,137 to 180,210; those supplemental counts are disclosed, not added to or substituted for its original kill condition. These are executed-operation counts, not physical allocation bytes.

The unchanged P12 threshold is 7.402%. A/A noise comes from round 0, including its disclosed directional imbalance. Every size bucket must also remain within the 1% regression limit. No threshold or noise correction was introduced.

- **1a:** Node gain/flat-time byte reduction threshold failed
- **3c:** Node gain/flat-time byte reduction threshold failed
- **4b:** Node gain/flat-time byte reduction threshold failed

The round-1 base summed v13/Pelé time ratio, reused from the accepted batch-1 reference, is 1.4652171383163477; the P2 target is 0.95. The base artifacts, sample and policy are unchanged; its original receipt and Docker-off environment are preserved. It is not a direct candidate-versus-Pelé measurement.

Measurements use P27's frozen 1,536 ms total background CPU limit per interval, derived from observed p95 plus 20%. All dispatched agents, builds, tests and browser jobs were idle during each serial run. Docker Desktop and its VM/backend were absent before the batch-2 window; only the idle privileged vmnetd helper remained. Existing editor/build-service background processes were present and remain subject to the unchanged P27 monitoring limits. All work dispatched for this effort was idle. The accepted round-1 Pelé reference is reused from batch 1, where Docker was off. 2 invalid batch-2 attempts are archived privately and excluded from accepted results.

RESULTS.json contains bucket aggregates, allocation and GC diagnostics, counter values, checks, SHAs and evidence hashes. Raw per-diagram sources, SVGs and profiles remain private.

Reproduce publication from the preserved evidence:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS volta run --node 24.16.0 node .tmp/perf-round1-batch2-20261110/publish.mjs
```

No candidate qualifies, so this batch delivers no optimization and requires no combination measurement. Observed gains below the fixed threshold are not accepted speedups. Rejected changes remain on their evidence branches. Other round-1 hypotheses remain untested; browser validation and e2e remain pending.
