# Harness preparation evidence

Scope: finish infrastructure, acceptance tests and small rehearsals. Formal round 0 and
optimization implementation are excluded from this session by Knut's latest instruction.

Status: **not ready for formal measurement**. The infrastructure is implemented and the final
small Node-only rehearsal passed. Required real-host checks and the literal repository check
remain blocked by this session's permissions. Browser validation is separately pending and is no
longer a prerequisite for Node round 0 (P25). No formal round-0 results or optimizations exist.

Implemented commands and execution sequence are in [NEXT-SESSION.md](NEXT-SESSION.md).
Collection definitions are in [POLICY.json](POLICY.json), [DIAGNOSTICS.md](DIAGNOSTICS.md) and
[SCHEDULER.md](SCHEDULER.md). No preparation timing is performance evidence.

## Implemented infrastructure

- Immutable minimal v13/Pele timing and separate diagnostic builds, full source/artifact hashes,
  independent custom target-pin files, and fail-closed target/manifest verification.
- A non-public analysis reset registry; production cache policy and public API keys are unchanged.
  Tests prove repeated unchanged source reparses after reset and hits the cache when requested.
- Seven paired observations after three warmups, fixed buckets and frozen P12 estimators;
  a serial scheduler, live-owner lock, contamination invalidation and resumable hashed evidence.
- P7 width calls, SVG bytes/elements/attributes, calibrated sampled JS-heap allocation estimates
  and separately attributed scavenge/other pauses; all P10 features and empty-graph stage splits.
- Byte equality, protected public surfaces, exact pinned Chromium RGBA comparisons, deterministic
  fit evaluation, and source/check/size/window evidence requirements. Original A/A reference pins
  are preserved across later candidate bases; a worker flag alone cannot establish a quiet run.
- Freeze/run/resume/report commands with private raw evidence and aggregate-only published output.
- Explicit Node and full validation profiles. Node preflight and the round launcher do not import
  browser code; Node jobs never launch Chromium or scan fonts. Node acceptance retains host,
  repository, security and size checks. Full acceptance cannot consume Node-only evidence.
  Node reports explicitly retain unverified browser validation; output-lane pixel/e2e requirements
  in the evaluator remain unchanged.

## Observed validation

The final acceptance command is:

```sh
PATH="$PWD/.tmp/perf-tools/bin:$PATH" env -u NODE_OPTIONS \
  volta run --node 24.16.0 node tools/perf/run-checks.mjs --node-only \
  --out .tmp/perf-preparation/acceptance-node-final
```

Its authoritative local report is `.tmp/perf-preparation/acceptance-node-final/acceptance.json`.
Individual logs remain alongside it; PREPARATION-RESULTS.json retains aggregate outcomes and hashes.
A failed or unverified required Node check cannot authorize formal preparation. The report has
`validationProfile: "node"`, `sourceStable: true`, `ready: false` and `fullReady: false`. Its source
fingerprint matches the final rehearsal and current code. The earlier full-profile attempt is
preserved under `.tmp/perf-preparation/acceptance-frozen/`; its browser failures remain historical
evidence, not a claim of current browser validation.

| Check | Observed outcome |
| --- | --- |
| Harness acceptance | 57 passed, zero skipped; includes Node/full isolation, missing host checks, stale logs, browser-import prohibition, output gates, failure, corruption, timeout, resume and evaluator-proof cases |
| Fixed sample | All 5,000 source hashes and the fixed 500-index subset verified unchanged |
| End-to-end rehearsal | All seven jobs completed on the first 16 unchanged sample records; no performance claims |
| Resume and regeneration | Completed jobs reused; scheduler journal SHA unchanged; raw hashes verified by report regeneration |
| Repository lint, Knip and type checking | Passed before the literal `pnpm check` reached blocked tsx IPC |
| Direct dependency/license/config/grammar checks | All four passed through `node --import tsx`; this does not make literal `pnpm check` green |
| Security selection | 3,136 passed, 35 skipped, two todo in the final acceptance run |
| Production size | Core 94,360 gzip bytes ≤ 98,304; loaded core+flowchart 129,675 ≤ 131,072 in the final acceptance run |
| Environment | Node/pnpm pins pass; process inspection and hardware query are denied; no Chromium launch attempted |
| Real-host quiet/busy/contamination acceptance | Unverified: `/bin/ps` fails with `EPERM` before the test workload starts |
| Real Chromium acceptance | Deferred by the Node profile; earlier full-profile launch was denied; synthetic pixel tests do not replace it |
| Repository e2e | Deferred by the Node profile; earlier full-profile attempt was blocked by server IPC (`listen EPERM`) |
| Literal `pnpm check` | Not green: `check:deps` cannot create the tsx IPC socket (`listen EPERM`) |

