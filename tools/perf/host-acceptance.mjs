/** Real-host quiet/lock rehearsal. This never renders diagrams or produces timing evidence. */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { processSnapshot } from './quiet.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

export async function hostAcceptance(out, quietPolicy) {
  out = resolve(out);
  if (existsSync(out)) throw new Error('Host acceptance requires a fresh output directory');
  mkdirSync(out, { recursive: true });
  const report = {
    schemaVersion: 1,
    mode: 'infrastructure-acceptance',
    timingEligible: false,
    completed: false,
    checks: [],
    method:
      'Real ps CPU deltas, real serial scheduler subprocess, and a sibling /usr/bin/yes CPU workload; no renderer or performance sample.',
    limitation:
      'A process that starts and exits entirely between snapshots can evade process polling. CPU time has host ps tick resolution; this monitor is a guard alongside the required operational ban on concurrent work.',
  };
  // The negative control must exceed the aggregate allowance even on an otherwise idle host.
  const burnerCount =
    Math.floor((quietPolicy.maxTotalCpuMs ?? 20) / (quietPolicy.intervalMs ?? 1000)) + 1;
  report.burnerProcesses = burnerCount;
  let burners = [];
  const startBurners = () => {
    for (let index = 0; index < burnerCount; index++)
      burners.push(spawn('/usr/bin/yes', [], { stdio: 'ignore' }));
  };
  const stopBurners = () => {
    for (const burner of burners) burner.kill('SIGKILL');
    burners = [];
  };
  async function schedule(name, contaminate) {
    const directory = resolve(out, name);
    mkdirSync(directory);
    const resultPath = resolve(directory, 'result.json');
    const started = resolve(directory, 'started');
    const workerCode = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(started)},'started'); setTimeout(()=>fs.writeFileSync(${JSON.stringify(resultPath)},'{}'),${contaminate ? 4000 : 1200});`;
    const queue = {
      directory,
      identity: { acceptance: name },
      mode: 'acceptance',
      quietPolicy,
      jobs: [
        {
          id: name,
          argv: [process.execPath, '-e', workerCode],
          outputs: [resultPath],
          timeoutMs: 10000,
        },
      ],
    };
    const queuePath = resolve(directory, 'queue.json');
    writeFileSync(queuePath, JSON.stringify(queue));
    let log = '';
    let ended = false;
    const child = spawn(
      process.execPath,
      [resolve(ROOT, 'tools/perf/scheduler.mjs'), '--queue', queuePath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    child.stdout.on('data', (bytes) => {
      log += bytes;
    });
    child.stderr.on('data', (bytes) => {
      log += bytes;
    });
    const completion = new Promise((done, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        ended = true;
        done(code);
      });
    });
    if (contaminate) {
      while (!ended && !existsSync(started)) await pause(25);
      if (!ended) startBurners();
    }
    const code = await completion;
    stopBurners();
    writeFileSync(resolve(directory, 'process.log'), log);
    const journalPath = resolve(directory, 'scheduler.jsonl');
    const events = existsSync(journalPath)
      ? readFileSync(journalPath, 'utf8').trim().split('\n').map(JSON.parse)
      : [];
    return { code, log, events, workerStarted: existsSync(started) };
  }
  try {
    await processSnapshot();
    const baseline = await schedule('quiet-baseline', false);
    if (baseline.code !== 0)
      throw new Error(`Quiet baseline unavailable (host may be busy): ${baseline.log}`);
    report.checks.push({ name: 'real quiet baseline', passed: true });
    startBurners();
    await pause(100);
    const busy = await schedule('busy-start', false);
    if (busy.code === 0 || busy.workerStarted || !busy.log.includes('Busy host'))
      throw new Error(`Busy-start rejection failed: ${busy.log}`);
    report.checks.push({ name: 'real arbitrary-process busy-start rejection', passed: true });
    const contaminated = await schedule('contamination', true);
    if (
      contaminated.code === 0 ||
      !contaminated.events.some((event) => event.event === 'invalid' && event.contaminated)
    )
      throw new Error(`During-job contamination invalidation failed: ${contaminated.log}`);
    report.checks.push({ name: 'real during-job contamination invalidation', passed: true });
    report.completed = true;
  } catch (error) {
    report.blocker = error.message;
  } finally {
    stopBurners();
    writeFileSync(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: resolve(ROOT, `.tmp/perf/host-acceptance-${Date.now()}`) },
      policy: { type: 'string', default: resolve(ROOT, 'v13/docs/perf/POLICY.json') },
    },
  });
  if (!values.out)
    throw new Error(
      'Usage: node tools/perf/host-acceptance.mjs --out <fresh-directory> [--policy POLICY.json]'
    );
  const result = await hostAcceptance(
    values.out,
    JSON.parse(readFileSync(values.policy, 'utf8')).quiet
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.completed) process.exitCode = 1;
}
