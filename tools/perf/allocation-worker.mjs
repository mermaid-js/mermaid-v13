/** Child-only diagnostics. Its stdout is private raw GC evidence, never benchmark output. */
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { pathToFileURL } from 'node:url';
import { counterPass, emptyPass } from './diagnostic-passes.mjs';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.version !== 'v24.16.0' || process.versions.v8 !== '13.6.233.17-node.49')
  throw new Error('Allocation diagnostics require pinned Node 24.16.0 / V8 13.6.233.17-node.49');
if (typeof global.gc !== 'function') throw new Error('--expose-gc is required');
const marker = (value) => writeSync(1, `PERF_DIAGNOSTIC ${JSON.stringify(value)}\n`);
const progress = () => writeSync(2, 'PERF_PROGRESS\n');
const profiler = new Session();
async function sample(operation) {
  profiler.connect();
  await profiler.post('HeapProfiler.enable');
  global.gc();
  await profiler.post('HeapProfiler.startSampling', {
    samplingInterval: job.samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await operation();
  // Prove/use retention of allocations whose objects have already been collected.
  global.gc();
  const { profile } = await profiler.post('HeapProfiler.stopSampling');
  profiler.disconnect();
  return profile;
}
// Named boundary lets the parent attribute only renderer allocations, excluding reset/setup,
// control flow and inspector transport. It is intentionally outside minified artifacts.
function allocationRender(renderer, source, index) {
  return renderer.render(source, index).length;
}
function allocateKnown(count, length, retain) {
  const retained = retain ? new Array(count) : undefined;
  let checksum = 0;
  for (let i = 0; i < count; i++) {
    const array = new Array(length).fill(i);
    checksum += array[i % length];
    if (retained) retained[i] = array;
  }
  return { retained, checksum };
}

if (job.mode === 'validate') {
  // A large backing store has a known payload; headers are bounded separately. Exercise
  // both live and already-collected allocations, because live-heap profiling is insufficient.
  const count = 512,
    length = 8192;
  let retained;
  const profile = await sample(() => {
    retained = allocateKnown(count, length, job.retain);
    if (!job.retain) global.gc();
  });
  const slotBytes = process.config.variables.v8_enable_pointer_compression ? 4 : 8;
  writeFileSync(
    job.result,
    JSON.stringify({
      node: process.version,
      v8: process.versions.v8,
      profile,
      retain: job.retain,
      expectedPayloadBytes: count * length * slotBytes,
      expectedMaximumBytes: count * (length * slotBytes + 128) + count * slotBytes + 4096,
      checksum: retained.checksum,
    }) + '\n'
  );
} else if (job.mode === 'counters' || job.mode === 'empty') {
  const renderer = await import(pathToFileURL(job.entry));
  renderer.configure();
  const result =
    job.mode === 'counters'
      ? await counterPass(renderer, JSON.parse(readFileSync(job.records, 'utf8')), job, progress)
      : await emptyPass(renderer, job, progress);
  writeFileSync(job.result, JSON.stringify(result) + '\n');
} else {
  const renderer = await import(pathToFileURL(job.entry));
  const records = JSON.parse(readFileSync(job.records, 'utf8'));
  renderer.configure();
  for (const [index, record] of records.entries()) {
    progress();
    await renderer.setup(record.source);
    for (let i = 0; i < job.warmups; i++) {
      progress();
      renderer.reset();
      allocationRender(renderer, record.source, index);
    }
  }
  let checksum = 0;
  if (job.mode === 'sample') {
    const profile = await sample(async () => {
      for (const [index, record] of records.entries()) {
        progress();
        await renderer.setup(record.source);
        renderer.reset();
        checksum += allocationRender(renderer, record.source, index);
      }
    });
    writeFileSync(
      job.result,
      JSON.stringify({ node: process.version, v8: process.versions.v8, profile, checksum }) + '\n'
    );
  } else if (job.mode === 'gc') {
    // Same-stream synchronous markers bracket actual renders. Forced collections establish
    // trace allocation boundaries; their pauses are never called render/scavenge time.
    global.gc();
    marker({ phase: 'batch-start' });
    for (let repetition = 0; repetition < job.repetitions; repetition++) {
      for (const [index, record] of records.entries()) {
        progress();
        await renderer.setup(record.source);
        renderer.reset();
        marker({ phase: 'render-start', index, repetition });
        checksum += allocationRender(renderer, record.source, index);
        marker({ phase: 'render-end', index, repetition });
      }
    }
    marker({ phase: 'batch-force-end' });
    global.gc();
    marker({ phase: 'batch-end' });
    writeFileSync(
      job.result,
      JSON.stringify({ node: process.version, v8: process.versions.v8, checksum }) + '\n'
    );
  } else throw new Error('Unknown allocation diagnostic mode');
}
