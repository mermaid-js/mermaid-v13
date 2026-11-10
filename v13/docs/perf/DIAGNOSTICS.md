# Diagnostic collection methods

`tools/perf/diagnostics.mjs` collects P7 counters and P10 feature/stage evidence separately
from acceptance timing. It accepts a built artifact manifest, the supplied unchanged records,
a fresh Git-ignored output directory, and the frozen policy. It never chooses or replaces records.
A successful result has `complete: true`; exceptions leave private partial evidence without a
completed result. The runner must execute it serially after timing, inside its exclusive job.

```sh
volta run --node 24.16.0 node tools/perf/diagnostics.mjs \
  --manifest .tmp/perf/artifacts/manifest.json \
  --records .tmp/perf-prep/validated-node24-v1/sample.jsonl \
  --policy v13/docs/perf/POLICY.json \
  --out .tmp/perf/diagnostics
```

This is a future full diagnostic command, not a claim that the full sample has been measured.
Preparation rehearsals supply small synthetic record files and an explicitly reduced policy.

## Output and measurement counters

The v13 and Pele diagnostic entries wrap their real parser and text measurers. Each record gets
three warmups and seven cache-reset renders under the frozen policy. Repeated counters must
agree. Totals sum one render per record, not all seven repetitions. `measurerCalls` counts actual
width-method invocations, including calls that hit a browser width cache; `metricsCalls` is
available separately for v13. SVG bytes are UTF-8 bytes; elements count opening/self-closing
XML tags; attributes count quoted XML attributes. The scanner respects quotes, comments and
CDATA. These passes neither time acceptance nor mutate source text.

The diagnostic reset self-check proves that identical v13 source parses once after reset, hits
its analysis cache when requested, and parses again after the next reset, with identical SVG.
Pele proves parser and width instrumentation execute and reset preserves identical output.

## Allocated bytes: a sampled estimate

The primary counter is **estimated JS heap bytes allocated inside the renderer**, not retained
heap growth and not an exact allocation count. Its scope excludes native/external memory,
setup, reset, traversal, profile serialization, and inspector transport. Each allocation child
imports the minified timing entry, so diagnostic counter and stage objects are excluded too.

Pinned Node 24.16.0 / V8 13.6.233.17-node.49 supplies `HeapProfiler.startSampling` with a 16,384-byte
mean sampling interval and both collected-object flags enabled. The reader sums `selfSize` only
under the named `allocationRender` stack boundary, including descendant frames. Every record
gets one cache-reset render in each independent sampling child; seven children produce seven
whole-sample estimates, whose median is the reported `allocatedBytesEstimate`. Raw profiles
and the individual estimates are retained. Timing acceptance never runs the profiler.

V8 samples allocations with an exponential/Poisson process and adjusts observed allocation
sizes for their sampling probability. This is an estimator, even though its output is an integer.
See the [pinned V8 sampling implementation](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/v8/src/profiler/sampling-heap-profiler.cc).

Before collection, six independent calibration children allocate arrays with known backing-store
payload: 512 arrays × 8,192 slots, using the runtime's pointer-compression setting to determine
slot width. Three retain the arrays; three discard them and force collection before stopping
the profiler. Headers/container overhead have an explicit upper allowance. Any estimate more
than 10% outside the payload/overhead interval fails the diagnostic job. This tests both numeric
scale and retention of allocations whose objects have already been collected. It does not prove
that all renderer workloads have the same statistical error.

The result records each calibration error, the maximum calibration error, sample counts, and
`(max(replicates)-min(replicates))/median(replicates)`. These are **empirical error/spread evidence,
not a general confidence bound**. A missing renderer stack, zero sampled allocations, unsupported
runtime, or failed calibration blocks completion. Very small samples can lack enough sampled
allocations; increase a synthetic rehearsal's workload rather than manufacturing a zero counter.

## GC pauses and the supplementary trace estimate

A separate child renders the same workload with `--expose-gc --trace-gc-nvp`, without heap sampling.
Synchronous markers and V8 output share stdout. Only GC events between `render-start` and the
matching `render-end` contribute to render GC pauses. `gc=s` is scavenge; `gc=mc` and `gc=mms`
are reported separately as other GC. Setup/reset pauses and forced boundary pauses are separate
fields. A forced GC before the batch and after its final render closes the trace accounting
interval; its pause is never counted as render/scavenge time. Seven repetitions are recorded,
with both totals and per-pass averages.

The pinned trace prints `pause` to 0.1 ms, giving at most 0.05 ms rounding error per printed
pause; the result reports the aggregate rounding bound. Trace instrumentation and marker
allocation can perturb collection scheduling, so these are diagnostics, not acceptance timings.
A missing marker, unknown collector, missing final collection, or missing render record fails.

`allocated=` is explicitly **not** used as the primary allocation counter. In the pinned V8
[trace implementation](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/v8/src/heap/gc-tracer.cc)
it subtracts the previous collection's end object size from the current collection's start size.
Summing those byte-precise intervals through the final forced collection is better than one
before/after heap-size subtraction, but it remains an occupancy-derived estimate. It includes
batch traversal, setup/reset and marker allocations and cannot guarantee gross allocated bytes.
The result retains it as `intervalOccupancyAllocatedBytes`, explicitly supplementary.

## Features and the empty graph

Feature evidence comes from v13 preprocessing, retained flowchart tokens, the parsed model and
actual label layout. It reports both occurrences and the number of diagrams containing each:
front matter, init/initialize directives, explicit `themeVariables` overrides, shape-data tokens,
subgraphs, ordinary comment tokens, wide labels and labelled edges. Directives are not ordinary
comments. `themeVariables` means an explicitly supplied front-matter config or directive argument,
not resolved defaults.

Wide labels use the actual label's font, style, options and positive finite wrap argument. In
inspection only, a second label layout with infinite width determines whether the unwrapped
width exceeds that argument. Counts refer to label-layout invocations; no raw label text enters
the aggregate result. Inspection does not run during counter or timing passes.

The warmed empty source is exactly `graph TD`. Its 1,000 diagnostic repetitions record total,
parse, inclusive layout and serialization times, plus nested measurement and graph-layout times.
**Do not add `measure` and `graphLayout` to `layout`.** Unaccounted time is total minus parse,
layout and serialization; it includes other API work and clock/instrumentation overhead. Medians
are descriptive diagnostics and must not be used to claim an acceptance gain.

## Evidence and scope

Every child job, raw V8 profile, stdout/stderr trace, record counter row and empty-stage row has a
SHA-256 reference in the private result. Artifact/source verification runs before and after
collection. The result records runtime versions, policy, artifact digest, input-source digest,
and diagnostic implementation hashes. Record contents, profiles and per-record evidence stay
Git-ignored. The orchestrator labels rehearsal versus formal scope; small preparation tests are
never round-0 results.
