# Round 1, second batch

Knut authorized 1a, 3c and 4b after reviewing the first-batch results. All three candidates
start independently from `094ec5283059b7a87c2c2745ea6dffcc5a4dcee7`. No first-batch optimization
is included. The fixed 5,000-record sample, 500-index browser subset, P27 host limits and
P12 7.40237% gain threshold remain unchanged. Production analysis caching and prepare-to-render reuse stay intact. Hypothesis 1a includes its
planned one-value attribute-escaping memo.

| Hypothesis | Mechanism | Agent | Model | Effort |
| --- | --- | --- | --- | --- |
| 1a | Cheaper escaping and attribute validation | /root/round1_1a | GPT-6 Astra | high |
| 3c | Remove repeated analysis/text passes in render | /root/round1_3c | GPT-6 Astra | high |
| 4b | Reduce layered-layout wrappers and track-set work | /root/round1_4b | GPT-6 Astra | high |

Each implementer first confirms the targeted work and declares counters. Source review,
fresh Node acceptance, committed/pushed candidate SHAs and artifact freeze precede serial
measurement. All other agent work, builds, tests and browser jobs stop for measurement.
A candidate must pass its original counter condition and all frozen fit/correctness gates.
Browser validation and e2e remain pending unless separately performed.

The accepted round-1 Pelé reference from batch 1 remains available for the same frozen base;
any reuse will retain its exact receipts and disclose its measurement environment. Invalid
attempts remain excluded and preserved. Round 0 and batch 1 are immutable evidence.

Private orchestration root: `.tmp/perf-round1-batch2-20261110`. Assignments record explicit
model and effort. Hindsight tools were not exposed at dispatch. The batch completed all nine accepted jobs. Source review and fresh Node acceptance passed
for all three candidates; the exact reports are pinned in their headers. 1a’s first host-failed
acceptance remains preserved; its fresh `-02` report was used for freezing.

| Candidate | Commit | Node gain | Verdict |
| --- | --- | ---: | --- |
| 1a | `cc0a741ea151350a95473cbe7c63bcb89db87ab9` | 2.251% | unfit |
| 3c | `852f2d101d48eb3fba01bba15df403a530b64d20` | 2.405% | unfit |
| 4b | `37937084a038e922820a58ebb9cc857ca13cec48` | 2.702% | unfit |

All named counter conditions pass, all 5,000 SVGs are byte-identical, and all gains fall below
the fixed 7.40237% threshold. 1a reduces explicit regex tests and allow-list lookups while
increasing replacement passes; [the report](batch-2/REPORT.md) discloses both. No candidate is
integrated and no combination measurement is required for this rejected batch.

Docker’s VM/backend was absent; only its idle privileged helper remained. P27’s existing
background allowance and monitoring stayed unchanged. One 1a correctness attempt and one 3c
timing attempt were invalidated, archived, and excluded before explicit resumes. A failed
readiness check also remains preserved. The exact accepted round-1 Pelé reference from batch 1
is reused with its receipts and original environment disclosure.

[Aggregate results](batch-2/RESULTS.json), [independent review](batch-2/REVIEW.md), and the
[cumulative ledger](LEDGER.md) retain the evidence. Publication reproduces byte-for-byte.
The candidate branches are pushed; documentation is delivered through
[PR #658](https://github.com/mermaid-js/mermaid-v13/pull/658). Browser validation and e2e remain
pending/unverified. No runner is active. Other hypotheses await the next batch selection.
