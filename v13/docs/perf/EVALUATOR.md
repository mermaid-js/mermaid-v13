# Deterministic candidate evaluation

`tools/perf/evaluate.mjs` exports `evaluate(bundle)`, `loadMeasurementEvidence(options)` and
`verifyMeasurementEvidence(proof, options)`. It also exposes the frozen `POLICY`, its
`policySha256`, and the `PIN_KEYS` required below. Evaluation reads stored evidence; it does
not start measurements. Preparation rehearsals cannot produce `fit`.

Run a saved candidate bundle with:

```sh
volta run --node 24.16.0 node tools/perf/evaluate.mjs \
  --input .tmp/perf/candidate/bundle.json --out .tmp/perf/candidate/verdict.json
```

The command exits nonzero for `blocked` or `unfit`. A requirement amendment remains a separate
`delivery: "awaiting-approval"` state even when the candidate is fit.

## Bundle and evidence envelopes

The bundle contains `policy`, `pins`, `timing`, `noise`, `bytes`, `surface`, `checks` and `size`.
An output-lane candidate also supplies `pixels`, `browserIndices`, `browserSubsetRaw` (the
literal frozen subset file), and `browserPin`. Every evidence envelope has:

```js
{
  schemaVersion: 1,
  kind: 'timing', // or noise, bytes, surface, pixels, checks, size
  scope: 'formal',
  complete: true,
  pins: {
    sampleSha256, browserSubsetSha256,
    baseArtifactSha256, headArtifactSha256,
    baseSourceSha256, headSourceSha256, policySha256,
  },
  // Kind-specific data below.
}
```

- `timing`: `contaminated: false`, `records`, and `measurement`. Each record contains `index`,
  `sourceBytes`, and seven positive finite observations in `base` and `head` (or `baseNs` and
  `headNs`). All 5,000 distinct fixed indices are required.
- `noise`: `contaminated: false`, `referencePins` for the frozen round-0 A/A inputs, and ten `estimates`, ordered by A/A block number. Each estimate
  contains `records` in the same timing format and its own `measurement` proof.
- `bytes`: 5,000 records containing `index`, `baseSha256`, `headSha256`, `baseBytes`, `headBytes`.
- `surface`: 5,000 records containing `index`, `baseSha256`, `headSha256`, `equal`. Digests cover
  the canonical protected IDs, classes, `data-ast` and custom properties, not SVG bytes.
- `pixels`: all 500 fixed indices, with the same equality fields, plus `indicesSha256` and
  `browserPinSha256`. Digests cover image dimensions and exact RGBA bytes.
- `checks`: `results` with `{ name, command, exitCode, logSha256 }`. Passing `check` and
  `security` results are mandatory; the output lane additionally requires `e2e`.
- `size`: `passed: true`, `command`, `exitCode: 0`, and `logSha256`.

`runGates` and `runBrowser` produce the correctness envelopes and preserve raw SVG/RGBA
artifacts locally. The evaluator applies the estimators and thresholds in `POLICY.json`.

## Scheduler proof required for every timing block

A worker's `contaminated: false` and `timingEligible: true` flags cannot establish a clean
measurement window. Each candidate timing block and each A/A estimate must carry a separate
proof from the serial scheduler:

```js
const measurement = loadMeasurementEvidence({
  queuePath: '/absolute/private/run/queue.json',
  receipt: completion.results.find((result) => result.id === jobId),
  outputPath: '/absolute/private/run/raw/job-id/result.json',
});
```

The loader only reads the files. It returns the following portable JSON structure, which can
be saved directly inside the evaluator bundle:

```js
{
  queue,   // Original queue configuration, including identity, jobs, mode, quietPolicy.
  receipt, // Unmodified scheduler completion entry from completion.json/scheduler.jsonl.
  output: { path, raw }, // Original output path and verbatim UTF-8 worker result file.
}
```

Validation requires all of the following:

1. The queue uses formal mode and the frozen quiet policy. Its canonical identity digest
   matches `receipt.identitySha256`; its source/artifact/sample/policy pins match the evaluated
   inputs. Candidate proofs use the candidate's full pins. A/A proofs use `noise.referencePins`,
   preserving the original baseline even after later candidate bases change. Reference sample,
   subset and policy pins must match the candidate's; both reference head pins must equal their
   corresponding reference base pins.
2. The receipt has `event: "complete"`, a nonempty attempt ID, formal mode, completed and
   timing-eligible flags, and `contaminated: false`. Its job and output paths match the queue.
3. SHA-256 of `output.raw` matches that output's scheduler receipt digest. The parsed worker
   result has formal completed timing flags, matching pins and policy, and exactly the rows
   supplied to the evaluator. Both renderers are cache-off v13 with unmodified source. Each
   A/A result also has `experiment: "aa"` and the expected `block` index.
4. The receipt contains a complete quiet startup interval and at least one monitoring sample.
   Every sample has finite CPU/load observations, no busy flag, consistent total CPU deltas,
   and activity within the frozen per-process and total limits. Missing or skipped monitoring
   fails, even if the worker claims clean timing.

Changing a timing observation, source pin, receipt, or raw output after collection blocks fit.
Preserve the original scheduler evidence; do not construct a completion receipt from worker
flags. The original `noise.referencePins` and ten A/A proofs remain unchanged across later rounds;
only candidate timing pins advance. Relabeling the noise sample, subset or policy blocks fit.

The pure negative tests fabricate complete synthetic evidence to exercise these checks; they
are test fixtures and are not measurements. Real preparation and formal execution use the
scheduler's saved receipts.
