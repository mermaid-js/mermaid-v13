import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readiness, requiredChecks, validateAcceptance } from './acceptance.mjs';
import { root, sha, writeJson } from './common.mjs';

const passedNodeChecks = () =>
  requiredChecks('node').map((name) => ({ name, status: 'passed', exitCode: 0 }));

test('Node readiness defers browser checks while requiring every Node and host check', () => {
  const results = passedNodeChecks();
  const status = readiness('node', results, true);
  assert.equal(status.ready, true);
  assert.equal(status.fullReady, false);
  assert.equal(status.browserValidation, 'unverified');
  assert.equal(readiness('full', results, true).ready, false);
  assert.equal(readiness('node', results, false).ready, false);
  for (const name of requiredChecks('node')) {
    assert.equal(
      readiness(
        'node',
        results.filter((row) => row.name !== name),
        true
      ).ready,
      false
    );
    for (const failed of [
      { status: 'failed', exitCode: 1 },
      { status: 'unverified', exitCode: null },
    ])
      assert.equal(
        readiness(
          'node',
          results.map((row) => (row.name === name ? { ...row, ...failed } : row)),
          true
        ).ready,
        false
      );
  }
  assert.equal(readiness('node', [...results, results[0]], true).ready, false);
  assert.throws(() => requiredChecks('unchecked'), /Unknown validation profile/);
});

test('acceptance cannot cross profiles, relabel failed evidence or reuse changed logs/source', (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'perf-acceptance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = resolve(directory, 'check.log');
  const path = resolve(directory, 'acceptance.json');
  writeFileSync(log, 'synthetic command evidence');
  const results = passedNodeChecks().map((row) => ({
    ...row,
    log,
    logSha256: sha(readFileSync(log)),
  }));
  const evidence = {
    ...readiness('node', results, true),
    sourceStable: true,
    sourceSha256: sha('source'),
    results,
  };
  writeJson(path, evidence);
  assert.equal(validateAcceptance(path, sha('source'), 'node').ready, true);
  assert.throws(
    () => validateAcceptance(path, sha('source'), 'full'),
    /different validation profile/
  );
  assert.throws(() => validateAcceptance(path, sha('changed'), 'node'), /stale/);
  writeJson(path, { ...evidence, results: results.filter((row) => row.name !== 'host') });
  assert.throws(() => validateAcceptance(path, sha('source'), 'node'), /incomplete/);
  writeJson(path, evidence);
  writeFileSync(log, 'changed');
  assert.throws(
    () => validateAcceptance(path, sha('source'), 'node'),
    /Changed acceptance evidence/
  );
});

test('Node preflight and round launcher do not import or launch a browser', () => {
  const code = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (/playwright|browser\\.mjs/.test(specifier)) throw new Error('Browser import forbidden');
      return next(specifier, context);
    }});
    process.argv = [process.execPath, '--node-only'];
    await import('./tools/perf/round.mjs');
    await import('./tools/perf/check-environment.mjs');
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(child.error, undefined);
  assert.doesNotMatch(child.stderr, /Browser import forbidden/);
  assert(child.stdout, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.validationProfile, 'node');
  assert.equal(result.browserValidation, 'unverified');
  assert.deepEqual(
    result.checks.map((check) => check.name),
    ['node', 'pnpm', 'process-inspection', 'hardware-inventory']
  );
  assert.equal(child.status, result.checks.every((check) => check.ok) ? 0 : 1);
});
