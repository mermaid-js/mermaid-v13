# Round 1, fifth batch

Knut authorized hypothesis 2a after the four completed batches: implement, independently
review, measure and publish the parser-sink/lazy-AST experiment. Requirement amendments
remain proposed until Knut reviews them before delivery. No other hypothesis is dispatched.

The implementation starts from the same frozen round base,
`094ec5283059b7a87c2c2745ea6dffcc5a4dcee7`, in
`/Users/knsv/repos/mermaid-v13-perf-round1-2a` on `perf/round-1-2a-20261111`.
The original preparation checkout, all earlier reports, the 5,000-record sample, fixed
500-index browser subset and measurement policy are preserved.

The experiment avoids building parser structures that rendering does not consume, while
preserving model construction, diagnostics, stable IDs, and public access to AST, symbols,
statements and tokens. Editor, extension, resource-discovery, interaction, ASCII, cache,
serialization and freezing behavior require explicit review. Direct public parsing remains
compatible. The production render path determines whether those structures are needed;
the benchmark will not bypass production access solely to improve its result.

Executed creation counts include newly introduced sink/lazy structures and functions, with
categories and limitations disclosed. They are separate from sampled allocation bytes.
Formal P7 allocation diagnostics compare the candidate with a fresh diagnostic pass over
the same frozen base; calibration and replicate spread remain visible. The candidate must
pass its named allocation conditions, unchanged P12 fit rules, all correctness checks,
fresh Node acceptance and independent review. A measured gain does not approve an amendment.

| Role | Agent | Model | Effort |
| --- | --- | --- | --- |
| Implementer | /root/round1_2a | GPT-6 Astra | high |
| Independent source/evidence reviewer | /root/review_batch4 | GPT-6 Astra | high |
| Independent counter/allocation reviewer | /root/review_hop4 | GPT-6 Astra | high |

Status: complete. The candidate source is committed as
`5b6ca5e2c681ba844f8bd3de5fb02e4276f6ef7e`; reviewed target-pin maintenance produces the
measured head `b096c2a90f32b8476e8a1bf1bd53e467ce456c0a`. Normal commit/push hooks passed,
including 18,596 tests. Fresh Node acceptance, artifact freeze and all four serial jobs passed.
The [published report](batch-5/REPORT.md) records a **2.459%** Node geomean gain, below the
unchanged **7.40237%** threshold: **unfit**, no optimization integrated. Named allocation
conditions pass, all buckets remain within the regression limit, and all 5,000 SVGs are
byte-identical. The four jobs completed on their first attempt; no measurement was invalidated.
All dispatched agents, builds, tests and browser jobs were idle during the serial window.
The window is now closed. Browser validation and e2e remain pending/unverified.
The remaining 1b, 1d and 1e hypotheses are not started; 3a remains withdrawn.

Private evidence root: `.tmp/perf-round1-batch5-20261111`. Earlier publication hashes and
the twelve-entry ledger prefix are saved there. Hindsight tools were not exposed by tool
discovery, so the initiative could not be recorded through that service.

The final executed count is 7,433,113 → 5,036,158, or 73.306 → 49.667 per fixed node
(101,398 nodes; 106,917 edges). All four plain/instrumented base/head SVGs and fully forced
prepared parse results match across 5,000 records. Forcing deferred metadata after rendering
adds 7,181,290 counted creations to the candidate and zero to the already-eager base;
render plus forced metadata therefore totals 12,217,448 versus 7,433,113. These are counted
creation sites, not physical bytes or measured latency. The separate P7 check passes, but
P12 rejects the candidate.

Source validation includes 3,399 passing targeted tests, three package typechecks, lint and
format checks. Independent review added 8,692 baseline differential cases. The candidate’s
[proposed amendment](proposals/2a.md) remains pending Knut; no normative requirement was changed.

Review fixed the counter collector’s baseline reconstruction after commit, added an omitted
`Object.create` site, and strengthened normalization to bind every compiled dependency to
current candidate bytes or frozen-base Git blobs. Earlier preparations remain preserved.
A targeted test run using Node 26 in child CLIs was retained and rerun successfully with
Node 24.16.0 first on PATH. Missing worktree-local Husky launchers were repaired before the
final commit was recreated with successful normal hooks; the earlier attempt is retained.

Fresh acceptance `.tmp/perf-validation-round1-02/acceptance.json` in the candidate worktree
has `validationProfile: "node"`, `sourceStable: true`, and `ready: true`; its SHA-256 is
`c310d32e13c57600f154294362688ea126c346c41f151924e35936f92b84e430`.
All 57 harness tests, repository checks, security, size budgets and real-host checks pass.
Node 24.16.0 and pnpm 10.30.3 are pinned; `NODE_OPTIONS` is unset. Browser/e2e remain unverified.
The earlier acceptance failed three harness tests because the non-public target manifest
still pinned the base API/plugin hashes. It remains preserved with `ready: false`. Updating
only those two hashes to the independently reviewed candidate bytes repaired the prerequisite;
all seven affected tests passed before a complete fresh acceptance. No integrity check was removed.

Fresh P7 base/head diagnostics estimate median renderer allocations of 1,042,068,016 and
1,012,352,464 bytes, a **2.852%** reduction. Seven-pass relative ranges are 0.998% and 0.993%;
maximum calibration errors are 0.831% and 1.467%. These are sampled JS estimates, not exact
physical bytes or confidence bounds; native/external allocations are excluded. Base and head
are separate serial diagnostic jobs, not interleaved acceptance timings. The exact original
A/A noise and round-1 Pelé reference remain unchanged, including the A/A directional imbalance.
The pending R-PARSE-3/DESIGN §4.2 proposal is retained for review history, without approval
or a requested delivery decision for this rejected experiment.
