# Round 1, fifth batch

Formal Node measurement of 2a, the parser-sink/lazy-AST hypothesis, against the same frozen base. Production analysis caching and prepare-to-render reuse are preserved; benchmark resets occur outside timed renders.

The candidate uses all 5,000 frozen records. Browser validation and e2e remain unverified; the fixed 500-index subset is preserved.

| Candidate | Node geomean gain | Named allocation conditions | Output lane | Verdict |
| --- | ---: | --- | --- | --- |
| 2a | 2.459% | pass | byte-identical | unfit |

Executed parser creation counts include newly introduced lazy machinery; their exact scope, categories and exclusions are retained in RESULTS.json. These counts are not physical allocation bytes. Public parse materialization and consumer compatibility are covered by separate correctness evidence. Normal rendering creates 7433113 counted objects in the base and 5036158 in the candidate (73.306 → 49.667 per fixed node).

Explicitly materializing deferred metadata after rendering adds 7181290 counted creations in the candidate, versus 0 in the already-eager base. The combined render-plus-metadata path therefore counts 12217448 versus 7433113. This is an untimed cost of deferred access, not a latency measurement or a physical-byte estimate. Editor/extension/loaded-ASCII paths ordinarily select the eager sink; cached SVG-to-ASCII access can require replay.

Fresh base and head P7 diagnostics use the normal timing artifacts and seven independent sampled-allocation child passes each, with three warmups and all 5,000 records. Median estimated renderer allocation is 1042068016 bytes for base and 1012352464 bytes for head (2.852% less). The named allocation condition passes. Calibration errors, replicate values and spread are disclosed in RESULTS.json. Sampling excludes native/external buffers and allocations outside renderer stacks. Base/head diagnostics are separate serial jobs, not interleaved acceptance timing. These estimates are not exact bytes or confidence bounds.

The unchanged P12 threshold is 7.402%. A/A noise comes from round 0, including its disclosed directional imbalance. Every size bucket must remain within the 1% regression limit. No threshold or noise correction was introduced.

- **2a:** Node gain/flat-time byte reduction threshold failed

R-PARSE-3 and DESIGN §4.2 amendments remain proposed and require Knut’s review before delivery. A passing measurement does not approve those amendments. This report does not integrate the implementation or claim browser validation.

The round-1 base summed v13/Pelé time ratio, reused from the accepted batch-1 reference, is 1.4652171383163477; the P2 target is 0.95. The original artifacts, sample, policy, receipt and environment are preserved. This is not a direct candidate-versus-Pelé measurement.

Measurements use P27’s fixed 1,536 ms total background CPU limit per interval. All dispatched agents, builds, tests and browser jobs were idle during each serial run. Docker backend and VM absent in pre-window process snapshot; vmnetd helper remains. Existing Codex, Node/editor and esbuild background processes remain permitted within unchanged P27 limits. All dispatched agents completed; coordinator launches no parallel work during the serial runner. The runner records startup and continuous CPU observations for every job. 0 invalid batch-5 attempts are archived privately and excluded. Four final accepted jobs supply this batch.

RESULTS.json contains timing buckets, allocation and GC diagnostics, counter values, checks, source SHAs and evidence hashes. Raw per-diagram sources, SVGs and profiles remain private.

Reproduce publication from the preserved evidence:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS volta run --node 24.16.0 node .tmp/perf-round1-batch5-20261111/publish.mjs
```

The candidate is unfit, so this batch delivers no optimization and requires no combination measurement. Other round-1 hypotheses remain untested; browser validation and e2e remain pending.
