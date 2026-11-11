/** Serial, exclusive and resumable execution. Finished evidence is reused only with identical pins. */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { establishQuiet, monitorQuiet } from './quiet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const fileHash = (path) => sha256(readFileSync(path));
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function acquireLock(
  path = resolve(ROOT, '.tmp/perf/measurement.lock'),
  {
    pid = process.pid,
    alive = (id) => {
      try {
        process.kill(id, 0);
        return true;
      } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
      }
    },
  } = {}
) {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify({ pid, token, created: new Date().toISOString() }), {
        flag: 'wx',
      });
      return () => {
        const owner = JSON.parse(readFileSync(path, 'utf8'));
        if (owner.token !== token) throw new Error('Measurement lock ownership changed');
        unlinkSync(path);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = statSync(path);
      let owner;
      try {
        owner = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        throw new Error('Measurement lock has unreadable ownership; refusing recovery');
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1)
        throw new Error('Invalid measurement lock PID');
      if (alive(owner.pid)) throw new Error(`Measurement lock held by live PID ${owner.pid}`);
      const recoveryPath = `${path}.recovery`;
      // Serialize stale-owner recovery as well as normal lock acquisition. Without this,
      // two recoverers could both inspect the dead owner and unlink a newly acquired lock.
      let recoveryFd;
      try {
        recoveryFd = openSync(recoveryPath, 'wx');
      } catch (failure) {
        if (failure.code === 'EEXIST')
          throw new Error(
            'Measurement lock recovery already in progress; refusing concurrent recovery'
          );
        throw failure;
      }
      try {
        const current = JSON.parse(readFileSync(path, 'utf8'));
        if (statSync(path).ino !== stat.ino || current.pid !== owner.pid || alive(current.pid))
          throw new Error('Measurement lock changed during stale recovery');
        unlinkSync(path);
        return acquireLock(path, { pid, alive });
      } finally {
        closeSync(recoveryFd);
        unlinkSync(recoveryPath);
      }
    }
  }
  throw new Error('Unable to acquire measurement lock');
}

