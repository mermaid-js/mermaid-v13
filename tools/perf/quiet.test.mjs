import test from 'node:test';
import assert from 'node:assert/strict';
import {
  competingActivity,
  cpuMilliseconds,
  establishQuiet,
  monitorQuiet,
  parseProcesses,
} from './quiet.mjs';
const snap = (at, cpu = 0) => ({
  at,
  load: [0, 0, 0],
  processes: [
    { pid: 1, ppid: 0, cpuMs: 0, command: 'system' },
    { pid: 20, ppid: 1, cpuMs: cpu, command: '/usr/bin/python arbitrary-work' },
  ],
});
test('parses Darwin/Linux elapsed CPU including day and fraction formats', () => {
  assert.equal(cpuMilliseconds('01:02.50'), 62500);
  assert.equal(cpuMilliseconds('2-01:02:03'), 176523000);
  assert.equal(parseProcesses(' 10 1 0:00.02 /usr/bin/python job')[0].cpuMs, 20);
  assert.throws(() => parseProcesses(''), /empty/);
});
test('arbitrary non-node workloads and aggregate low CPU are detected', () => {
  assert.equal(competingActivity(snap(0), snap(1000, 50)).busy, true);
  const first = snap(0);
  const second = snap(1000, 10);
  first.processes.push(
    { pid: 30, ppid: 1, cpuMs: 0, command: 'compiler' },
    { pid: 40, ppid: 1, cpuMs: 0, command: 'compressor' }
  );
  second.processes.push(
    { pid: 30, ppid: 1, cpuMs: 10, command: 'compiler' },
    { pid: 40, ppid: 1, cpuMs: 10, command: 'compressor' }
  );
  assert.equal(competingActivity(first, second).busy, true);
});
test('allows measurement descendants only and detects new processes', () => {
  const before = snap(0);
  const after = snap(1000, 100);
  after.processes.push({ pid: 21, ppid: 20, cpuMs: 999, command: 'measurement child' });
  assert.equal(competingActivity(before, after, { allowedPids: [20] }).busy, false);
  assert.equal(competingActivity(before, after).busy, true);
});
test('startup fails closed on denied inspection and refuses busy host', async () => {
  await assert.rejects(
    establishQuiet({
      snapshot: async () => {
        throw new Error('ps denied');
      },
    }),
    /denied/
  );
  let step = 0;
  await assert.rejects(
    establishQuiet({
      snapshot: async () => snap(step++ * 1000, (step - 1) * 50),
      pause: async () => {},
      quietMs: 1000,
    }),
    /Busy host/
  );
});
test('monitor final sample invalidates even short jobs and failed inspection', async () => {
  let killed = 0;
  const monitor = monitorQuiet({
    previous: snap(0),
    snapshot: async () => snap(1000, 50),
    onViolation: () => killed++,
  });
  assert.equal((await monitor.stop()).valid, false);
  assert.equal(killed, 1);
  const unavailable = monitorQuiet({
    previous: snap(0),
    snapshot: async () => {
      throw new Error('ps denied');
    },
  });
  assert.equal((await unavailable.stop()).valid, false);
});
