# Fixed flowchart sample

Knut approved a seeded sample of 5,000 flowcharts renderable by both minimal v13 and Pele.
The first 5,000 candidates all passed; no replacements or exclusions were needed.
The same frozen sample was then rechecked with minimal Pele (core + flowchart); all 5,000 passed
and both the sample and browser-subset hashes stayed unchanged.
[SAMPLE-REPORT.json](SAMPLE-REPORT.json) contains aggregate validation evidence and hashes.
Initial validation used Node 26.7.0. The frozen sample was revalidated on the repository-pinned
Node 24.16.0: all 5,000 passed both minimal renderers with unchanged hashes. These are untimed
preparation checks, not round 0 or performance evidence.

## Local artifacts on MAI-Max

Paths below are relative to `/Users/knsv/repos/mermaid-v13-perf`:

| Path | Contents |
| --- | --- |
| `.tmp/perf-prep/sample-v1/provenance.json` | Seed, algorithm, corpus path, per-shard counts and SHA-256 digests |
| `.tmp/perf-prep/sample-v1/candidates.jsonl` | 20,000 candidates in seeded order, original source and location |
| `.tmp/perf-prep/validated-node24-v1/sample.jsonl` | The fixed 5,000 selected records and original source |
| `.tmp/perf-prep/validated-node24-v1/browser-indices.json` | 500 zero-based indices into the fixed sample |
| `.tmp/perf-prep/validated-node24-v1/attempts.jsonl` | Per-candidate outcomes for both renderers |
| `.tmp/perf-prep/validated-node24-v1/report.json` | Aggregate preflight outcome |
| `.tmp/perf-prep/validated-node24-v1/preflight-worker.mjs` | Exact bundled code used to validate eligibility |

These artifacts are Git-ignored. Keep the directory for the execution session. A new worktree
can read it by absolute path. Source diagrams, identifiers and per-record results stay local.

## Reproduce selection

Run from the repository root. The output directories must be new; existing evidence is preserved.
The corpus must match the per-shard hashes in the original local provenance file.

```sh
python3 tools/perf/select-candidates.py \
  --corpus /Users/knsv/repos/diagram-test-data \
  --out .tmp/perf-prep/reproduced-candidates \
  --seed mermaid-flowchart-perf-2026-11-10-v1 \
  --count 20000

volta run --node 24.16.0 node tools/perf/validate-sample.mjs \
  --input .tmp/perf-prep/reproduced-candidates/candidates.jsonl \
  --out .tmp/perf-prep/reproduced-validation \
  --count 5000 --policy common-renderable --timeout 30000
```

The selector orders `flowchart-*.jsonl` shards lexicographically and numbers nonempty records from
zero. It ranks each ordinal by `SHA256(UTF8(seed + NUL + decimal ordinal))`, with ordinal as a tie
breaker. The smallest 20,000 ranks form the candidate pool. An expanded pool with the same seed
preserves that prefix. It verifies the shards did not change while selecting.

The validator tries candidates in that order, preserving all source text. Each source must be
detected as a flowchart by v13, render in `mermaid/slim` with only the flowchart plugin registered,
and render in minimal Pele 1.13.0 (core + flowchart). Both results must contain an SVG root. Warnings are permitted; syntax
errors, unsupported dependencies, missing SVG and 30-second per-render timeouts are exclusions.
Worker failures abort validation. Failures are counted per renderer, so exclusion-reason counts
can exceed excluded records. Both renderers receive the same unmodified input.

Like the existing bench, validation lifts limits to 10,000,000 input characters and 1,000,000 edges;
Pele's output limit is Number.MAX_SAFE_INTEGER. Other renderer settings stay at their defaults,
with input directives/front matter applied. The runtime pin and configuration must be carried
into the execution harness explicitly. Eligibility does not assert that v13 and Pele produce
the same picture. P11 compares candidate v13 with base v13.

The browser subset uses an independent hash ranking, `SHA256(UTF8("browser-v1" + NUL + ordinal))`,
selects 500 records and stores their indices in sample order. Browser rendering remains to be
validated; this session's sandbox prevented Chromium from launching.

## Verify after changing runtime or checkout

Revalidate the frozen sample without replacement:

```sh
volta run --node 24.16.0 node tools/perf/validate-sample.mjs \
  --input .tmp/perf-prep/validated-node24-v1/sample.jsonl \
  --out .tmp/perf-prep/rechecked-sample \
  --count 5000 --policy fixed-random --timeout 30000
```

Require `failureCounts` to be empty, 5,000 attempted/selected records, and the same sample hash as
SAMPLE-REPORT.json. The fixed-random policy preserves failed entries for diagnosis; exit success
alone does not establish eligibility in that mode. A failure needs investigation, not a redraw.
The pixel-gate subset and source hashes stay fixed throughout the effort.

This sample represents corpus records. Identical source text in different records is retained
if sampled; there is no deduplication or balancing by size. Define reporting buckets before round 0.
Feature counts and wide-label measurement belong to round 0 (P10).
