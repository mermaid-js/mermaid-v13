# Hop-4 diagnostic interface

This tooling measures the frozen round-1 base's CNode/CEdge → LayoutModel conversion. It makes
no production-source changes and supplies no fit verdict. `HOP4_BOUNDARY` and
`HOP4_LIMITATIONS` are copied into each report.

The clock starts immediately after `compoundLayout` returns inside `run()` and ends after
construction of its returned model. This includes margins, node/group/edge maps, group slicing,
route-point conversion, ports, self-loops, bounds and direction. It excludes compound layout,
input wrappers, subsequent end-label work and outer layout orchestration. Every executed
conversion counts, including discarded fitting attempts and any grid-growth attempts.

All three diagnostic entries use matching minified, split builds with bench stages disabled.
`plain` has no instrumentation. `control` captures immediate conversion and final layout models
only during equality checks. `instrumented` also reads `performance.now()` twice per conversion;
statistics storage occurs after the closing clock. Capturing is disabled for formal collection.
The normal acceptance/timing artifact comes unchanged from `buildArtifacts` in a separate tree.

```js
import {
  buildHop4Artifacts, verifyHop4Artifacts, verifyHop4Equality,
  collectHop4, validateHop4Report,
} from './tools/perf/diagnostics-hop4.mjs';

const built = await buildHop4Artifacts({ out: '/absolute/private/fresh/artifacts' });
const equality = await verifyHop4Equality({
  manifest: built.manifestPath, records: samplePath,
  out: '/absolute/private/fresh/equality',
});
// The coordinator freezes inputs and runs this call in an existing formal runQueue job:
const result = await collectHop4({
  manifest: built.manifestPath, records: samplePath, policy,
  out: '/absolute/private/fresh/collection',
});
validateHop4Report({ result, manifest: built.manifestPath, records: samplePath, policy });
```

`collectHop4` requires Node 24.16.0 / pinned V8, no Node options, the exact original 5,000-record
sample file, and the unchanged policy. It renders in a fresh worker thread with a parent watchdog
around every setup, warmup and measured render. Each entry receives three cache-reset warmups
and seven cache-reset renders per unchanged source. Plain/instrumented order alternates by
record plus repetition. SVG equality is checked outside timing. All seven raw per-invocation
conversion durations and both render durations are retained. Pass counts must agree across
repetitions. Any failure prevents a completed result.

`buildHop4Artifacts` returns `{manifest, manifestPath, manifestSha256}`. The manifest exposes
`sources` and `artifacts` arrays of absolute `{path, sha256}` pins, entry paths, digest fields,
and a `normal` pin for the normal builder's manifest. Freeze that normal manifest's sources and
artifacts too. `verifyHop4Artifacts` recursively verifies these dependencies.

`verifyHop4Equality` compares normal/plain/control/instrumented SVGs plus immediate conversion
and final layout models between control and instrumented entries. Its private JSONL preserves
record identity, pass count, SVG hash and serialized-model hashes. It also runs the existing
normal diagnostic reset proof. Equality is untimed evidence; any incidental clock values are
discarded. The returned result includes manifest/artifact/source/sample pins and the raw file pin.

`collectHop4` produces `result.json`, `hop4.jsonl`, `clock-controls.json` and `evidence-tree.json`.
The evidence tree covers the result and both raw files. `validateHop4Report` verifies all result
pins and recomputes aggregates and clock summaries from the raw evidence. `summarizeHop4`
provides the raw-row validator and aggregation separately for focused tests.

Aggregates cover all records and every frozen byte-size bucket, with the large bucket explicitly
present. They report sums of per-record median conversion and total times, conversion fraction
of instrumented time, plain/instrumented total ratio, per-record medians/ranges, all seven
whole-bucket replicate sums, and spread. Empty buckets remain explicit. Before/after controls
retain 10,000 raw empty clock-pair durations each after 1,000 initial clock warmups. No subtraction
or correction is applied. These controls do not bound JIT, code-layout, bookkeeping or GC bias;
replicate spread is descriptive and not a confidence interval. The plain/instrumented ratio is
an instrumentation control, never an accepted speedup.

The coordinator must supply fresh complete Node acceptance for the final source fingerprint,
pin the scripts, equality evidence, sample, policy, manifests and all dependencies in the existing
formal scheduler, verify its quiet-monitoring receipts, and verify pins before and after the job.
A raw diagnostic result always has `timingEligible: false`: it cannot establish scheduling or
acceptance by itself. Do not run this collection while development agents are active. Formal
output directories must be fresh and separate from untimed preparation evidence.
