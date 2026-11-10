# Flowchart performance operating manual

Status: executable harness preparation. Validate the checks in [NEXT-SESSION.md](NEXT-SESSION.md)
and inspect [PREPARATION.md](PREPARATION.md) before running round 0 in the next execution session. [DECISIONS.md](DECISIONS.md) is the policy source; this file describes execution.

P25 separates headless Node measurement readiness from browser validation. Use the explicit
`--node-only` commands in NEXT-SESSION.md for round 0. Browser acceptance, e2e and P8/P13 browser
diagnostics stay pending in that profile. Full browser assessment and output-changing candidates
still require their browser evidence; a Node baseline never satisfies those gates.

P26/P27 supersede the absolute idle-host requirement below: existing background activity may remain
within the observed total CPU p95 plus 20% limit frozen in POLICY.json, with no additional
per-process restriction. The coordinator and all workers
dispatched for this effort still pause during measurement. Monitoring, invalidation, fresh
acceptance and the A/A fit formula remain required. Reports must disclose this environment;
see [BACKGROUND-LOAD.json](BACKGROUND-LOAD.json).

## Roles and inputs

The coordinator owns the frozen round base, worktree assignments, phase transitions and ledger.
The hypothesis generator reads the latest ledger, profile, counters and current source before
proposing at most six hypotheses in an automated round. Each names a mechanism, expected counter,
kill condition and required amendments. Round 1 instead uses [the agreed list](runs/1/HYPOTHESES.md).
P23/P24 select Codex with explicit model/effort per role and hypothesis. Follow
[ORCHESTRATION.md](ORCHESTRATION.md) and resolve every assignment with
`tools/perf/agent-assignment.mjs` before dispatch; inherited parent effort is not the assignment.

Each implementer owns one hypothesis branch and worktree based on the same round base. It records
the change, counter instrumentation, checks, snapshot updates and artifact hashes. Requirement
amendments accompany the hypothesis; performance fit alone does not approve them.

The measurement runner consumes frozen artifacts in a serial queue. The evaluator computes lane
and fit from recorded evidence. The coordinator reports its result without replacing it with a
model's opinion. Knut merges the round PR.

## Phase transitions

1. **Prepare the round.** Freeze the base SHA, toolchain, sample and browser subset, configuration,
   size buckets, thresholds and measurement method in the run header. Verify reset hooks and
   required instrumentation at startup. Done when every input is addressable and hashed.
2. **Implement and build.** Dispatch independent hypotheses into isolated worktrees. Run each
   candidate's required checks and build its artifacts. Push branches before measurement as P14
   requires. Done when candidate SHAs, artifacts and check results are recorded and workers stop.
3. **Measure candidates.** Acquire the exclusive measurement lock; check for competing workloads
   and log machine load. Only the runner and its measurement children may perform work. Measure
   each candidate against the same base, interleaved per diagram. Measure Pele for the round's
   baseline. Collect instrumented diagnostics separately from acceptance timings. Stop and mark
   contaminated measurements invalid if another workload starts; rerun them when quiet.
4. **Evaluate.** Apply P11/P12 mechanically. Record every candidate, including rejects and
   deferrals. Release the measurement lock before development resumes.
5. **Integrate and build.** Merge fit candidates in gain order, resolving conflicts and updating
   checks/snapshots. This is an implementation phase, outside the quiet measurement window.
   Freeze the combined artifact only after its required checks pass.
6. **Measure the combination.** Enter a new exclusive window. Measure the combination and run the
   round's Chromium comparison including Pele. If it gains less than the best individual, return
   to integration, remove one member, rebuild/check, and remeasure until the interaction is found.
   The final combination must still meet the bucket, correctness and size gates.
7. **Deliver.** Generate the ledger from append-only JSONL, prepare one round PR with kept changes,
   snapshots and required D-rows, and mark it ready after evaluation finishes. Knut merges. The
   kept combination becomes the next base. Apply P2's target and two-empty-round stop rule.

The lock governs the whole session, including agent turns, builds, tests, browsers and other
worktrees. Checking process names alone is insufficient: include the runner's children as allowed
work and detect other CPU activity. Quiet-window enforcement must work on MAI-Max before round 0.

## Correctness and fit

Compare base and head with identical source, configuration and render IDs. Preserve source text;
cache resets happen outside the timed render. The cache policy must explicitly name which caches
are reset and which remain warm, and validate that the reset actually works (P9/P18).

The evaluator assigns the byte-identical lane only when every SVG matches across all 5,000.
Otherwise require exact pixel identity on the fixed 500 in pinned Chromium, fixed fonts, viewport,
device scale, theme and rendering settings. Stabilize fonts and wait for readiness before capture;
any pixel difference fails. Candidate snapshot updates belong in its branch. Both lanes preserve
P4's public surface; pixel identity alone cannot verify IDs, classes, data-ast or custom properties.
The output lane also requires the R-SEC suite. Required checks and the size budget apply to both.

P12 accepts a Node geomean gain above max(0.5%, 3× A/A spread), or at least 5% fewer output bytes
with flat Node time, provided no bucket is more than 1% worse and every other gate passes. Define
the statistical estimators in the run header before use. Missing results, failed renders and
timeouts are explicit outcomes, never silent removal from a candidate's denominator. Sample
eligibility is fixed before the loop and is not re-selected for a hypothesis.

Report both the geomean used for fit and the summed v13/Pele time ratio used for P2's 0.95 target.
Keep R-PERF-10's separate existing bench ratchet. No timing claims from preparation smoke checks.

## Round 0

Run all P10 experiments before any optimization: A/A noise, Pele comparison, trailing-comment
versus reset-hook effect, cache on/off, empty-graph stage split and sample feature counts. Verify
P7's counters and record collection methods/limitations. Allocation bytes must not be inferred
from a simple before/after heap delta. Instruction counts are optional if supported; record why
they are unavailable rather than substituting a different metric. Round 0 does not change behavior.

## Evidence and resumption

Each run header records full base and harness SHAs, runtime and dependency versions, machine/OS,
validation profile, browser and font pins when enabled, sample and browser-subset hashes, configuration, artifact hashes, size
buckets, timing/reset/warmup/repetition policies, A/A spread and frozen thresholds.

`runs/<n>/hypotheses.jsonl` is append-only. Each final entry includes id, round, claim, named
counter, before/after counter values, timing/bytes and sample counts per bucket, lane evidence,
check and size-gate outcomes, verdict with reason, branch/SHA and artifact hashes. Record agent
role, requested/actual model and effort, session id and any escalation reason alongside the assignment. A rejected
hypothesis also records a short description of its discarded change. Keep raw per-diagram
artifacts local; committed entries contain aggregates. `LEDGER.md` is generated from this JSONL.

Checkpoint completed jobs and artifact hashes. On resume, verify those hashes and reuse completed
evidence only for the same frozen inputs; interrupted measurements are rerun. No candidate is
fit while any required evidence is missing. Keep experiment results distinct from infrastructure
failures, contaminated runs and changes awaiting requirement approval.

## Deferral

Record browser-only ideas with `browser-only, deferred` (P13), the reason and the evidence needed
to revisit them. Look changes remain in #281; encoding changes are in this effort. Diagnostic-only
4c records evidence for a later interface decision. An unfit implementation leaves a log entry
and no change in the delivered code. Preserve the branch until its evidence is captured.

After the effort ends, run P13's final base-versus-head Chromium check and report the stopping
reason and outstanding deferrals. Skills may later wrap these commands; the scripts own verdicts.
