# Flowchart performance decisions

P1–P20 were agreed in the 2026-11-09 grilling and transcribed from `HANDOFF.md`.
On 2026-11-10 Knut confirmed that this Mac is MAI-Max (called AI-Max in the handoff).
Historical source findings are not measurements. Read [START.md](START.md) for preparation status
and [LOOP.md](LOOP.md) for execution.

P26/P27 below supersede the idle-host requirement and original fixed CPU limits for round 0.
P27 retains the calibrated total allowance and removes P26's separate per-process restriction.


Scope and target

- **P1. Scope.** Flowcharts only, in a minimal build: `mermaid/slim` (`packages/mermaid/src/slim.ts`) plus `@mermaid-js/diagram-flowchart`, with no other plugin. The baseline is the tip of `mermaid-v13`. The integration PR #297 is ignored. The #265 tickets come back only as ports onto the tip (round 1).
- **P2. Target and stop.** The target is 0.95× of Pele, summed over the sample. The automated loop also stops after two rounds in a row keep nothing. R-PERF-10's ratchet still holds. Earlier work found that byte-identical changes reach about 1.15× on large diagrams and 1.36× on tiny ones (#281), so the target needs the output lane.
- **P3. Output may change, toward the leanest markup for the same picture.** Byte-identity (D200) is not required. "Optimal" means the same pixels with the fewest bytes, elements and style resolutions. Changes to how a diagram looks stay in #281 as Knut's decisions: word breaking, wrap width or font size, shadows, invisible edges, `fa:` icons. #281's encoding items move here.
- **P4. The public surface stays fixed:**
  - the class names (`node`, `edge`, `cluster`, `flowchart-link`, `edge-pattern-*`, `edge-thickness-*`, user `classDef` classes);
  - element ids with the render prefix;
  - the `data-ast` key and its values;
  - the `--mermaid-*` custom properties.

  Changing any of these is a look-type decision (P3). Everything else is free: internal alias names, where paint attributes sit, nesting, redundant attributes, the root style's fallbacks.

Measurement

- **P5. One machine.** All of the work runs on MAI-Max: implementation, building, checks and measurement. MAI-Max is the reference machine for this effort, and Knut runs no other jobs there. Implementing and measuring never overlap: no agent session, `pnpm` command, build, test or browser runs during a measurement window (P14). This replaces D208's M1 Max for this effort only.
- **P6. Sample.** The sample is 5,000 random flowcharts from the 834,276-diagram set. Reuse the lab's 5,000-diagram random sample if it holds only flowcharts. Otherwise redraw with a recorded seed. The hash of the list goes in the log header, and size buckets are reported from it. If the set is user data, the diagrams stay out of the repo and the log records only aggregates.
- **P7. Metric.** Node only. Node warm render time, interleaved head and base on the same diagram, decides. Instruction counts (`perf stat`, if MAI-Max has the counters) and the named counters are diagnostics. These counters are always reported: measurer calls, output bytes, elements, attributes, bytes allocated, scavenge time.
  - Why not Chrome: in Node, `selectMeasurer` (`packages/mermaid/src/measurer.ts:154`) uses the table measurer, so the canvas path never runs. The lab's Chrome-only cost comes from the default font string, which is a look change (P3). Without that change, the only way to cut the cost is fewer measurer calls, and Node counts those.
- **P8. Pele, and the browser.** Pele is measured in each round's baseline, not for every hypothesis. Once per round, the merged result gets one Chromium run (render, insert and `getBBox`, the D204 split) with Pele, so the log shows what the browser side gained.
- **P9. No text mutation to defeat caches.** The harness defeats v13's caches with a reset hook, not by appending `%% run N` the way `packages/bench/src/runner/harness.ts:43` and the old `.tmp/perf-lab` harness do. That comment sends v13 down the source-view hole/copy path (`packages/core/src/parser-kit/source-view.ts:125`) and the token-array copy (`view.ts:22-35`). It also makes detection run v12's comment fallback. Real diagrams without comments pay none of these. Each non-public function the harness relies on, such as the fresh text measurer and the cache reset, is pinned and checked at startup, so a rename fails loudly.
- **P10. Round 0 is measurement only, on the tip:**
  - an A/A run, to get the noise spread;
  - the Pele ratio;
  - the trailing comment against the reset hook;
  - the cache on and off (P18);
  - a stage split of an empty `graph TD`, to locate the 57 µs fixed cost;
  - feature counts over the 5,000: front matter, `%%{init}`, `themeVariables`, `@{…}` shape data, subgraphs, comments, labels wider than the wrap width, labelled edges.

  The results go at the top of the log and weight the hypotheses.

