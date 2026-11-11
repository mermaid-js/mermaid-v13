/** Runs only in the watchdog-controlled diagnostic child. */
import { svgCounts } from './diagnostic-methods.mjs';

export async function counterPass(renderer, records, job, progress) {
  const resetVerification = await renderer.verifyReset();
  const rows = [];
  for (const [index, record] of records.entries()) {
    progress();
    await renderer.setup(record.source);
    for (let repetition = 0; repetition < job.warmups; repetition++) {
      progress();
      renderer.reset();
      renderer.render(record.source, index);
    }
    const repeated = [];
    for (let repetition = 0; repetition < job.repetitions; repetition++) {
      progress();
      renderer.reset();
      renderer.resetStats();
      const svg = renderer.render(record.source, index);
      const stats = renderer.stats();
      if (
        !Number.isSafeInteger(stats.measurerCalls) ||
        stats.measurerCalls < 0 ||
        stats.parserCalls !== 1
      )
        throw new Error('Missing measurer/parser counter evidence');
      if (
        stats.metricsCalls !== undefined &&
        (!Number.isSafeInteger(stats.metricsCalls) || stats.metricsCalls < 0)
      )
        throw new Error('Invalid optional metrics counter evidence');
      repeated.push({
        ...svgCounts(svg),
        measurerCalls: stats.measurerCalls,
        parserCalls: stats.parserCalls,
        ...(stats.metricsCalls === undefined ? {} : { metricsCalls: stats.metricsCalls }),
      });
    }
    if (repeated.some((row) => JSON.stringify(row) !== JSON.stringify(repeated[0])))
      throw new Error(`Nondeterministic diagnostic counters at ${job.kind}:${index}`);
    const row = {
      kind: job.kind,
      index: record.index,
      sourceSha256: record.sourceSha256,
      repetitions: repeated,
    };
    if (job.kind === 'v13') {
      progress();
      row.features = await renderer.inspect(record.source);
    }
    rows.push(row);
  }
  return { resetVerification, rows };
}

export async function emptyPass(renderer, job, progress) {
  const empty = 'graph TD';
  await renderer.setup(empty);
  for (let i = 0; i < job.warmups; i++) {
    progress();
    renderer.reset();
    renderer.render(empty, 0);
  }
  const rows = [];
  for (let repetition = 0; repetition < job.emptyGraphRepetitions; repetition++) {
    progress();
    renderer.reset();
    renderer.resetStats();
    const start = performance.now();
    renderer.render(empty, 0);
    const totalMs = performance.now() - start;
    const measurements = renderer.stats().stages;
    for (const name of ['parse', 'layout', 'serialise', 'measure', 'graphLayout'])
      if (
        !measurements[name] ||
        measurements[name].calls !== 1 ||
        !Number.isFinite(measurements[name].ms)
      )
        throw new Error(`Missing stage instrumentation: ${name}`);
    rows.push({
      repetition,
      totalMs,
      stages: measurements,
      unaccountedMs:
        totalMs - measurements.parse.ms - measurements.layout.ms - measurements.serialise.ms,
    });
  }
  return { rows };
}
