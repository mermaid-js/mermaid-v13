import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { bucketFor, readSample, samplePath, subsetPath } from './common.mjs';

test('fixed 5000 sample source hashes and 500 subset indices verify; tampering fails', () => {
  const sample = readSample();
  assert.equal(sample.records.length, 5000);
  assert.equal(sample.indices.length, 500);
  const out = mkdtempSync(resolve(tmpdir(), 'perf-sample-'));
  try {
    const badSample = resolve(out, 'sample.jsonl');
    writeFileSync(badSample, readFileSync(samplePath, 'utf8') + '\n');
    assert.throws(() => readSample({ sample: badSample }), /hash mismatch/);
    const badSubset = resolve(out, 'subset.json');
    writeFileSync(badSubset, readFileSync(subsetPath, 'utf8').replace('1,2,', '2,1,'));
    assert.throws(() => readSample({ subset: badSubset }), /hash mismatch/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
test('source-byte bucket boundaries are fixed before observing timings', () => {
  const policy = {
    buckets: [
      { name: 'a', minBytes: 0, maxBytes: 1024 },
      { name: 'b', minBytes: 1024, maxBytes: null },
    ],
  };
  assert.equal(bucketFor(1023, policy), 'a');
  assert.equal(bucketFor(1024, policy), 'b');
});
