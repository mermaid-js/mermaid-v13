# Fifth-batch review

Independent review verified 28,666 file hashes, 9,109 frozen source files, the exact
acceptance and scheduler receipts, and all 5,000 timing/output records. No open finding remains.

2a is **unfit**: its observed Node geomean gain is 2.458826%, below the unchanged
7.402371% threshold. All 5,000 SVGs and protected public surfaces match. Every size bucket
passes the regression limit. Both named allocation conditions pass, but neither overrides
P12. No optimization is integrated, and no combination measurement is required.

Normal rendering creates 7,433,113 counted parser objects in the base and 5,036,158 in the
candidate. The counter includes new lazy-result structures, closures/accessors and context
snapshots. Explicitly forcing metadata adds 7,181,290 counted creations in the candidate;
render plus forced metadata totals 12,217,448 versus 7,433,113. These are executed creation
counts, not physical bytes or latency. Public consumer compatibility includes full-sample
forced parse equality, 3,399 targeted passing tests and 8,692 independent differential cases.
The R-PARSE-3/DESIGN §4.2 proposal remains unapproved and is retained as experiment history.

The independent allocation review traversed all 14 renderer sampling profiles and 12
calibration profiles, checked their job/source/artifact pins, and reproduced the estimates.
Median sampled renderer allocation falls from 1,042,068,016 to 1,012,352,464 bytes (2.851594%).
The seven-pass relative ranges are 0.998253% and 0.992978%; maximum calibration errors are
0.831127% and 1.467085%, below the existing 10% calibration limit. This is a JS allocation
estimate excluding native/external memory. Separate serial base/head diagnostic passes are
not interleaved timing, and replicate/calibration spreads are not confidence bounds.

The exact passing Node acceptance is pinned in the frozen header: SHA-256
`c310d32e13c57600f154294362688ea126c346c41f151924e35936f92b84e430`, with
`validationProfile: "node"`, `sourceStable: true`, and `ready: true`. Node 24.16.0,
pnpm 10.30.3 and unset `NODE_OPTIONS` were used. All 57 harness tests, repository checks,
security, size and real-host checks passed. The normal source push passed 18,596 tests.
The first acceptance remains preserved as failed: three harness tests correctly rejected
stale base hashes for the changed API/plugin. Updating just those two reviewed pins and
rerunning full acceptance in a fresh directory repaired the prerequisite without weakening it.

Four serial jobs completed on their first attempt. There were 851 accepted background CPU
observations, with a maximum of 1,120 ms under P27's unchanged 1,536 ms limit. No measurement
attempt was invalidated. All dispatched agents and coordinator work paused during the run.
Docker's backend/VM was absent at startup; existing background processes remained permitted.
The original A/A directional imbalance and exact batch-1 Pelé reference remain disclosed.

Publication reproduces byte-for-byte. All 19 prior publication files and the 362,961-byte
twelve-entry ledger prefix remain unchanged. The original checkout index, HEAD, source,
5,000-record sample and fixed 500-index subset are preserved. Aggregates and evidence hashes
are published; per-record sources, SVGs, timings and profiles remain private.

Twelve optimization hypotheses and the separate 4c diagnostic are now measured. The remaining
1b, 1d and 1e are untested; 3a is withdrawn. These are five batches in round 1, not five completed
empty rounds. Browser validation and e2e remain pending/unverified. The measurement window is
closed; no next batch is underway.

Reviewers: `/root/review_batch4` and `/root/review_hop4`, GPT-6 Astra, high effort.
Source, target-pin, adapter, counter and final audit records remain in
`.tmp/perf-round1-batch5-20261111`.
