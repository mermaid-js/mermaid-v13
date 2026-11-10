/** Host-wide process CPU deltas; inaccessible process information is never quiet. */
import { execFile } from 'node:child_process';
import { loadavg } from 'node:os';

export function cpuMilliseconds(value) {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) throw new Error(`Unrecognized ps CPU time: ${value}`);
  return (
    (Number(match[1] || 0) * 86400 +
      Number(match[2] || 0) * 3600 +
      Number(match[3]) * 60 +
      Number(match[4])) *
    1000
  );
}

export function parseProcesses(stdout) {
  const rows = stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
      if (!match) throw new Error(`Unrecognized ps process row: ${line}`);
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpuMs: cpuMilliseconds(match[3]),
        command: match[4],
      };
    });
  if (!rows.length) throw new Error('Process snapshot is empty');
  return rows;
}

export function processSnapshot() {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = execFile(
        '/bin/ps',
        ['-axo', 'pid=,ppid=,time=,comm='],
        { maxBuffer: 16 * 1024 * 1024, timeout: 5000 },
        (error, stdout) => {
          if (error)
            return reject(
              new Error(`Quiet-window process inspection unavailable: ${error.message}`)
            );
          try {
            resolve({
              at: performance.now(),
              processes: parseProcesses(stdout).filter((row) => row.pid !== child.pid),
              load: loadavg(),
            });
          } catch (failure) {
            reject(failure);
          }
        }
      );
    } catch (error) {
      reject(new Error(`Quiet-window process inspection unavailable (/bin/ps): ${error.message}`));
    }
  });
}

export function competingActivity(
  before,
  after,
  { allowedPids = [], maxCpuMs = 10, maxTotalCpuMs = 20 } = {}
) {
  if (!before?.processes?.length || !after?.processes?.length || !(after.at > before.at))
    throw new Error('Invalid process snapshots');
  const allowed = new Set(allowedPids);
  let added;
  do {
    added = false;
    for (const row of [...before.processes, ...after.processes]) {
      if (allowed.has(row.ppid) && !allowed.has(row.pid)) {
        allowed.add(row.pid);
        added = true;
      }
    }
  } while (added);
  const previous = new Map(before.processes.map((row) => [row.pid, row]));
  const deltas = after.processes
    .filter((row) => !allowed.has(row.pid))
    .map((row) => {
      const old = previous.get(row.pid);
      return {
        ...row,
        deltaMs: Math.max(0, row.cpuMs - (old?.command === row.command ? old.cpuMs : 0)),
      };
    });
  const totalCpuMs = deltas.reduce((sum, row) => sum + row.deltaMs, 0);
  return {
    busy: totalCpuMs > maxTotalCpuMs || deltas.some((row) => row.deltaMs > maxCpuMs),
    totalCpuMs,
    offenders: deltas.filter((row) => row.deltaMs > 0),
    load: after.load,
    intervalMs: after.at - before.at,
  };
}

export function validateQuietPolicy({
  intervalMs = 1000,
  quietMs = 3000,
  maxCpuMs = 10,
  maxTotalCpuMs = 20,
} = {}) {
  if (
    ![intervalMs, quietMs].every((value) => Number.isFinite(value) && value > 0) ||
    ![maxCpuMs, maxTotalCpuMs].every((value) => Number.isFinite(value) && value >= 0)
  )
    throw new Error('Invalid quiet-window policy');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function establishQuiet({
  snapshot = processSnapshot,
  pause = sleep,
  intervalMs = 1000,
  quietMs = 3000,
  ...policy
} = {}) {
  validateQuietPolicy({ intervalMs, quietMs, ...policy });
  let previous = await snapshot();
  const evidence = [];
  for (let elapsed = 0; elapsed < quietMs; elapsed += intervalMs) {
    await pause(intervalMs);
    const current = await snapshot();
    const activity = competingActivity(previous, current, policy);
    evidence.push(activity);
    if (activity.busy) throw new Error(`Busy host: ${JSON.stringify(activity)}`);
    previous = current;
  }
  return { previous, evidence };
}

export function monitorQuiet({
  previous,
  snapshot = processSnapshot,
  intervalMs = 1000,
  onViolation,
  ...policy
}) {
  validateQuietPolicy({ intervalMs, ...policy });
  let stopped = false;
  let failure;
  const evidence = [];
  let pending = Promise.resolve();
  const sample = async () => {
    try {
      const current = await snapshot();
      const activity = competingActivity(previous, current, policy);
      evidence.push(activity);
      previous = current;
      if (activity.busy) throw new Error(`Measurement contamination: ${JSON.stringify(activity)}`);
    } catch (error) {
      if (!failure) {
        failure = error;
        onViolation?.(error);
      }
    }
  };
  const timer = setInterval(() => {
    if (!stopped) pending = pending.then(sample);
  }, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
      await sample();
      return { valid: !failure, error: failure?.message, evidence };
    },
  };
}
