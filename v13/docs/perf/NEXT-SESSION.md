# Next session: validate Node execution access, then headless round 0

> Current execution checkpoint: round 0 is complete. Round 1’s first three batches
> (2b, 1c, 5b; 1a, 3c, 4b; 3b, 4a, 5a) have been measured and rejected. See [START.md](START.md)
> and the reports for [batch 1](runs/1/batch-1/REPORT.md), [batch 2](runs/1/batch-2/REPORT.md),
> and [batch 3](runs/1/batch-3/REPORT.md). No runner is active; the measurement window is closed.
> Preserve all frozen evidence. Do not rerun round 0 or redispatch rejected candidates.
> Remaining hypotheses await the next batch selection. Browser/e2e validation remains pending.
> The round-0 launch instructions below are retained for provenance.


**Completed on 2026-11-10:** formal headless Node round 0 is published at
[runs/0/REPORT.md](runs/0/REPORT.md), with [baseline review](runs/0/REVIEW.md).
[START.md](START.md) records the exact passing acceptance and completed P27 run. The workflow
below is retained for reproducibility; do not overwrite earlier acceptance or frozen runs.
Stop before round 1 for baseline review with Knut. P28 resolves the former P18/P12 question:
cache reset is for measurement only; production caching stays unchanged.
Browser validation and e2e remain pending/unverified.

## Execution policy amendments: P26/P27

Knut authorized the observed background CPU load plus a 20% buffer on 2026-11-10. Read P26/P27 in
[DECISIONS.md](DECISIONS.md) and [BACKGROUND-LOAD.json](BACKGROUND-LOAD.json). POLICY.json now
freezes 1,536 ms total per snapshot interval, with no additional per-process restriction.
The per-process field equals the total limit. Existing background activity
is permitted within those limits; the coordinator still launches no concurrent work during the
serial run. References below to exclusive/quiet windows use this P26 scope. Do not close further
applications, recalibrate after seeing renderer timings, skip monitoring or relabel failed checks.
Use fresh acceptance under the amended policy; previous failed acceptance reports remain evidence.
The interrupted P26 run `.tmp/perf-round-0` remains historical; use a fresh directory such as
`.tmp/perf-round-0-p27` for P27 and never reuse its completed blocks under the changed policy.

## Scope and status

The preparation session implements the complete harness and runs acceptance tests and small
rehearsals only. **Do not run formal round 0 or implement optimizations in that session.**
The next execution session runs the commands below; it should not need to implement infrastructure.

Read [PREPARATION.md](PREPARATION.md) for the latest observed checks and blockers. The harness is
**not ready for formal measurement until every required acceptance result is verified**. The
current restricted session cannot inspect host processes, query hardware or open the IPC sockets
used by repository checks. A previous normal-terminal success does not establish that the next
agent's runner has those capabilities. Chromium is not a prerequisite for Node measurement.

The explicit `--node-only` profile requires environment, harness, repository, security, size and
real-host quiet checks. It defers browser acceptance and e2e, records them as `unverified`, and
never attests to full browser validation. The full profile (omit `--node-only`) retains all checks.
See P25 in DECISIONS.md; exact-pixel gates for output-changing candidates remain mandatory.

## Prompt for the next execution session

> Follow `v13/docs/perf/NEXT-SESSION.md` in this checkout. Use the headless Node profile. Preserve
> the frozen sample, uncommitted preparation work and measurement policy. First run the Node
> preflight and acceptance commands in this execution session. Only if the current Node
> acceptance report has `ready: true`, freeze and run formal round 0 during an exclusive
> measurement window, then publish and review its baseline report. Browser validation remains
> explicitly pending. Stop and report any failed prerequisite; never skip or relabel it. Do not
> implement optimizations or start round 1: baseline review with Knut comes first. P28 clarifies
> that cache reset is only for measurement; there is no production cache-removal decision pending.

This prompt starts the baseline stage of the loop, not unattended optimization. No infrastructure
implementation should be needed. Use a session whose supported permissions allow `ps`, `sysctl`,
local IPC and loopback sockets for repository tests; the current restricted session cannot grant
those capabilities. Keep this checkout on MAI-Max.

