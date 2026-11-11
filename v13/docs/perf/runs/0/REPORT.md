# Round 0 baseline

Frozen sample: 5,000 diagrams. Validation profile: node. Browser validation is unverified and deferred; this report establishes Node performance only.

Measurement environment: observed background activity (P27), with a frozen limit of 1536 ms total background CPU per interval. The per-process field equals the total limit and imposes no additional cap. The total limit is the pre-run background p95 plus 20%; this is not an idle-host baseline. Provenance is embedded in the policy in HEADER.json and RESULTS.json.

A/A spread: 0.024674571224540278. P12 gain threshold: 0.07402371367362083.

Summed v13/Pele ratio: 1.4603817547929911. The P2 target is 0.95.

All comparisons, bucket counts, feature counts, methods, pins and raw evidence hashes are in RESULTS.json. No optimization was implemented.

Rerun from the same frozen inputs:

```sh
volta run --node 24.16.0 node tools/perf/round.mjs run --out /Users/knsv/repos/mermaid-v13-perf/.tmp/perf-round-0-p27
volta run --node 24.16.0 node tools/perf/round.mjs report --out /Users/knsv/repos/mermaid-v13-perf/.tmp/perf-round-0-p27 --publish /Users/knsv/repos/mermaid-v13-perf/v13/docs/perf/runs/0
```

The run command resumes identical completed jobs; for independent timings freeze a new directory using NEXT-SESSION.md.