function append(path, record) {
  const fd = openSync(path, 'a');
  try {
    appendFileSync(fd, `${JSON.stringify(record)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function journal(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  // A killed append can leave a torn final line. Seal it and record its bytes; completed
  // records always require a newline. Sealed fragments are skipped only with that receipt.
  let recovery;
  if (lines.at(-1) !== '') {
    const fragment = lines.pop();
    recovery = {
      event: 'recovered-tail',
      fragmentSha256: sha256(fragment),
      at: new Date().toISOString(),
    };
    appendFileSync(path, '\n');
    append(path, recovery);
  }
  const parsed = lines.filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { fragmentSha256: sha256(line), invalid: true };
    }
  });
  if (recovery) parsed.push(recovery);
  for (const row of parsed)
    if (
      row.invalid &&
      !parsed.some(
        (candidate) =>
          candidate.event === 'recovered-tail' && candidate.fragmentSha256 === row.fragmentSha256
      )
    )
      throw new Error('Corrupt scheduler journal');
  return parsed.filter((row) => !row.invalid);
}
function verifyInputs(jobs) {
  for (const job of jobs)
    for (const input of job.inputs || [])
      if (fileHash(input.path) !== input.sha256)
        throw new Error(`Job input hash mismatch: ${input.path}`);
}

function verifyOutputTrees(job) {
  for (const treePath of job.outputTrees || []) {
    if (!job.outputs.some((path) => resolve(path) === resolve(treePath)))
      throw new Error('Output evidence tree must itself be a hashed job output');
    const tree = JSON.parse(readFileSync(treePath, 'utf8'));
    if (!Array.isArray(tree.files) || !tree.files.length)
      throw new Error(`Missing raw evidence tree: ${treePath}`);
    if (new Set(tree.files.map((file) => file.path)).size !== tree.files.length)
      throw new Error(`Duplicate raw evidence paths: ${treePath}`);
    for (const file of tree.files)
      if (!file.path || !file.sha256 || fileHash(file.path) !== file.sha256)
        throw new Error(`Raw evidence hash mismatch: ${file.path}`);
  }
}

export function executeJob(job) {
  let child;
  let timedOut = false;
  let timer;
  const result = new Promise((resolveResult, reject) => {
    child = spawn(job.argv[0], job.argv.slice(1), {
      cwd: job.cwd || ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: process.platform !== 'win32',
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal, timedOut });
    });
    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, job.timeoutMs || 3600000);
  });
  function kill() {
    if (child?.pid) {
      try {
        process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  return { pid: child.pid, result, kill };
}

export async function runQueue({
  directory,
  identity,
  jobs,
  mode = 'formal',
  quietPolicy = {},
  lockPath,
  snapshot,
  pause,
  execute = executeJob,
}) {
  if (!directory || !identity || !Array.isArray(jobs) || !jobs.length)
    throw new Error('Queue requires directory, immutable identity and jobs');
  if (!['formal', 'rehearsal', 'acceptance'].includes(mode)) throw new Error('Unknown run mode');
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length) throw new Error('Duplicate job IDs');
  for (const job of jobs)
    if (
      !job.id ||
      !Array.isArray(job.argv) ||
      !job.argv.length ||
      !Array.isArray(job.outputs) ||
      !job.outputs.length
    )
      throw new Error('Job requires id, argv and outputs');
  const release = acquireLock(lockPath);
  try {
    mkdirSync(directory, { recursive: true });
    const frozen = canonical({ identity, jobs, mode, quietPolicy });
    const identityPath = resolve(directory, 'queue-identity.json');
    if (existsSync(identityPath)) {
      if (readFileSync(identityPath, 'utf8') !== frozen)
        throw new Error('Resume identity mismatch (manifest/policy/sample/jobs)');
    } else writeFileSync(identityPath, frozen, { flag: 'wx' });
    verifyInputs(jobs);
    const journalPath = resolve(directory, 'scheduler.jsonl');
    const records = journal(journalPath);
    const completed = records.filter((row) => row.event === 'complete');
    if (new Set(completed.map((row) => row.id)).size !== completed.length)
      throw new Error('Duplicate final job records');
    const results = [];
    for (const job of jobs) {
      const previous = completed.find((row) => row.id === job.id);
      if (previous) {
        if (
          !previous.outputs?.length ||
          previous.outputs.some((output) => fileHash(output.path) !== output.sha256)
        )
          throw new Error(`Completed job evidence changed: ${job.id}`);
        verifyOutputTrees(job);
        results.push(previous);
        continue;
      }
      for (const path of job.retryCleanupPaths || []) {
        const absolute = resolve(path);
        if (!absolute.startsWith(`${resolve(directory)}/`) || absolute === resolve(directory))
          throw new Error('Retry cleanup must stay inside run directory');
        rmSync(absolute, { recursive: true, force: true });
      }
      const attempt = randomUUID();
      const base = {
        id: job.id,
        attempt,
        mode,
        timingEligible: mode === 'formal',
        identitySha256: sha256(frozen),
      };
      append(journalPath, { ...base, event: 'start', at: new Date().toISOString() });
      let monitor;
      let execution;
      let quiet;
      let monitoring;
      try {
        if (mode !== 'rehearsal')
          quiet = await establishQuiet({
            ...quietPolicy,
            snapshot,
            pause,
            allowedPids: [process.pid],
          });
        execution = execute(job);
        if (mode !== 'rehearsal')
          monitor = monitorQuiet({
            ...quietPolicy,
            snapshot,
            previous: quiet.previous,
            allowedPids: [process.pid, execution.pid].filter(Boolean),
            onViolation: () => execution.kill(),
          });
        const status = await execution.result;
        if (monitor) {
          monitoring = await monitor.stop();
          monitor = undefined;
        }
        if (monitoring && !monitoring.valid) throw new Error(monitoring.error);
        if (status.code !== 0 || status.timedOut)
          throw new Error(`Job failed: ${job.id}: ${JSON.stringify(status)}`);
        verifyInputs(jobs);
        verifyOutputTrees(job);
        const outputs = job.outputs.map((path) => ({
          path: resolve(path),
          sha256: fileHash(path),
        }));
        const result = {
          ...base,
          event: 'complete',
          completed: true,
          contaminated: false,
          at: new Date().toISOString(),
          outputs,
          quiet:
            mode !== 'rehearsal'
              ? { startup: quiet.evidence, monitoring: monitoring.evidence }
              : { skipped: true, reason: 'Explicit infrastructure rehearsal; unfit for timing' },
        };
        append(journalPath, result);
        results.push(result);
      } catch (error) {
        execution?.kill();
        if (execution)
          await execution.result.catch(() => {
            // The original failure is recorded below; wait for child cleanup without replacing it.
          });
        if (monitor) monitoring = await monitor.stop();
        append(journalPath, {
          ...base,
          event: 'invalid',
          completed: false,
          contaminated: Boolean(monitoring && !monitoring.valid),
          at: new Date().toISOString(),
          error: error.message,
          quiet: monitoring || quiet,
        });
        throw error;
      }
    }
    return { completed: true, mode, timingEligible: mode === 'formal', results };
  } finally {
    release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { queue: { type: 'string' } } });
  if (!values.queue) throw new Error('Usage: node tools/perf/scheduler.mjs --queue queue.json');
  runQueue(JSON.parse(readFileSync(values.queue, 'utf8')))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
