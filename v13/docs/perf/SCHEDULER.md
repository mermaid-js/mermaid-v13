# Serial scheduler and paired worker

These tools are preparation infrastructure. Unit-test fixtures and explicit rehearsals are not
round 0, A/A noise evidence, or performance claims. The formal runner must additionally verify
the environment, frozen header and reset-behavior proof before invoking the queue.

## Queue contract

`node tools/perf/scheduler.mjs --queue queue.json` reads:

```json
{
  "directory": "/absolute/local/run",
  "identity": { "headerSha256": "...", "manifestSha256": "...", "sampleSha256": "...", "policySha256": "..." },
  "mode": "rehearsal",
  "quietPolicy": { "intervalMs": 1000, "quietMs": 3000, "maxCpuMs": 10, "maxTotalCpuMs": 20 },
  "jobs": [{
    "id": "aa-0",
    "argv": ["/absolute/node", "/absolute/tools/perf/timing-worker.mjs", "--job", "/absolute/job.json", "--out", "/absolute/local/run/aa-0/result.json"],
    "timeoutMs": 3600000,
    "inputs": [{ "path": "/absolute/job.json", "sha256": "..." }],
    "outputs": ["/absolute/local/run/aa-0/result.json", "/absolute/local/run/aa-0/evidence-tree.json"],
    "outputTrees": ["/absolute/local/run/aa-0/evidence-tree.json"],
    "retryCleanupPaths": ["/absolute/local/run/aa-0"]
  }]
}
```

Use absolute paths. Include every source/artifact, manifest, sample, subset, header, policy and
job specification in `inputs`; the orchestrator owns this complete input list. Every `outputTrees`
file must itself appear in `outputs` and contain `{ "files": [{ "path": "absolute", "sha256": "..." }] }`.
The scheduler verifies both the tree and all referenced raw files before reuse. `retryCleanupPaths`
may name only job-owned paths below the run directory. Use them for workers that require a fresh
output directory; completed jobs are never cleaned.

`queue-identity.json` freezes the identity, complete job list, mode and quiet policy. Resume
requires byte-identical canonical contents and matching input/output hashes. `scheduler.jsonl`
is append-only: starts, invalid attempts and successful completion records are retained. Only a
successful complete record is reused; interrupted or invalid jobs restart in full. A torn trailing
append is preserved with a hash-bearing recovery receipt. Duplicate completion records fail closed.
The scheduler runs jobs one at a time under the repository-wide `.tmp/perf/measurement.lock`.
A live PID blocks acquisition even if its lock is old. A verified dead owner can be recovered;
unreadable ownership or inaccessible PID inspection blocks acquisition. Stale recovery is itself
serialized. An interrupted recovery marker needs explicit investigation before removal.

`formal` enforces host quiet and may produce eligible timing evidence after the remaining gates.
`rehearsal` explicitly skips host inspection and always records `timingEligible: false`.
`acceptance` enforces host quiet but always records `timingEligible: false`; it is used for real
process-control tests with a sleeper, never a renderer.

## Quiet-window method and limits

The pinned policy uses a 3-second startup window with 1-second snapshots from
`/bin/ps -axo pid=,ppid=,time=,comm=`. CPU-time deltas include all process names. Under P27,
unrelated processes consuming more than 1,536 ms combined between snapshots refuse startup
or invalidate the whole active job. The per-process field also equals 1,536 ms and imposes
no additional cap. This total limit is the observed background p95 plus a 20% buffer;
see [BACKGROUND-LOAD.json](BACKGROUND-LOAD.json). They replace the original 10/20 ms limits and
do not establish an idle host. They are separate from measured A/A spread. Runner/worker descendants
and the snapshot's own `ps` process are allowed; load averages and observed deltas are retained.
Monitoring continues through a final sample after the child exits. Failure to read or parse
process information fails closed. A violation kills the active process group and preserves an
invalid attempt rather than a successful partial result.

Process polling cannot observe a process that both starts and exits entirely between snapshots.
CPU time also has the host's `ps` tick resolution. This guard supplements the operational P5/P14
requirement that coordinator-dispatched agent activity, builds, tests and browser work stop during
a measurement window; it cannot establish that requirement by itself. P26 permits the existing
background workload inside the fixed limits, while the coordinator and its workers stay idle.

Run the real-host acceptance separately, with all other work stopped:

```sh
volta run --node 24.16.0 node tools/perf/host-acceptance.mjs --out .tmp/perf/host-acceptance-fresh
```

This first requires a real quiet sleeper job, then verifies rejection of a sibling `/usr/bin/yes`
CPU workload at startup and invalidation when that workload starts during a sleeper job. The
negative control uses `floor(maxTotalCpuMs / intervalMs) + 1` burner processes (two under P27)
so it exceeds the allowed total even without ambient CPU activity. No diagram
is rendered. If `--out` is omitted a fresh timestamped local directory is selected. Denied process
inspection produces a failed report and nonzero exit; mocked tests cannot satisfy this acceptance.

## Paired timing contract

`node tools/perf/timing-worker.mjs --job job.json --out result.json` consumes `mode`, `experiment`
(`aa`, `pele`, `trailing-comment`, `cache`, or `candidate`), zero-based `block`, `manifest` (path),
`manifestSha256`, `samplePath`, `sampleSha256`, `policy`, and `configuration`.
A `candidate` job additionally requires `headManifest` and `headManifestSha256`, using its v13
timing entry as head and the original manifest as base. This is harness support for future
hypotheses; it does not implement an optimization.
The worker verifies the manifest and full sample before selecting an optional rehearsal-only
`limit`. Formal jobs require every fixed sample record. Entries come from
`manifest.entries.v13.timing.entry` and `manifest.entries.pele.timing.entry`; diagnostic bundles
are not imported into the timing process. Reset behavior is checked separately during preflight.

Each invocation is a fresh process with independent entry instances for the two sides. Every
diagram receives three warmups per side, then seven paired repetitions. Pair order alternates by
`diagram index + repetition + block`. The timed region contains only synchronous `render`; setup,
source preparation, reset, validation, watchdog messages and result serialization are outside it.
Analysis and text-width resets preserve initialized configuration and loaded modules. Cache-on
retains analysis while resetting text widths. Only the explicitly named P10 trailing-comment job
adds a unique comment to its head input; every other path preserves source bytes.

Output records contain `index`, `sourceSha256`, UTF-8 `sourceBytes`, frozen `bucket`, seven positive
nanosecond values each in `base` and `head`, medians and pair order. Errors, missing methods,
invalid SVGs or timeouts fail the entire block; no record is silently dropped. A parent-thread
watchdog can terminate a synchronous stuck render. A/A requires ten separately scheduled
whole-sample jobs; this worker never turns repetitions or diagrams into independent noise blocks.
The parent evaluator aggregates medians according to POLICY.json. Rehearsal results carry an
explicit unfit label and must be discarded as measurements.