Use this existing checkout on MAI-Max. The fixed local sample and preparation work must be
preserved; do not redraw the sample or discard uncommitted files. Read [DECISIONS.md](DECISIONS.md),
[HARNESS.md](HARNESS.md), [POLICY.json](POLICY.json), [SCHEDULER.md](SCHEDULER.md),
[DIAGNOSTICS.md](DIAGNOSTICS.md), [EVALUATOR.md](EVALUATOR.md), [LOOP.md](LOOP.md), [ORCHESTRATION.md](ORCHESTRATION.md), and
[SAMPLE.md](SAMPLE.md). The old HANDOFF.md and lab NEXT-SESSION.md are historical inputs.

## 1. Select installed runtime tools

Run all commands from `/Users/knsv/repos/mermaid-v13-perf`:

```sh
cd /Users/knsv/repos/mermaid-v13-perf
git status --short
unset NODE_OPTIONS
volta run --node 24.16.0 node tools/perf/bootstrap.mjs
export PATH="$PWD/.tmp/perf-tools/bin:$PATH"
volta run --node 24.16.0 node tools/perf/check-environment.mjs --node-only
```

The runner rejects extra Node flags and `NODE_OPTIONS` so timing and diagnostic children use
the documented runtime settings; the preparation environment supplied an 8 GiB heap override.
`unset NODE_OPTIONS` affects this terminal only. Runtime versions and flags are saved in the header.

Bootstrap creates only a Git-ignored checkout-local launcher for the already-installed pnpm
10.30.3. It avoids the Homebrew pnpm 11 launcher, which timed out while resolving the project's
pin in the restricted session. It does not download packages or change global configuration.
If the local pnpm store moved, set `PERF_PNPM_CLI` to the installed 10.30.3 `bin/pnpm.cjs` and rerun.

Require Node, pnpm, process inspection and hardware inventory checks all to pass in this exact
execution session. Chromium is neither imported nor launched by Node preflight. Repository tests
also need local IPC and loopback sockets. If permissions deny these operations, stop formal work
and record the exact failure. Runtime selection does not grant permissions; do not skip checks.

## 2. Run Node acceptance

Use a fresh output directory. Do not run other builds or change source while this command runs:

```sh
volta run --node 24.16.0 node tools/perf/run-checks.mjs --node-only \
  --out .tmp/perf-validation-next
```

This runs Node environment preflight, all harness tests, literal `pnpm check`, explicit security
tests, production size budgets, and real-host quiet/busy/contamination checks. Logs, exit codes,
hashes and the workspace fingerprint are saved in `.tmp/perf-validation-next/acceptance.json`.
Each command has a 30-minute timeout. Failures are retained and all Node checks are attempted.
Stop coordinator-dispatched work while acceptance runs, especially during real-host quiet checks.
P26's existing background workload may remain.

Proceed only when `validationProfile: "node"`, `sourceStable: true` and `ready: true`. A passing
Node report still has `fullReady: false`, `browserValidation: "unverified"`, and unverified browser/e2e
rows. These are separate pending browser checks, not Node failures or successful browser checks.
`ready: false` is never approval to measure. The formal launcher checks every required exit code,
log hash, source fingerprint and matching profile; changing just the readiness flag cannot pass it.

Synthetic tests cover slow candidates, missing evidence, protected ID changes, exact pixel
differences, contamination, changed artifacts/sample, timeouts and interrupted/resumed jobs.
Real-host integration must also pass on the actual execution host; synthetic tests cannot replace it.

## 3. Optional small end-to-end rehearsal

This is the only timing-like work allowed in the preparation session. It uses the first 16
unchanged records from the frozen sample, two A/A plumbing blocks, each P10 comparison, P7
sampling/GC/counter diagnostics, and byte/public-surface gates. Every result is labelled rehearsal;
performance numbers are deliberately omitted from its report and cannot establish fit.

```sh
volta run --node 24.16.0 node tools/perf/round.mjs prepare \
  --rehearsal --node-only --out .tmp/perf-rehearsal-next
volta run --node 24.16.0 node tools/perf/round.mjs run \
  --out .tmp/perf-rehearsal-next
volta run --node 24.16.0 node tools/perf/round.mjs report \
  --out .tmp/perf-rehearsal-next
```

For a separate browser rehearsal, replace `--node-only` with `--browser` and use a fresh directory.
Never combine these flags. Rehearsal timing explicitly skips host quiet enforcement; its output
is never formal measurement evidence. Node runs contain no browser job, browser launch or font
inventory. The fixed browser subset remains hashed so a later browser run can reuse it unchanged.

## 4. Freeze formal round 0 (next execution session only)

Only after Node acceptance reports `ready: true`, freeze a new run directory:

```sh
volta run --node 24.16.0 node tools/perf/round.mjs prepare --node-only \
  --acceptance .tmp/perf-validation-next/acceptance.json \
  --out .tmp/perf-round-0-p27
```

Preparation verifies all 5,000 original source hashes and the fixed 500-index subset against
SAMPLE-REPORT.json. It builds minimal v13/Pele timing and diagnostic artifacts, checks reset
behavior, pins sources/artifacts/runtime/configuration and the Node validation profile, and creates `header.json`,
`queue.json` and immutable job configurations. Source changes after acceptance or freezing fail
startup. Builds are separate from measurement. Dirty working-tree contents are recorded by hash;
changing a frozen artifact or source is rejected. Run and report read the frozen profile; do not
pass `--node-only` again to those commands. The full profile cannot consume Node-only acceptance.

The policy is fixed before timings: three warmups, seven alternating pairs per record, ten
independent whole-sample A/A blocks, median per record, geomean ratios, fixed source-byte buckets,
30-second render timeout, zero automatic timing retries. A failure invalidates its whole job;
records are never dropped from the denominator. A/A spread instantiates P12's fixed threshold.
See POLICY.json for exact estimators and DIAGNOSTICS.md for sampling error and GC pause scope.

## 5. Enter the exclusive measurement window

Finish implementation/review work and stop coordinator-dispatched builds, tests and browser jobs
first. Every agent dispatched for this effort, including the coordinator, must remain idle while
the serial runner is active. P26 permits the observed background workload. Do not run
diagnostics, search files or dispatch work during the window. If the tool yields a live process
handle, wait on that same handle; a polling timeout is not a failed or stopped run.

```sh
volta run --node 24.16.0 node tools/perf/round.mjs run --out .tmp/perf-round-0-p27
```

The queue runs the ten A/A blocks, Pele comparison, trailing-comment/reset comparison, cache
on/off, P7 counters and allocation/GC diagnostics, empty-graph stage split, P10 features, full
byte/public-surface gates. Browser/Pele split diagnostics remain pending. Only the explicit trailing-
comment experiment mutates source. No optimization is implemented.

The scheduler checks host activity before every job and monitors it throughout. Inaccessibility,
busy startup, contamination, missing evidence or changed inputs fail closed. A contaminated or
interrupted job remains invalid. After the cause is resolved, rerun the **same** command to resume:
completed jobs are reused only after all hashes verify; partial jobs restart and cannot create
duplicate final records. Do not rebuild or modify the frozen directory. If inputs change, freeze
a new directory and retain the old evidence.

## 6. Reproduce and review the report

After the runner has exited and released its lock:

```sh
volta run --node 24.16.0 node tools/perf/round.mjs report \
  --out .tmp/perf-round-0-p27 --publish v13/docs/perf/runs/0
```

The report verifies queue completion, every raw evidence hash, full sample/subset coverage,
Node correctness gates, P7 counters and policy/header identities. It writes aggregate RESULTS.json, source/artifact pins in ARTIFACTS.json, HEADER.json,
REPORT.md and the empty optimization LEDGER.md/hypotheses.jsonl. Per-record SVG, RGBA, profiles,
GC traces and timings stay in the Git-ignored run directory. No diagram contents enter the report.
Rerunning `report` regenerates the same results from raw evidence without a model. Published Node
reports explicitly retain `browserValidation: "unverified"`; no browser result is inferred.

Review the raw references, noise spread/threshold, buckets, Pele summed ratio, feature counts,
collection methods and pins. Report the 0.95 target separately from the actual ratio. Do not infer
any gain from the preparation rehearsal or historical lab numbers. Update START.md after verified
round-0 completion. Keep optional unavailable hardware instruction counts explicitly labelled.

Stop before round 1 for baseline review with Knut. P28 withdraws production cache-removal
hypothesis 3a and resolves the former P18/P12 delivery question without changing any fit gate.

## Separate browser validation

Browser checks are required for the output-changing lane and the full browser assessment, not for
headless Node round 0. To validate that separate path later, run in a browser-capable session:

```sh
volta run --node 24.16.0 node tools/perf/run-checks.mjs \
  --out .tmp/perf-validation-browser-next
```

The command without `--node-only` runs the original full acceptance profile, including real
Chromium and e2e. After it passes, a fresh `round.mjs prepare` without `--node-only` uses full
acceptance and freezes the browser/font pins and browser job. Do not retrofit a browser job into
a completed Node queue or silently claim the Node baseline established pixel equivalence for
changed markup. The evaluator still rejects output-lane candidates missing exact pixels or e2e.