The formal preparation command requires a current report with `ready: true`, a matching validation profile, all required passing
exit codes and unchanged log/source hashes. It will reject the reports from this session.

## Small rehearsal evidence

Final run directory: `.tmp/perf-preparation/rehearsal-node-final/`.

- `header.json`, `queue.json` and `jobs/` freeze every input and the explicit rehearsal scope.
- `raw/` contains two A/A plumbing blocks, Pele/comment/cache comparisons, diagnostics and gates.
- `completion.json` and `scheduler.jsonl` record seven completed jobs.
- `rehearsal-summary.json` verifies evidence and intentionally omits all performance numbers.
- `raw/diagnostics/result.json` reports every required counter/method and feature, plus allocation
  calibration. Maximum observed calibration error was about 0.658%, below the fixed 10% rejection
  limit; this is method validation, not a renderer performance result.

The journal SHA-256 before and after a completed-run resume was identical:
`bac8645be1b180a855739e422a0af75ab3bc7aa531fabcb0d7e0df16fb92a5c4`.
Report regeneration also produced identical bytes. The Node header has a null browser pin; its
queue has no browser job, and its report keeps browser validation unverified.
An earlier freeze was deliberately invalidated by subsequent code edits; startup rejected it
with `Workspace changed since freeze` (`.tmp/perf-preparation/stale-freeze-rejected.log`).

## Broader repository test findings

The direct full Vitest attempt recorded 886 passing files, nine failing files and five skipped
files; 18,462 tests passed, four failed, 180 skipped and two todo. Its raw log is
`.tmp/perf-preparation/vitest-all.log`. It was not a green full-suite run.

Investigated failures:

- Dev-server suites cannot bind loopback sockets in the sandbox; cleanup errors follow those
  failed starts. This is still a blocker requiring the permitted execution environment.
- Five ignored leftover directories (`diagram-block`, `diagram-ishikawa`, `diagram-requirement`,
  `diagram-treeview`, `diagram-usecase`) contained only `node_modules`, without package sources.
  They confused directory-scanning tests. They were preserved, not deleted, under
  `.tmp/perf-preparation/orphan-packages/`. The three affected suites then passed all 49 tests;
  see `retry-orphan-directories.log`.
- The first direct full-suite command inherited the Homebrew pnpm launcher; release packing
  tried to fetch the project pnpm pin and failed. With the checkout-local pinned launcher,
  release tests and the isolated flowchart-layout timeout rerun passed all 12 tests; see
  `retry-local-failures.log`. The timeout was not treated as a renderer regression or speed result.

Logs for the four direct script checks are `.tmp/perf-preparation/check-*-direct.log`.
No repository expectations, test timeouts or gates were weakened to obtain these results.

## Remaining execution blockers

This session has restricted filesystem/process/socket access and an approval policy that cannot
request escalation. The failed environment checks are actual launch-session evidence, not inferred
from the earlier preparation session. `NEXT-SESSION.md` starts with the exact environment and
Node acceptance commands and a conditional launch prompt. Run them in a MAI-Max session with
process inspection, hardware query and local IPC/loopback permissions. Keep Node readiness false
until every required Node check passes; then freeze a new run directory. No new optimization work
belongs to this handoff.

## Earlier preparation agent assignments

Assignments were resolved with `tools/perf/agent-assignment.mjs --role harness-engineer`.
All dispatched workers used explicit `gpt-6-astra`, `high`, `fork_turns: none`; the tool accepted
these configured settings. The configured coordinator is Astra/high. No optimization implementer
was dispatched and no escalation or model substitution occurred.

| Agent/session path | Bounded responsibility |
| --- | --- |
| `/root/artifacts_reset` | Immutable builds, non-public reset hooks, diagnostics and counter methods |
| `/root/gates_evaluator` | Exact output/public-surface/browser gates, evaluator, independent report review |
| `/root/scheduler_timing` | Serial timing, quiet windows, checkpoints, independent diagnostic review |

At most three workers ran alongside the coordinator (four available slots). All activity was
preparation; no formal measurement window was entered. Hindsight tools were not exposed in the
tool inventory, so memory search/capture was unavailable.

The final Node-only follow-up was implemented and validated by the coordinator without new agent
dispatch. The browser profile is retained; no browser failure was relabelled as a pass. The final
readiness blocker is execution access for required Node checks, not missing Node harness code.
