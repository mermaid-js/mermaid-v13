# Start here: flowchart performance

## Execution status, 2026-11-10

**Formal headless Node round 0 is complete and published.** All 15 jobs completed under P27
in `.tmp/perf-round-0-p27`. See [the generated report](runs/0/REPORT.md),
[aggregate results](runs/0/RESULTS.json), and [baseline review](runs/0/REVIEW.md).
No optimization hypothesis was implemented or evaluated. **Stop before round 1:** review the
baseline with Knut before dispatching implementers. P28 resolves the former P18/P12 question:
cache reset is for measurement only; production cache removal is not required.

The exact freeze prerequisite was `.tmp/perf-validation-p27-20261110-02/acceptance.json`:
`validationProfile: "node"`, `sourceStable: true`, `ready: true`. Node 24.16.0 and pnpm 10.30.3
were pinned; `NODE_OPTIONS` was unset. All 57 harness tests, literal `pnpm check` (895 files,
18,577 tests), security selection, size budgets, and real-host acceptance passed. The header
pins that acceptance report and its logs. Browser validation and e2e remain **pending/unverified**;
this is not full or browser acceptance.

P27 retains the observed-background allowance: 1,536 ms total CPU per 1,000 ms interval,
with the per-process field equal to the total. This is the calibrated p95 plus 20%, not an
idle-host baseline. Eight invalid P27 attempts were retained in the scheduler journal and
archived privately before explicit resumes; none contributes to the report. The ten A/A
blocks and five other jobs have valid completion receipts. Earlier P26 runs and all failed
acceptance evidence remain preserved. The 5,000-record sample, 500-index browser subset,
non-load measurement policy and original preparation work are unchanged.

Key baseline findings: summed v13/Pelé time is **1.46038** (v13 takes 46.04% longer; P2 target
0.95 is unmet). A/A spread is **2.46746%**, setting the fixed P12 speed-gain bar at **7.40237%**.
All ten A/A head/base ratios are below 1 despite identical renderer artifacts; this directional
imbalance is documented for review and is not an optimization gain. Cache-on time is 0.77601
of cache-off by the per-diagram geomean; it is diagnostic only. P28 confirms that the existing
uncached baseline is the intended measurement, with production caching unchanged. Browser validation, output-lane pixel checks and e2e remain unverified.

### Earlier P26 execution evidence (historical; superseded by the completed P27 run)

The round-0 execution session is authorized. Fresh P26 Node acceptance passed in
`.tmp/perf-validation-p26-20261110-02/acceptance.json`: `validationProfile: "node"`,
`sourceStable: true`, `ready: true`. Full-access Node preflight, all 57 harness tests, literal
`pnpm check` (895 files passed, 18,577 tests passed), security, size and all real-host
quiet/busy/contamination checks passed. Earlier failed acceptance reports remain preserved.

Knut had authorized P26: retain current background work and use observed CPU load plus a 20%
buffer. The 60-interval calibration is recorded in [BACKGROUND-LOAD.json](BACKGROUND-LOAD.json);
the P26 policy froze 396 ms per process and 1,536 ms total per interval. No fit or correctness
gate changed. The exact passing acceptance report froze `.tmp/perf-round-0` with all 15 Node
jobs. The runner completed `aa-0`, then invalidated `aa-1` when Docker's VM used 400 ms CPU in
one interval, above the 396 ms per-process limit (total CPU was 840 ms, below 1,536 ms).
After a passing readiness check, an explicit resume completed `aa-1`; `aa-2` was invalidated
by an esbuild spike of 440 ms (860 ms total). Another passing readiness check and resume
again invalidated `aa-2`, at 430 ms for esbuild (730 ms total). Two of 15 P26 jobs completed.
All invalid attempts were archived privately before any resume cleanup. P27 now resolves the
total-only allowance question; the P26 frozen directory remains unchanged. The runner exited
and released its lock; its journal and evidence are retained. Frozen
sources remain unchanged. **At that P26 stopping point, round 0 was incomplete and unpublished.**

Do not alter the old frozen directory or count any invalid attempt as completed. P27 subsequently started
in a new directory after fresh acceptance and completed as recorded above. Browser validation/e2e
remain unverified. Stop before round 1 for baseline review with Knut; P28 resolves the cache-delivery question.

