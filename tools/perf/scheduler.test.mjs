import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireLock, fileHash, runQueue } from './scheduler.mjs';
const fixture = (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'perf-scheduler-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    lockPath: resolve(directory, 'lock'),
    identity: { sample: 'fixed', policy: 'fixed', manifest: 'fixed' },
    mode: 'rehearsal',
  };
};
const job = (directory, id) => ({
  id,
  argv: ['unused-test-worker'],
  outputs: [resolve(directory, `${id}.json`)],
});
const fake = (callback) => (item) => ({
  pid: 999999,
  kill() {},
  result: Promise.resolve().then(() => callback(item)),
});
test('lock checks live owner, recovers verified dead owner, rejects unknown owner', (t) => {
  const { lockPath } = fixture(t);
  const release = acquireLock(lockPath);
  assert.throws(() => acquireLock(lockPath), /live PID/);
  release();
  writeFileSync(lockPath, JSON.stringify({ pid: 999999 }));
  const staleRelease = acquireLock(lockPath, { alive: () => false });
  staleRelease();
  writeFileSync(lockPath, '{}');
  assert.throws(() => acquireLock(lockPath), /Invalid.*PID/);
});
test('serial completion resumes without duplicate finals; changed identity and outputs rejected', async (t) => {
  const options = fixture(t);
  options.jobs = [job(options.directory, 'one'), job(options.directory, 'two')];
  let active = 0;
  let executions = 0;
  options.execute = fake(async (item) => {
    active++;
    assert.equal(active, 1);
    executions++;
    await new Promise((done) => setTimeout(done, 5));
    writeFileSync(item.outputs[0], '{}');
    active--;
    return { code: 0 };
  });
  const first = await runQueue(options);
  assert.equal(first.timingEligible, false);
  assert.equal(executions, 2);
  await runQueue(options);
  assert.equal(executions, 2);
  const records = readFileSync(resolve(options.directory, 'scheduler.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(records.filter((record) => record.event === 'complete').length, 2);
  await assert.rejects(
    runQueue({ ...options, identity: { ...options.identity, sample: 'changed' } }),
    /identity mismatch/
  );
  writeFileSync(options.jobs[0].outputs[0], 'changed');
  await assert.rejects(runQueue(options), /evidence changed/);
});
test('partial job reruns, preserves failed attempt, and does not trust partial output', async (t) => {
  const options = fixture(t);
  options.jobs = [job(options.directory, 'one')];
  let calls = 0;
  options.execute = fake((item) => {
    writeFileSync(item.outputs[0], JSON.stringify({ calls: ++calls }));
    return { code: calls === 1 ? 1 : 0 };
  });
  await assert.rejects(runQueue(options), /Job failed/);
  assert.equal(existsSync(options.lockPath), false);
  await runQueue(options);
  assert.equal(calls, 2);
  assert.equal(JSON.parse(readFileSync(options.jobs[0].outputs[0])).calls, 2);
});
test('changed input content blocks a resumed job despite unchanged path and identity', async (t) => {
  const options = fixture(t);
  const input = resolve(options.directory, 'sample');
  writeFileSync(input, 'fixed');
  options.jobs = [
    { ...job(options.directory, 'one'), inputs: [{ path: input, sha256: fileHash(input) }] },
  ];
  writeFileSync(input, 'different');
  await assert.rejects(runQueue(options), /input hash mismatch/);
});
test('quiet start refusal never launches job, contamination invalidates whole job', async (t) => {
  const options = fixture(t);
  options.mode = 'acceptance';
  options.jobs = [job(options.directory, 'one')];
  options.quietPolicy = { quietMs: 1, intervalMs: 1 };
  options.pause = async () => {};
  let step = 0;
  let launched = 0;
  const snapshot = (cpu) => ({
    at: ++step * 1000,
    processes: [{ pid: 1234, ppid: 1, cpuMs: cpu, command: 'unrelated python' }],
  });
  options.snapshot = async () => snapshot(step * 100);
  options.execute = fake((item) => {
    launched++;
    writeFileSync(item.outputs[0], '{}');
    return { code: 0 };
  });
  await assert.rejects(runQueue(options), /Busy host/);
  assert.equal(launched, 0);
  step = 0;
  options.snapshot = async () => snapshot(step < 2 ? 0 : 100);
  await assert.rejects(runQueue(options), /contamination/);
  const records = readFileSync(resolve(options.directory, 'scheduler.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(
    records.some((record) => record.event === 'complete'),
    false
  );
  assert.equal(records.at(-1).contaminated, true);
});
test('denied process inspection fails closed and never starts worker', async (t) => {
  const options = fixture(t);
  options.mode = 'formal';
  options.jobs = [job(options.directory, 'one')];
  options.snapshot = async () => {
    throw new Error('process inspection denied');
  };
  options.execute = () => {
    throw new Error('must not launch');
  };
  await assert.rejects(runQueue(options), /inspection denied/);
});
test('torn trailing journal record is ignored and preserved during recovery', async (t) => {
  const options = fixture(t);
  options.jobs = [job(options.directory, 'one')];
  writeFileSync(resolve(options.directory, 'scheduler.jsonl'), '{"event":"sta');
  let calls = 0;
  options.execute = fake((item) => {
    calls++;
    writeFileSync(item.outputs[0], '{}');
    return { code: 0 };
  });
  await runQueue(options);
  await runQueue(options);
  assert.equal(calls, 1);
  assert.match(
    readFileSync(resolve(options.directory, 'scheduler.jsonl'), 'utf8'),
    /recovered-tail/
  );
});
test('resume checks every raw evidence file referenced by a hashed output tree', async (t) => {
  const options = fixture(t);
  const raw = resolve(options.directory, 'raw.json');
  const tree = resolve(options.directory, 'evidence-tree.json');
  options.jobs = [{ ...job(options.directory, 'one'), outputs: [tree], outputTrees: [tree] }];
  options.execute = fake(() => {
    writeFileSync(raw, '{}');
    writeFileSync(tree, JSON.stringify({ files: [{ path: raw, sha256: fileHash(raw) }] }));
    return { code: 0 };
  });
  await runQueue(options);
  writeFileSync(raw, 'changed');
  await assert.rejects(runQueue(options), /Raw evidence hash mismatch/);
});
