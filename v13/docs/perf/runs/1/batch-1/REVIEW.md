# First-batch review

Independent review completed after the serial runners exited. The reviewer verified all ten
accepted job receipts and 30,328 underlying file hashes, recomputed the gains, and found no
unresolved issue. Each candidate passed Node acceptance and all 5,000 byte/public-surface
comparisons. No public per-record sources, SVGs or profiles were found. Round-0 publication
hashes and baseline sources are unchanged.

The observed gains do not pass the frozen 7.40237% threshold. They do not establish a deliverable
speedup, especially given the disclosed round-0 A/A directional imbalance. 5b additionally
fails its original named-counter condition because width and metrics calls stay flat. No gate
was waived. All three candidates are rejected and remain preserved on their evidence branches.

Docker was stopped between candidate timings and the final diagnostics/reference jobs. The
same P27 limits applied throughout. Six invalid attempts were excluded and archived. The
accepted candidate timing receipts remain unchanged.

This completes only the first batch of round 1. No candidate is integrated, no combined render
change is proposed, and the untested hypotheses remain open. Do not count this batch as a full
empty round toward P2's two-empty-round stopping rule. Browser validation and e2e remain
pending/unverified. Production caching remains unchanged.

Reviewer: `/root/review_p26`, GPT-6 Astra, high effort. Assignment and review records are preserved
in `.tmp/perf-round1-batch1-20261110/assignments.json` and `reviews.json`.