The preparation-session scope and historical inventory below are retained for provenance.
They describe the earlier session, not the current execution status or an instruction to rerun round 0.

## Historical harness preparation status

The earlier preparation-session instruction limited that session to complete infrastructure, acceptance tests and
small rehearsals. **No formal round 0 or optimization may run in this preparation session.**
The harness implementation now exists; [PREPARATION.md](PREPARATION.md) records validation and
blockers, and [NEXT-SESSION.md](NEXT-SESSION.md) contains exact bootstrap, acceptance, rehearsal,
freeze, run/resume and report commands. Formal readiness is not established while required
host/repository checks remain unverified. P25 makes Node measurement independently runnable;
browser checks are separately pending and are not a Node-round-0 prerequisite.

The remainder of this file preserves the original preparation input inventory and decisions.
Statistics are now fixed in [POLICY.json](POLICY.json); counters and scheduling are documented in
[DIAGNOSTICS.md](DIAGNOSTICS.md) and [SCHEDULER.md](SCHEDULER.md).

To launch the next session, use [NEXT-SESSION.md](NEXT-SESSION.md): it contains the startup command,
the prompt to paste and the finish criteria for validating Node acceptance and running round 0.

## Session boundary

Knut asked this session to prepare the next session, on MAI-Max. Do not start round 0 or
optimization work during preparation. Start the execution session with this file, then
[DECISIONS.md](DECISIONS.md), [LOOP.md](LOOP.md) and the round's hypothesis list.

## Preparation plan

| Step | Deliverable | Complete when | Status |
| --- | --- | --- | --- |
| 1 | Locate inputs and establish scope | Corpus, harness and host are identified | Complete: corpus, host and copied lab sources inspected |
| 2 | Freeze sample | 5,000 seeded selections, validation report, fixed 500-image subset and hashes exist locally; reproduction command is documented | Complete: 5,000/5,000 passed both renderers; see SAMPLE.md |
| 3 | Prepare execution documents | Decisions, role instructions, kill conditions and exact measurement policy are reviewable | Drafts prepared; open choices below |
| 4 | Make tooling runnable | Pinned runtime/dependencies, lab harness, reset hooks, counters, evaluator and browser gate pass smoke checks | Implemented; acceptance status and blockers in PREPARATION.md; no formal measurements |
| 5 | Rehearse handoff | A fresh session can locate artifacts, verify hashes and run documented startup commands | Exact commands implemented; end-to-end preparation rehearsal status in PREPARATION.md |

See [SAMPLE.md](SAMPLE.md) for reproduction/revalidation commands and local artifact paths.

## Verified local inputs

- Host: MAI-Max, macOS ARM64 (confirmed by Knut). His normal-terminal preflight reports
  68,719,476,736 bytes (64 GiB) RAM, 10 physical cores and 10 logical CPUs.
  See [ENVIRONMENT-REPORT.json](ENVIRONMENT-REPORT.json) for the user-supplied evidence.
- Checkout at preparation start: `docs/perf-loop-handoff`, `9bee2019c`.
  Its two commits after `f71e9a58b` are handoff documentation. Execution must record a full base SHA.
- Corpus: `/Users/knsv/repos/diagram-test-data`, commit `cd6602701a61cc28e9b62849e4461059c28d5913`.
  44 flowchart shards; 834,276 records; 1,964,518,753 bytes. First-record fields:
  `id`, `type`, `language`, `diagramCode`. Full corpus validity has not been established.
- Installed Pele: `1.13.0`. Installed Playwright test package: `1.62.1`.
- Active Node: `26.7.0`; the repository requests `24.16.0` in `.node-version`.
  Node `24.16.0` is already installed in Volta; `volta run --node 24.16.0 node --version` passed.
  Knut's terminal reports the required pnpm `10.30.3`. The Homebrew launcher version is not
  the effective project pnpm version; the earlier sandbox lookup timed out.
- Chromium `151.0.7922.34` launched, measured SVG geometry and captured a screenshot in Knut's terminal.
  Process inspection and hardware queries also passed there. This agent session's sandbox still
  denies those operations; the execution runner must have the terminal's required capabilities.
