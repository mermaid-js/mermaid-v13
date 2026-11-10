# Second-batch review

Independent review completed after every serial runner exited. The reviewer verified nine
accepted candidate job receipts plus the exact reused Pelé receipt, 178,176 input-hash
references, 30,328 nested-hash references, 67,257 unique files, and 1,533 quiet observations.
The reviewer independently recomputed the gains and verified all 15,000 candidate gate
records as byte-identical. No unresolved finding remains.

All three candidates pass their original named-counter conditions and Node correctness,
security, size and acceptance gates. Their observed gains (1a 2.251%, 3c 2.405%, 4b 2.702%)
remain below the frozen 7.40237% threshold, so all are unfit. Round-0 A/A directional imbalance
remains disclosed; no noise correction or fit exception was introduced. 1a’s replacement
passes increased even though its explicit regex tests and allow-list lookups fell. That
tradeoff remains visible in the report and does not alter the named-counter condition.

Two invalid job attempts are archived and excluded: 1a correctness and 3c timing. The 1a
archive also preserves an already-valid timing result; that valid receipt was retained and
only its later failed correctness job was rerun. A failed readiness check remains preserved.
No invalid result contributes to the accepted evidence. Docker’s VM/backend was absent and
P27’s limits stayed unchanged. The original round-1 Pelé reference and its environment are
reused exactly, without treating it as a direct candidate-versus-Pelé measurement.

Publication reproduces byte-for-byte. Round-0 and first-batch publication hashes, the prior
ledger prefix, and the original checkout’s index remain unchanged. Public reports contain
aggregates and evidence references; per-record sources, SVGs and profiles remain private.

No candidate is integrated. Other hypotheses remain untested, and two completed batches do
not count as two completed empty rounds under P2. Browser validation and e2e remain
pending/unverified. Production analysis caching and prepare-to-render reuse remain intact.

Reviewer: `/root/review_p26`, GPT-6 Astra, high effort. Private review evidence is retained in
`.tmp/perf-round1-batch2-20261110` alongside the assignments and frozen candidate headers.
