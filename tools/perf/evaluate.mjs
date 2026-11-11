/** P11/P12 decision function. Stored raw inputs and this frozen policy decide; no model does. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical } from './scheduler.mjs';

export const POLICY = Object.freeze(
  JSON.parse(readFileSync(new URL('../../v13/docs/perf/POLICY.json', import.meta.url), 'utf8'))
);
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const policySha256 = digest(JSON.stringify(POLICY));
export const PIN_KEYS = [
  'sampleSha256',
  'browserSubsetSha256',
  'baseArtifactSha256',
  'headArtifactSha256',
  'baseSourceSha256',
  'headSourceSha256',
  'policySha256',
];
const hashPattern = /^[a-f0-9]{64}$/;
export function median(values) {
  if (!Array.isArray(values) || !values.length || values.some((x) => !Number.isFinite(x) || x <= 0))
    throw new Error('Missing or invalid timing repetitions');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function geomean(values) {
  return Math.exp(values.reduce((sum, x) => sum + Math.log(x), 0) / values.length);
}
export function bucketFor(source) {
  const n = typeof source === 'number' ? source : Buffer.byteLength(source);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid source byte count');
  return POLICY.buckets.find((b) => n >= b.minBytes && (b.maxBytes === null || n < b.maxBytes))
    .name;
}
export function validateBrowserPinEvidence(pin) {
  if (
    !pin ||
    typeof pin.version !== 'string' ||
    !pin.version ||
    typeof pin.executablePath !== 'string' ||
    !pin.executablePath ||
    !hashPattern.test(pin.executableSha256) ||
    !Array.isArray(pin.fonts) ||
    !pin.fonts.length ||
    pin.fonts.some(
      (font) => typeof font.path !== 'string' || !font.path || !hashPattern.test(font.sha256)
    ) ||
    !pin.os?.platform ||
    !pin.os?.release ||
    JSON.stringify(pin.settings?.viewport) !== JSON.stringify(POLICY.browser.viewport) ||
    pin.settings.deviceScaleFactor !== POLICY.browser.deviceScaleFactor ||
    pin.settings.colorScheme !== POLICY.browser.colorScheme
  )
    throw new Error('Incomplete pinned browser/font/settings evidence');
}
function requireEvidence(evidence, kind, pins) {
  if (
    !evidence ||
    evidence.kind !== kind ||
    evidence.schemaVersion !== 1 ||
    evidence.scope !== 'formal' ||
    evidence.complete !== true
  )
    throw new Error(`Missing complete formal ${kind} evidence`);
  for (const key of PIN_KEYS)
    if (evidence.pins?.[key] !== pins[key])
      throw new Error(`${kind} evidence pin mismatch: ${key}`);
}
function requireRecords(evidence, count, indices) {
  if (!Array.isArray(evidence.records) || evidence.records.length !== count)
    throw new Error(`${evidence.kind} requires exactly ${count} records`);
  const seen = new Set();
  for (const record of evidence.records) {
    if (
      !Number.isInteger(record.index) ||
      seen.has(record.index) ||
      !(indices ? indices.has(record.index) : record.index >= 0 && record.index < count)
    )
      throw new Error(`${evidence.kind} has invalid or duplicate index`);
    seen.add(record.index);
  }
}
function timingSummary(records) {
  const ratios = records.map((r) => {
    const base = r.baseNs ?? r.base;
    const head = r.headNs ?? r.head;
    if (base?.length !== POLICY.timing.pairs || head?.length !== POLICY.timing.pairs)
      throw new Error('Incomplete timing repetitions');
    return { bucket: bucketFor(r.sourceBytes), base: median(base), head: median(head) };
  });
  const buckets = {};
  for (const { name } of POLICY.buckets) {
    const rows = ratios.filter((r) => r.bucket === name);
    buckets[name] = {
      count: rows.length,
      ratio: rows.length ? geomean(rows.map((r) => r.head / r.base)) : null,
    };
  }
  return { ratio: geomean(ratios.map((r) => r.head / r.base)), buckets };
}
function checkResult(result, name) {
  if (
    !result ||
    result.name !== name ||
    result.exitCode !== 0 ||
    typeof result.command !== 'string' ||
    !result.command ||
    !hashPattern.test(result.logSha256)
  )
    throw new Error(`Missing passing ${name} command evidence`);
}
/** Load verbatim worker output and its scheduler completion; no timing is run here. */
export function loadMeasurementEvidence({ queuePath, receipt, outputPath }) {
  return {
    queue: JSON.parse(readFileSync(queuePath, 'utf8')),
    receipt,
    output: { path: resolve(outputPath), raw: readFileSync(outputPath, 'utf8') },
  };
}
/** A worker flag cannot attest to a quiet host; require its scheduler's completed window. */
export function verifyMeasurementEvidence(proof, { pins, records, noiseBlock } = {}) {
  const { queue, receipt, output } = proof ?? {};
  if (
    !queue ||
    !receipt ||
    !output ||
    queue.mode !== 'formal' ||
    canonical(queue.quietPolicy) !== canonical(POLICY.quiet)
  )
    throw new Error('Missing formal scheduler/quiet evidence');
  const expectedPins = pins;
  for (const key of PIN_KEYS)
    if (queue.identity?.pins?.[key] !== expectedPins[key])
      throw new Error(`Scheduler source/policy identity mismatch: ${key}`);
  const frozen = canonical({
    identity: queue.identity,
    jobs: queue.jobs,
    mode: queue.mode,
    quietPolicy: queue.quietPolicy,
  });
  if (
    receipt.event !== 'complete' ||
    receipt.completed !== true ||
    receipt.mode !== 'formal' ||
    receipt.timingEligible !== true ||
    receipt.contaminated !== false ||
    receipt.identitySha256 !== digest(frozen) ||
    !receipt.attempt
  )
    throw new Error('Missing clean completed scheduler receipt');
  const jobs = queue.jobs?.filter((job) => job.id === receipt.id);
  if (
    jobs?.length !== 1 ||
    !Array.isArray(jobs[0].outputs) ||
    !jobs[0].outputs.includes(output.path) ||
    !Array.isArray(receipt.outputs) ||
    canonical(receipt.outputs.map((item) => item.path).sort()) !==
      canonical([...jobs[0].outputs].sort())
  )
    throw new Error('Scheduler output identity mismatch');
  const matched = receipt.outputs.filter((item) => item.path === output.path);
  if (
    matched.length !== 1 ||
    typeof output.raw !== 'string' ||
    matched[0].sha256 !== digest(output.raw)
  )
    throw new Error('Scheduler raw timing hash mismatch');
  const raw = JSON.parse(output.raw);
  if (
    raw.completed !== true ||
    raw.contaminated !== false ||
    raw.timingEligible !== true ||
    raw.mode !== 'formal' ||
    canonical(raw.policy) !== canonical(POLICY) ||
    canonical(raw.records) !== canonical(records)
  )
    throw new Error('Scheduler raw timing/policy mismatch');
  for (const key of PIN_KEYS)
    if (raw.pins?.[key] !== expectedPins[key])
      throw new Error(`Raw timing source/policy identity mismatch: ${key}`);
  if (noiseBlock !== undefined && (raw.experiment !== 'aa' || raw.block !== noiseBlock))
    throw new Error('A/A scheduler block mismatch');
  if (
    raw.comparison?.base !== 'v13' ||
    raw.comparison.head !== 'v13' ||
    raw.comparison.baseCache !== 'off' ||
    raw.comparison.headCache !== 'off' ||
    raw.comparison.sourceMutation !== 'none'
  )
    throw new Error('Acceptance requires paired unmodified cache-off v13 timing');
  const quiet = receipt.quiet;
  if (
    !Array.isArray(quiet?.startup) ||
    quiet.startup.length < Math.ceil(POLICY.quiet.quietMs / POLICY.quiet.intervalMs) ||
    !Array.isArray(quiet.monitoring) ||
    !quiet.monitoring.length ||
    quiet.skipped
  )
    throw new Error('Missing startup or monitored quiet-window samples');
  for (const sample of [...quiet.startup, ...quiet.monitoring]) {
    if (
      sample.busy !== false ||
      !Number.isFinite(sample.intervalMs) ||
      sample.intervalMs <= 0 ||
      !Number.isFinite(sample.totalCpuMs) ||
      sample.totalCpuMs < 0 ||
      sample.totalCpuMs > POLICY.quiet.maxTotalCpuMs ||
      !Array.isArray(sample.offenders) ||
      sample.offenders.some(
        (process) =>
          !Number.isFinite(process.deltaMs) ||
          process.deltaMs < 0 ||
          process.deltaMs > POLICY.quiet.maxCpuMs
      ) ||
      !Array.isArray(sample.load) ||
      sample.load.length !== 3 ||
      sample.load.some((load) => !Number.isFinite(load) || load < 0)
    )
      throw new Error('Contaminated or incomplete quiet-window sample');
    if (
      Math.abs(
        sample.offenders.reduce((sum, process) => sum + process.deltaMs, 0) - sample.totalCpuMs
      ) > 1e-7
    )
      throw new Error('Inconsistent quiet-window CPU evidence');
  }
  if (quiet.startup.reduce((sum, sample) => sum + sample.intervalMs, 0) < POLICY.quiet.quietMs)
    throw new Error('Incomplete quiet startup duration');
  return raw;
}
export function evaluate(bundle) {
  const reasons = [];
  const result = {
    verdict: 'blocked',
    lane: null,
    reasons,
    metrics: null,
    delivery: 'awaiting-evaluation',
  };
  try {
    const { pins, timing, noise, bytes, surface, pixels, checks, size } = bundle;
    if (JSON.stringify(bundle.policy) !== JSON.stringify(POLICY))
      throw new Error('Frozen policy mismatch');
    for (const key of PIN_KEYS)
      if (!hashPattern.test(pins?.[key])) throw new Error(`Missing valid pin: ${key}`);
    if (pins.policySha256 !== policySha256) throw new Error('Policy digest mismatch');
    for (const [kind, evidence] of Object.entries({ timing, noise, bytes, surface, checks, size }))
      requireEvidence(evidence, kind, pins);
    if (timing.contaminated !== false || noise.contaminated !== false)
      throw new Error('Missing clean measurement-window evidence');
    for (const evidence of [timing, bytes, surface]) requireRecords(evidence, POLICY.sampleCount);
    if (!Array.isArray(noise.estimates) || noise.estimates.length !== POLICY.timing.aaBlocks)
      throw new Error('Incomplete A/A estimates');
    for (const key of PIN_KEYS)
      if (!hashPattern.test(noise.referencePins?.[key]))
        throw new Error(`Missing frozen noise reference pin: ${key}`);
    for (const key of ['sampleSha256', 'browserSubsetSha256', 'policySha256'])
      if (noise.referencePins[key] !== pins[key])
        throw new Error(`Frozen noise reference cannot relabel ${key}`);
    if (
      noise.referencePins.baseSourceSha256 !== noise.referencePins.headSourceSha256 ||
      noise.referencePins.baseArtifactSha256 !== noise.referencePins.headArtifactSha256
    )
      throw new Error('Frozen noise reference must identify A/A artifacts');
    verifyMeasurementEvidence(timing.measurement, { pins, records: timing.records });
    const sampleBuckets = new Map(timing.records.map((r) => [r.index, r.sourceBytes]));
    const deviations = noise.estimates
      .map((estimate, block) => {
        verifyMeasurementEvidence(estimate.measurement, {
          pins: noise.referencePins,
          records: estimate.records,
          noiseBlock: block,
        });
        requireRecords({ kind: 'A/A', records: estimate.records }, POLICY.sampleCount);
        if (estimate.records.some((r) => sampleBuckets.get(r.index) !== r.sourceBytes))
          throw new Error('A/A bucket membership mismatch');
        return Math.abs(Math.log(timingSummary(estimate.records).ratio));
      })
      .sort((a, b) => a - b);
    const spread = Math.expm1(deviations[Math.ceil(0.95 * deviations.length) - 1]);
    const threshold = Math.max(POLICY.fit.minimumGain, POLICY.fit.noiseMultiplier * spread);
    const summary = timingSummary(timing.records);
    let baseBytes = 0;
    let headBytes = 0;
    for (const row of bytes.records) {
      if (
        ![row.baseSha256, row.headSha256].every((x) => hashPattern.test(x)) ||
        ![row.baseBytes, row.headBytes].every((x) => Number.isSafeInteger(x) && x > 0)
      )
        throw new Error('Invalid byte evidence');
      if (row.baseSha256 === row.headSha256 && row.baseBytes !== row.headBytes)
        throw new Error('Inconsistent byte equality');
      baseBytes += row.baseBytes;
      headBytes += row.headBytes;
    }
    result.lane = bytes.records.every((r) => r.baseSha256 === r.headSha256)
      ? 'byte-identical'
      : 'output';
    for (const row of surface.records) {
      if (
        ![row.baseSha256, row.headSha256].every((x) => hashPattern.test(x)) ||
        row.equal !== (row.baseSha256 === row.headSha256)
      )
        throw new Error('Invalid public-surface evidence');
      if (!row.equal) reasons.push(`Protected public surface changed at index ${row.index}`);
    }
    if (result.lane === 'output') {
      requireEvidence(pixels, 'pixels', pins);
      validateBrowserPinEvidence(bundle.browserPin);
      const indices = bundle.browserIndices;
      if (
        !Array.isArray(indices) ||
        indices.length !== POLICY.browserCount ||
        new Set(indices).size !== POLICY.browserCount ||
        indices.some((x) => !Number.isInteger(x) || x < 0 || x >= POLICY.sampleCount)
      )
        throw new Error('Missing fixed browser indices');
      if (digest(JSON.stringify(indices)) !== pixels.indicesSha256)
        throw new Error('Browser indices evidence mismatch');
      if (
        !hashPattern.test(pixels.browserPinSha256) ||
        digest(JSON.stringify(bundle.browserPin)) !== pixels.browserPinSha256
      )
        throw new Error('Missing browser/font/settings pin');
      if (
        typeof bundle.browserSubsetRaw !== 'string' ||
        digest(bundle.browserSubsetRaw) !== pins.browserSubsetSha256 ||
        JSON.stringify(JSON.parse(bundle.browserSubsetRaw)) !== JSON.stringify(indices)
      )
        throw new Error('Browser subset does not match frozen pin');
      requireRecords(pixels, POLICY.browserCount, new Set(indices));
      for (const row of pixels.records) {
        if (
          ![row.baseSha256, row.headSha256].every((x) => hashPattern.test(x)) ||
          row.equal !== (row.baseSha256 === row.headSha256)
        )
          throw new Error('Invalid pixel evidence');
        if (!row.equal) reasons.push(`Pixel difference at index ${row.index}`);
      }
      checkResult(
        checks.results?.find((r) => r.name === 'security'),
        'security'
      );
      checkResult(
        checks.results?.find((r) => r.name === 'e2e'),
        'e2e'
      );
    }
    // Security evidence is mandatory even for byte-identical candidates: stale or absent results cannot establish fit.
    checkResult(
      checks.results?.find((r) => r.name === 'security'),
      'security'
    );
    checkResult(
      checks.results?.find((r) => r.name === 'check'),
      'check'
    );
    checkResult({ ...size, name: 'size' }, 'size');
    if (size.passed !== true) reasons.push('Size budget failed');
    const gain = 1 - summary.ratio;
    const byteReduction = 1 - headBytes / baseBytes;
    const flat = Math.abs(Math.log(summary.ratio)) <= Math.log1p(spread);
    if (!(gain > threshold || (byteReduction >= POLICY.fit.minimumByteReduction && flat)))
      reasons.push('Node gain/flat-time byte reduction threshold failed');
    for (const [name, bucket] of Object.entries(summary.buckets))
      if (bucket.ratio !== null && bucket.ratio > 1 + POLICY.fit.maximumBucketRegression)
        reasons.push(`Size bucket ${name} regressed more than 1%`);
    result.metrics = {
      ...summary,
      gain,
      spread,
      threshold,
      flat,
      baseBytes,
      headBytes,
      byteReduction,
    };
    result.verdict = reasons.length ? 'unfit' : 'fit';
    result.delivery =
      result.verdict === 'fit'
        ? bundle.requirementAmendment?.required === true &&
          bundle.requirementAmendment?.approved !== true
          ? 'awaiting-approval'
          : 'ready'
        : 'not-deliverable';
  } catch (error) {
    reasons.push(error.message);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { input: { type: 'string' }, out: { type: 'string' } } });
  const result = evaluate(JSON.parse(readFileSync(values.input, 'utf8')));
  const output = JSON.stringify(result, null, 2) + '\n';
  if (values.out) writeFileSync(values.out, output, { flag: 'wx' });
  else process.stdout.write(output);
  if (result.verdict !== 'fit') process.exitCode = 1;
}
