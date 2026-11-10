/** Frozen inputs and local evidence shared by the standalone performance tools. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const samplePath = resolve(root, '.tmp/perf-prep/validated-node24-v1/sample.jsonl');
export const subsetPath = resolve(root, '.tmp/perf-prep/validated-node24-v1/browser-indices.json');
export const sha = (data) => createHash('sha256').update(data).digest('hex');
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export function writeJson(path, data) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
export function requirePrivate(path) {
  execFileSync('git', ['check-ignore', '-q', resolve(path)], { cwd: root });
}
export function readSample({
  sample = samplePath,
  subset = subsetPath,
  report = resolve(root, 'v13/docs/perf/SAMPLE-REPORT.json'),
} = {}) {
  const expected = readJson(report);
  const bytes = readFileSync(sample);
  const subsetBytes = readFileSync(subset);
  if (sha(bytes) !== expected.sampleSha256 || sha(subsetBytes) !== expected.browserSubsetSha256)
    throw new Error('Frozen sample/browser subset hash mismatch');
  const records = bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line, index) => ({
      ...JSON.parse(line),
      index,
    }));
  const indices = JSON.parse(subsetBytes);
  if (
    records.length !== expected.selected ||
    records.length !== 5000 ||
    indices.length !== 500 ||
    new Set(indices).size !== indices.length ||
    indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= records.length)
  )
    throw new Error('Invalid fixed sample/subset cardinality');
  for (const record of records)
    if (typeof record.source !== 'string' || sha(record.source) !== record.sourceSha256)
      throw new Error(`Source hash mismatch at sample index ${record.index}`);
  return {
    records,
    indices,
    pins: {
      sampleSha256: sha(bytes),
      browserSubsetSha256: sha(subsetBytes),
      sourceHashesSha256: sha(JSON.stringify(records.map((r) => r.sourceSha256))),
      sample: resolve(sample),
      subset: resolve(subset),
    },
  };
}
export function bucketFor(sourceBytes, policy) {
  const bucket = policy.buckets.find(
    (b) => sourceBytes >= b.minBytes && (b.maxBytes === null || sourceBytes < b.maxBytes)
  );
  if (!bucket) throw new Error(`No size bucket for ${sourceBytes} bytes`);
  return bucket.name;
}
export function workspaceFingerprint() {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      'packages',
      'tools',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'eslint.config.js',
      'knip.json',
      'tsconfig.json',
      'vitest.config.ts',
      'v13/docs/perf/POLICY.json',
      'v13/docs/perf/SAMPLE-REPORT.json',
      '.node-version',
      'e2e',
      'playwright.config.ts',
      'vitest.workspace.ts',
      'tsconfig.base.json',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean);
  const entries = [...new Set(files)].sort().map((path) => ({
    path,
    sha256: existsSync(resolve(root, path)) ? sha(readFileSync(resolve(root, path))) : null,
  }));
  return { sha256: sha(JSON.stringify(entries)), files: entries };
}