- Lab harness is present at `~/repos/mermaid-perf-lab`. Eleven key source files were inspected and hashed; see [HARNESS.md](HARNESS.md).
  Its old sample is also present, but Knut approved the newly selected sample in this preparation session.
- Hindsight tools were not exposed in the preparation session. No memory search or initiative capture was possible.

## Choices to settle before execution

1. Sample eligibility (approved by Knut): seeded random ordering, keeping the first 5,000 diagrams that both
   minimal v13 and Pele render, with exclusion counts. This measures the common renderable population;
   it does not establish support for the entire corpus. Keep original inputs unchanged.
2. Harness: follow [HARNESS.md](HARNESS.md) to port the copied lab. Reset hooks, paired timing,
   quiet-window enforcement, counters and evaluator are implemented; validation status is in PREPARATION.md.
3. Runtime: launch commands through `volta run --node 24.16.0` to use the existing repository pin.
   Repeat the environment check through that launcher in the actual execution environment.
   Fixed-sample revalidation on Node 24.16.0 passed all 5,000 diagrams in both minimal renderers;
   sample and browser-subset hashes are unchanged. See SAMPLE-REPORT.json.
4. Statistics: POLICY.json now freezes A/A spread, “flat”, repetitions, timeout/error handling and
   fixed size buckets. P12's thresholds remain fixed and are bound into each run header.
5. P18/P28: clear caches only in the measurement harness. Production cache removal and the
   proposed one-slot replacement are not required. Hypothesis 3a is withdrawn; no P12 exception is needed.
6. Execution roles are settled (P23/P24): Codex, GPT-6 Astra, high for generation/review and
   medium or high for implementation by hypothesis. Use [ORCHESTRATION.md](ORCHESTRATION.md)
   and its assignment helper at dispatch. Start with bounded concurrency.

## Environment check

Run from the repository root:

```sh
volta run --node 24.16.0 node tools/perf/check-environment.mjs --node-only
```

The Node check reports runtime pins, process inspection and hardware inventory. Omit `--node-only`
for the separate full check that includes Chromium, SVG geometry and screenshot support. It does not run benchmarks or establish a quiet host. Knut's
normal-terminal run passed every check except the active Node version. Volta can select the
already-installed required version without changing the global default. All required Node checks
still need to pass together in the actual execution environment before round 0.

## Codex orchestration

The model/effort proposal is accepted (P24). [ORCHESTRATION.md](ORCHESTRATION.md) defines
explicit subagent dispatch, fresh contexts, independent review and medium-to-high escalation.
[orchestration.json](orchestration.json) is the assignment source consumed by
`tools/perf/agent-assignment.mjs`. Round-1 assignments also appear in the hypothesis table.
No subagents or optimization rounds have been launched during preparation. This helper prepares
spawn settings; the benchmark scheduler and quiet-window enforcement are implemented; real-host acceptance is still required.

The locally installed Codex CLI is 0.167.0 and its model catalog includes `gpt-6-astra`.
Global Codex configuration remains unchanged; every delegated task gets explicit model/effort.

## Preparation validation

The frozen sample also passed both minimal renderers on Node 24.16.0, with unchanged hashes.
Both sample-selection scripts passed syntax checks; JavaScript tools passed ESLint and Prettier.
The sample has 5,000 unique record ordinals and 5,000 unique source hashes. All source hashes,
sample/subset hashes and 500 unique browser indices were verified. Synthetic checks verified
repeatable selection, non-flowchart and invalid-syntax rejection, and corruption rejection.
Full pnpm check has not run; production renderer code is unchanged.

## Documentation delivery

Keep the original HANDOFF.md until its decisions, source findings and delivery tasks have been
preserved and the preparation documents are complete. Its remaining delivery tasks are a ready
PR into mermaid-v13, a linked spec issue, moving #281's encoding scope by comment, and a bug issue
for unprefixed ids. These have not been performed. The source findings remain historical hypotheses,
not verified performance evidence. Publish only aggregate sample results; local artifacts stay ignored.

## First execution-session action

Check this preparation status before launching work. Resolve remaining prerequisites with Knut;
verify the sample, runtime and artifact hashes; smoke-test the runner; then run round 0 during an
exclusive measurement window. Implementers start only after round 0 is logged (P20).