Gates and the bar for fit

- **P11. Two lanes.** The evaluator classifies each hypothesis automatically.
  - *Byte-identical lane:* the SVG is identical to the base on all 5,000.
  - *Output lane:* the result is pixel-identical in a pinned Chromium on a fixed 500 of the 5,000, with no tolerance. The R-SEC spec suite is green. The snapshot updates (`pnpm check`, e2e) are in the hypothesis's own branch.

  Any pixel difference fails the hypothesis. The Chromium version goes in the log header.
- **P12. Fit.** A script decides, not a model. A hypothesis is fit when all of these hold:
  - the Node geomean gain is above max(0.5%, 3× the A/A spread), *or* output bytes drop by at least 5% with Node time flat;
  - no size bucket is more than 1% worse;
  - its lane gate passes;
  - `pnpm check` is green;
  - the size budget holds.

  The thresholds go in the log header and do not change from round to round.
- **P13. Browser-only ideas are deferred.** Anything whose gain or risk shows only in a browser is logged as `browser-only, deferred`: the canvas measurer (T2 #273), font-check caching, DOM insertion. One Chromium check, base against the final head, runs at the end of the effort.

Process

- **P14. Rounds.**
  - Each round has two phases on MAI-Max. In the implement phase, the round's hypothesis sessions run in parallel worktrees, each building and checking its own branch. The measure phase starts only once every branch is pushed and built. Nothing else runs while it lasts: the serial queue measures each hypothesis, then the merged result, then the round's Chromium run.
  - Each hypothesis is implemented in its own worktree and measured on its own against the round's base.
  - When all hypotheses in the round are measured, the fit ones are merged in order of gain, and the combination is measured once.
  - If the combination gains less than the best single hypothesis, members are dropped one at a time until the clash is found.
  - The combination becomes the next round's base.
  - Unfit hypotheses are discarded. Each leaves a log entry and no diff.
- **P15. Roles.** Model/provider assignments below were superseded by P23; role responsibilities remain.
  - *Hypothesis generator:* Opus at high effort. It reads the log, the latest profile and counters, and the source.
  - *Implementers:* Sonnet, one per hypothesis, each in its own worktree on MAI-Max, during the implement phase only.
  - *Measurement:* one serial queue on MAI-Max that builds each branch and measures it while nothing else runs.
  - *Fit:* the evaluator script decides.

  Every hypothesis names the counter it expects to move and a kill condition. The log records whether that counter moved, as well as the total.
- **P16. Round 1 is manual.** It is the set agreed in the grilling (below). The automated loop takes over later, for trimming, with up to 6 hypotheses per round.
- **P17. Delivery.** Each round becomes one PR into `mermaid-v13`. It carries the kept hypotheses, their snapshot updates, the round's log entries, and a D-row for any requirement it amends. It is marked ready when the evaluator has finished, and Knut merges it. A hypothesis that needs a requirement amendment can be fit and still wait for Knut's approval in that PR.
- **P18. Measure uncached renders (clarified by P28).** The performance harness clears `AnalysisCache` before each timed render, outside the timed interval, so repeated benchmark inputs do not receive cache hits. Production caching and `prepare` → `renderSync` reuse remain unchanged. The earlier text incorrectly treated this as a requirement to remove production caching and implement a one-slot replacement; that interpretation is superseded by Knut's clarification in P28.
- **P19. Where things live.** Everything is in `v13/docs/perf/`, not in the main decision log. That log has diagram sessions adding rows all the time, so perf rows would compete with them for D-numbers. The folder holds:
  - `DECISIONS.md` (P-numbers, with one pointer row in `v13/docs/DECISIONS.md`);
  - `LOOP.md`;
  - `runs/<n>/hypotheses.jsonl`, append-only, with one entry per hypothesis: id, round, claim, named counter and how it moved, numbers per bucket, lane, verdict and reason, branch, and for a discard a short description of the change;
  - `runs/<n>/LEDGER.md`, generated from the JSONL.

  A requirement amendment also gets a D-row in the main log, in the round's PR.
- **P20. The harness.** The lab's harness (on the M5, at `~/repos/mermaid-perf-lab`) moves to MAI-Max and is the only measurement function for this effort. `packages/bench` stays the PR and CI gate. One session on MAI-Max ports the harness and adds the reset hook (P9), the counters (P7), the pixel check (P11), the feature counts (P10) and the A/A run. The harness also guards the measure phase. It refuses to start while other `node`, `pnpm`, `claude` or Chromium processes are using CPU, and it logs the machine's load next to each result. Pinning measurements to spare cores is not a substitute, because memory bandwidth, caches and boost clocks are shared. The harness then runs round 0. Implementers start only after round 0 is in the log. The M5 is needed once, to copy the lab harness and the 834k set to MAI-Max. Open fact: from the dev Mac, `ssh MAI-Max` did not resolve on 2026-11-09 (the tailnet looked down).


## Preparation session, 2026-11-10

- **P21. Session boundary.** This session prepares the sample, tooling and instructions together with Knut. Round 0 and the optimization loop run in a new session. Preparation may render diagrams to validate eligibility; those runs are not performance evidence.
- **P22. Corpus location.** Knut supplied `/Users/knsv/repos/diagram-test-data` on MAI-Max. Its 44 `flowchart-*.jsonl` shards contain 834,276 nonempty records. Select a reproducible 5,000-diagram sample here; Knut approved seeded selection of 5,000 diagrams renderable by both minimal v13 and Pele, recording exclusions. Keep source diagrams and record-level results outside Git.
- **P23. Codex execution.** Knut switched the next execution session from Claude Code to Codex on 2026-11-10. This supersedes P15's Opus/Sonnet assignments. The role separation, isolated hypothesis worktrees, exclusive measurement phases and script-owned fit verdict remain. P24 records the accepted model and reasoning policy.

- **P24. Agent effort.** Knut accepted the proposed Codex subagent allocation on 2026-11-10: GPT-6 Astra for all agent roles; high reasoning for coordination, hypothesis generation, review and harness/evaluator engineering; medium for bounded implementation, high for architectural/parser/cache/layout/security work. Each hypothesis has an explicit assignment in [orchestration.json](orchestration.json). Medium tasks escalate to a fresh high-effort worker with an evidence handoff when design questions, persistent correctness failures or unexplained counter results warrant it. Measurement and fit remain scripts, with agent activity paused. [ORCHESTRATION.md](ORCHESTRATION.md) defines dispatch and escalation.

- **P25. Headless Node measurements are independently runnable.** Knut clarified on 2026-11-10 that v13's browser-free operation must extend to the performance harness and authorized completing that path. Use `--node-only` for Node preflight, acceptance and round preparation. This profile still requires repository/security/size checks and real-host quiet-window validation, and preserves the full 5,000-record byte/public-surface gates. Browser acceptance, e2e and the P8/P13 browser diagnostics are deferred with an explicit unverified status; they no longer block Node round 0. The full profile retains them. This separates measurement readiness from browser validation; it does not waive P11 exact-pixel/e2e evidence for an output-changing candidate or attest to completed browser assessment. Formal round 0 and optimizations remain outside the preparation session.

- **P26. Measure with the observed background load plus a 20% buffer.** On 2026-11-10,
  after the original host gate failed and Docker was restarted, Knut explicitly authorized
  using the current load plus 20% because no further applications could be closed. This
  supersedes P5/P14/P20's absolute idle-host requirement and the old 10 ms per-process / 20 ms
  total CPU limits. The coordinator still launches no concurrent agent work, builds, tests or
  browser jobs during measurement; existing background activity may continue inside the
  frozen limits. No additional applications are shut down for this effort.

  Before renderer measurement, 60 consecutive process-snapshot intervals with 1,000 ms waits
  collected background CPU deltas using the existing monitor, excluding only the observation
  process and its descendants. The chosen statistic is nearest-rank p95 of total CPU and of
  the busiest process in each interval; each limit is `ceil(p95 * 1.20)`. Actual observation
  duration was 65.009 seconds including snapshot overhead. P95 was 1,280 ms total and 330 ms
  per process, producing fixed limits of **1,536 ms total and 396 ms per process**. Startup
  still requires three intervals. [BACKGROUND-LOAD.json](BACKGROUND-LOAD.json) records the
  method, raw-evidence hash, prior policy hash and calibration script hash; POLICY.json embeds
  the same provenance. Raw process observations and the old policy are preserved privately.

  These are background-load limits, not an idle-machine claim or renderer performance
  evidence. They do not adapt during a run. Exceeding either limit, inaccessible monitoring,
  interruption or incomplete evidence still invalidates a job. Real-host busy-start and
  during-job contamination tests remain required. Fresh complete Node acceptance under this
  policy must pass before freezing round 0; old failed reports remain failed. The fixed sample,
  browser subset, warmups, paired repetitions, A/A blocks, P12 fit formula, correctness gates,
  runtime pins and browser/e2e deferrals are unchanged. Round 0 and its published report must
  disclose the background-load environment. Stop before round 1 for baseline review with Knut.

- **P27. Apply the background allowance to total CPU only.** On 2026-11-10, Knut confirmed
  that the machine is as quiet as it can be and instructed the coordinator to set the limits
  accordingly, resolving the pending total-only policy question. The measured P26 background
  p95 plus 20% remains **1,536 ms total CPU per interval**. `maxCpuMs` is also 1,536 ms, so it
  imposes no additional per-process restriction: no individual delta can exceed the sum.
  The 396 ms per-process cap was an overly restrictive interpretation of the available host.
  No recalibration, renderer-timing-based threshold selection, or further application shutdown
  is required. The host's current background activity is the accepted measurement environment.

  The original P26 raw calibration and failed/partial run remain preserved. The two completed
  P26 A/A blocks are not reused under P27. Fresh complete Node acceptance and a new formal run
  directory are required before all ten A/A blocks and remaining jobs run under this policy.
  Monitoring still fails closed above the aggregate limit or on inaccessible/incomplete
  evidence. The host negative control now launches enough sibling `/usr/bin/yes` processes
  to exceed the total allowance independently of ambient load (two at 1,536 ms); it must
  prove both busy-start rejection and during-job invalidation. This strengthens the test
  stimulus to match the authorized limit, without skipping or relabelling any check.
  Every other timing, sample, fit, correctness and browser/e2e requirement remains unchanged.


- **P28. Cache reset is a measurement requirement, not production cache removal.** On
  2026-11-10 Knut clarified: "we want to have cache removal only for testing non-cached
  performance. In practice, most of the diagrams will be non-cached when rendering."
  The prior production-removal interpretation of P18 and round-1 hypothesis 3a was incorrect.
  Keep production caching unchanged and clear caches through the existing non-public harness
  reset before timed renders. Round 0 already measures this path; its separate cache-on job
  is diagnostic only. No renderer change, rerun, policy amendment, or P12 exception follows.
  Withdraw 3a as a production-change task. The P18/P12 delivery question is resolved and is
  not a blocker. Round 1 remains unstarted under the original stop-before-round-1 instruction;
  this clarification alone does not authorize starting it. Published generated evidence and
  its frozen policy remain unchanged.
