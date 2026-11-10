# Lab harness port checklist

Implementation now lives in `tools/perf/`. See [PREPARATION.md](PREPARATION.md) for observed
acceptance results and blockers, and [NEXT-SESSION.md](NEXT-SESSION.md) for executable commands.
The following checklist records the original port requirements; implementation alone does not
establish that required checks have passed. No formal round 0 ran in preparation.

The copied lab is `/Users/knsv/repos/mermaid-perf-lab`. It has no Git metadata.
[LAB-SOURCES.json](LAB-SOURCES.json) records the inspected source hashes. Verify them after
the copy completes, then preserve provenance when porting. Its old NEXT-SESSION.md describes
the prior investigation; this effort follows the P-decisions and START.md.

## What to reuse and what to change

| Existing lab file | Reuse | Required adaptation |
| --- | --- | --- |
| `entries/v13.ts` | `mermaid/slim` + flowchart, prepare/setup, synchronous warmed render | Explicit checkout path; checked AnalysisCache reset without initialize or source mutation; preserve warm config and loaded modules |
| `entries/pele.ts` | `pele/core` + flowchart registration, text-width reset, configure/render API | Pin Pele input artifacts; keep defaults for headline ratios; explicitly record limits and ID policy |
| `scripts/build.mjs` | Minified timing build and unminified mapped diagnostic build, no keepNames | Explicit v13/base/Pele paths and output directories; full source/artifact hashes; build before measuring |
| `scripts/dtd-run.mjs` | Sample traversal, preload/warmup structure, per-diagram repetitions | Read the frozen sample; replace appended comments with checked reset hooks; interleave head/base per diagram; freeze repetition policy and write resumable results |
| `scripts/dtd-lib.mjs` | Reading corpus records in place | Accept the new sample manifest or source-bearing local JSONL; verify hashes and eliminate assumed sibling paths |
| `scripts/bench-node.mjs` | Process isolation and alternating run order | One serial scheduler across candidate artifacts; one quiet-window lock; do not use separate full-library passes as the paired acceptance metric |
| `scripts/bench-chrome.mjs` | Browser launch/render/insert approach | Fixed sample subset, pinned browser/fonts, separate render/insert/getBBox timing, exact base/head pixel comparison and surface checks |
| `scripts/calls.mjs`, `scripts/stages.mjs` | Coverage/profile diagnostics and source maps | No timing acceptance with instrumentation enabled; no source mutation; pin instrumentation targets and fail if they move |
| `scripts/gc-trace.mjs` | GC diagnostics starting point | Current calculation estimates allocations from rounded heap sizes between GCs; validate a method for the pinned V8, define scope/error, distinguish scavenge from other pauses |

The old `entries/v13.ts.reset()` resets the canvas measurer only. It does not clear AnalysisCache.
`dtd-run.mjs` currently defeats that cache by appending varying comments. Reusing those functions
unchanged would violate P9. At preparation start, v13 had a private per-instance AnalysisCache and no
dedicated benchmark reset export. The port adds a non-public, checked hook for base/head builds;
startup must verify behavior, not just the existence of a function. Reset outside timed regions.

The original build expects sibling `mermaid-v13` and `pele` source checkouts. This work uses
`mermaid-v13-perf` and later hypothesis worktrees. A Pele source checkout was not found locally;
the installed Pele 1.13.0 package exposes both `pele/core` and `pele/diagrams/flowchart`, and the
sample validator already builds that minimal setup. Record the chosen artifact origin and hashes.

## Implement before the execution session starts measuring

1. Configure explicit inputs/outputs, immutable artifact manifests and local result storage.
2. Add and verify reset hooks; smoke-render unchanged source repeatedly and prove parsing occurs
   when cache-off is requested. Separately exercise cache-on for the P10 comparison.
3. Port paired Node timing, quiet-window enforcement, contamination invalidation and checkpoints.
4. Add P7 counters with collection methods. Timing and instrumented diagnostics use separate passes.
5. Add byte/pixel/surface gates and the deterministic evaluator. Missing evidence blocks fit.
6. Add round-0 probes, round header, append-only hypothesis records and ledger generation.
7. Rehearse with small synthetic fixtures and an A/A plumbing check whose numbers are discarded.
   Formal round 0 and hypothesis evaluation belong to the next session.

## Acceptance checks for the harness

- Dirty or changed artifacts fail manifest verification; a changed sample or browser subset fails startup.
- Missing reset/instrumentation targets fail loudly; no source comments or per-render initialize calls.
- A deliberately slowed head fails the timing/bucket rules; identical output with changed protected
  IDs fails the public-surface gate; a one-pixel change fails the output lane.
- Missing security/check/size results cannot produce a fit verdict. Requirement approval is a
  separate delivery state, never inferred from timing.
- A busy host refuses timing; activity during a window invalidates affected measurements.
- An interrupted job can resume without treating partial samples as complete or duplicating final records.
- The evaluated result is reproducible from stored raw evidence and the frozen policy, without a model.

## Measurement choices still to settle

POLICY.json now freezes the definition of A/A spread and “flat”, a repetition/retry budget, size-bucket boundaries,
and timeout/failure policy before round 0. Use the A/A result to instantiate P12's fixed formula;
do not tune thresholds after seeing candidate outcomes. Keep the summed target distinct from the
geomean acceptance metric. P18/P28 requires cache reset only in the harness, which is already
implemented. Production cache removal is not required and needs no exception to P12. Model launchers are a separate execution-configuration choice.

## Headless validation profile (P25)

`check-environment.mjs --node-only`, `run-checks.mjs --node-only` and
`round.mjs prepare --node-only` select the browser-free path. Host monitoring, repository checks,
security, size, all 5,000 byte/public-surface gates, diagnostics and timings remain required.
Chromium is loaded only by the full/browser path. The frozen header records the profile; run,
resume and report preserve it. Node acceptance cannot authorize a full run. Browser acceptance,
e2e and diagnostics are reported as unverified separately, not converted to passes. Output-lane
pixel/e2e requirements in evaluate.mjs are unchanged.
