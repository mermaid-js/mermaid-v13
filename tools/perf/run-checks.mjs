/** Collect all acceptance outcomes, including blocked checks; never turn a skip into a pass. */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { root, requirePrivate, sha, workspaceFingerprint, writeJson } from './common.mjs';
import { readiness, requiredChecks } from './acceptance.mjs';

const { values } = parseArgs({
  options: { out: { type: 'string' }, 'node-only': { type: 'boolean' } },
});
if (!values.out)
  throw new Error(
    'Usage: node tools/perf/run-checks.mjs --out <fresh-private-directory> [--node-only]'
  );
const out = resolve(values.out);
const validationProfile = values['node-only'] ? 'node' : 'full';
requirePrivate(resolve(out, 'acceptance.json'));
if (existsSync(out)) throw new Error('Acceptance directory must be fresh');
mkdirSync(out, { recursive: true });
const before = workspaceFingerprint();
const tests = readdirSync(resolve(root, 'tools/perf'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tools/perf/${name}`);
const security = before.files
  .filter(
    ({ path }) =>
      path.endsWith('.spec.ts') && /R-SEC|security/i.test(readFileSync(resolve(root, path), 'utf8'))
  )
  .map(({ path }) => path);
const commands = [
  {
    name: 'environment',
    argv: [
      process.execPath,
      'tools/perf/check-environment.mjs',
      ...(values['node-only'] ? ['--node-only'] : []),
    ],
  },
  { name: 'harness', argv: [process.execPath, '--test', ...tests] },
  { name: 'check', argv: ['pnpm', 'check'] },
  {
    name: 'security',
    argv: [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', ...security],
  },
  {
    name: 'size',
    argv: [
      process.execPath,
      '--import',
      'tsx',
      '--conditions=mermaid-source',
      'tools/perf/size-check.mjs',
    ],
  },
  {
    name: 'host',
    argv: [process.execPath, 'tools/perf/host-acceptance.mjs', '--out', resolve(out, 'host')],
  },
  {
    name: 'browser',
    argv: [process.execPath, 'tools/perf/browser-acceptance.mjs', '--out', resolve(out, 'browser')],
  },
  { name: 'e2e', argv: ['pnpm', 'e2e'] },
];
const results = [];
for (const command of commands) {
  if (!requiredChecks(validationProfile).includes(command.name)) {
    results.push({
      ...command,
      status: 'unverified',
      reason: 'Deferred browser validation; not required for Node measurement readiness',
    });
    continue;
  }
  const log = resolve(out, `${command.name}.log`);
  const fd = openSync(log, 'w');
  const startedAt = new Date().toISOString();
  const outcome = await new Promise((done) => {
    const child = spawn(command.argv[0], command.argv.slice(1), {
      cwd: root,
      stdio: ['ignore', fd, fd],
      detached: process.platform !== 'win32',
    });
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        if (child.pid)
          process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL');
      },
      30 * 60 * 1000
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      done({ exitCode: null, error: error.message });
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      done({ exitCode, signal, timedOut });
    });
  });
  closeSync(fd);
  results.push({
    name: command.name,
    command: command.argv.join(' '),
    argv: command.argv,
    ...outcome,
    status: outcome.exitCode === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    log,
    logSha256: sha(readFileSync(log)),
  });
  writeJson(resolve(out, 'progress.json'), results);
  console.log(`${command.name}: ${results.at(-1).status} (${log})`);
}
const after = workspaceFingerprint();
const report = {
  schemaVersion: 1,
  purpose: 'harness acceptance, not performance evidence',
  node: process.version,
  createdAt: new Date().toISOString(),
  sourceSha256: before.sha256,
  sourceStable: before.sha256 === after.sha256,
  results,
  ...readiness(validationProfile, results, before.sha256 === after.sha256),
};
writeJson(resolve(out, 'acceptance.json'), report);
console.log(
  JSON.stringify({
    validationProfile,
    ready: report.ready,
    fullReady: report.fullReady,
    acceptance: resolve(out, 'acceptance.json'),
  })
);
if (!report.ready) process.exitCode = 1;
