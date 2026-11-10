/** Freeze, rehearse, run/resume and reproduce round zero. Formal execution is a separate session. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, platform, release, arch } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildArtifacts, verifyArtifacts } from './build.mjs';
import { requiredChecks, validateAcceptance } from './acceptance.mjs';
import { POLICY, policySha256, median, geomean, validateBrowserPinEvidence } from './evaluate.mjs';
import { runQueue, canonical } from './scheduler.mjs';
import {
  root,
  readJson,
  readSample,
  requirePrivate,
  sha,
  workspaceFingerprint,
  writeJson,
} from './common.mjs';

function environment(profile) {
  const result = spawnSync(
    process.execPath,
    ['tools/perf/check-environment.mjs', ...(profile === 'node' ? ['--node-only'] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
    }
  );
  let preflightReport;
  try {
    preflightReport = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Environment check failed: ${result.stderr || result.error}`);
  }
  if (result.status !== 0 || preflightReport.checks.some((check) => !check.ok))
    throw new Error(`Environment preflight failed: ${JSON.stringify(preflightReport)}`);
  return preflightReport;
}
async function prepare({ out, acceptance, rehearsal, browser, 'node-only': nodeOnly }) {
  if (nodeOnly && browser) throw new Error('--node-only cannot be combined with --browser');
  const validationProfile = nodeOnly || (rehearsal && !browser) ? 'node' : 'full';
  out = resolve(out);
  requirePrivate(resolve(out, 'header.json'));
  if (existsSync(out)) throw new Error('Choose a fresh output directory; use run to resume');
  if (process.version !== 'v24.16.0') throw new Error('Select pinned Node 24.16.0');
  if (process.execArgv.length || process.env.NODE_OPTIONS)
    throw new Error('Use the documented plain Node launcher without exec flags or NODE_OPTIONS');
  const source = workspaceFingerprint();
  const mode = rehearsal ? 'rehearsal' : 'formal';
  const checks = rehearsal
    ? null
    : validateAcceptance(acceptance, source.sha256, validationProfile);
  const preflight = rehearsal ? null : environment(validationProfile);
  const sample = readSample();
  mkdirSync(out, { recursive: true });
  const built = await buildArtifacts({ out: resolve(out, 'artifacts') });
  const resetProof = {};
  for (const kind of ['v13', 'pele']) {
    const entry = await import(pathToFileURL(built.manifest.entries[kind].diagnostic.entry));
    resetProof[kind] = await entry.verifyReset();
  }
  const browserPin =
    validationProfile === 'full' ? await (await import('./browser.mjs')).createBrowserPin() : null;
  const pins = {
    sampleSha256: sample.pins.sampleSha256,
    browserSubsetSha256: sample.pins.browserSubsetSha256,
    baseArtifactSha256: built.manifest.artifactDigest,
    headArtifactSha256: built.manifest.artifactDigest,
    baseSourceSha256: built.manifest.sourceDigest,
    headSourceSha256: built.manifest.sourceDigest,
    policySha256,
  };
  const header = {
    schemaVersion: 1,
    round: 0,
    mode,
    validationProfile,
    purpose: rehearsal
      ? 'infrastructure rehearsal; all timing numbers discarded, no fit or performance claims'
      : 'P10 baseline only; no optimization',
    createdAt: new Date().toISOString(),
    machine: { hostname: hostname(), platform: platform(), release: release(), arch: arch() },
    node: {
      version: process.version,
      execPath: process.execPath,
      sha256: sha(readFileSync(process.execPath)),
      versions: process.versions,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS ?? '',
    },
    source,
    manifest: built.manifestPath,
    manifestSha256: built.manifestSha256,
    sample: sample.pins,
    policy: POLICY,
    pins,
    resetProof,
    environment: preflight,
    browserPin,
    acceptance: checks
      ? {
          path: resolve(acceptance),
          sha256: sha(readFileSync(acceptance)),
          results: checks.results,
        }
      : null,
    instructions: {
      available: false,
      reason:
        'macOS/Apple Silicon: no Linux perf stat counter provider configured; optional diagnostic only',
    },
  };
  if (workspaceFingerprint().sha256 !== source.sha256)
    throw new Error('Source changed during preparation');
  writeJson(resolve(out, 'header.json'), header);
  const input = (path) => ({ path: resolve(path), sha256: sha(readFileSync(path)) });
  const sharedInputs = [
    input(resolve(out, 'header.json')),
    input(built.manifestPath),
    input(sample.pins.sample),
    input(sample.pins.subset),
    ...built.manifest.sources.map((file) => ({ path: file.path, sha256: file.sha256 })),
    ...built.manifest.artifacts.map((file) => ({ path: file.path, sha256: file.sha256 })),
    ...source.files
      .filter((file) => file.sha256)
      .map((file) => ({ path: resolve(root, file.path), sha256: file.sha256 })),
  ];
  const specs = [
    ...Array.from({ length: rehearsal ? 2 : POLICY.timing.aaBlocks }, (_, block) => ({
      id: `aa-${block}`,
      kind: 'timing',
      experiment: 'aa',
      block,
    })),
    ...['pele', 'trailing-comment', 'cache'].map((experiment) => ({
      id: experiment,
      kind: 'timing',
      experiment,
      block: 0,
    })),
    { id: 'diagnostics', kind: 'diagnostics' },
    { id: 'gates', kind: 'gates' },
    ...(validationProfile === 'full' ? [{ id: 'browser', kind: 'browser' }] : []),
  ];
  const jobs = specs.map((spec) => {
    const directory = resolve(out, 'raw', spec.id);
    const config = {
      ...spec,
      mode,
      out: directory,
      manifest: built.manifestPath,
      manifestSha256: built.manifestSha256,
      samplePath: sample.pins.sample,
      sampleSha256: sample.pins.sampleSha256,
      policy: POLICY,
      configuration: POLICY.configuration,
      pins,
      browserPin,
      ...(rehearsal ? { limit: 16 } : {}),
    };
    const path = resolve(out, 'jobs', `${spec.id}.json`);
    writeJson(path, config);
    return {
      id: spec.id,
      argv: [process.execPath, resolve(root, 'tools/perf/job.mjs'), '--job', path],
      cwd: root,
      timeoutMs: 6 * 3600000,
      inputs: [...sharedInputs, input(path)],
      outputs: [resolve(directory, 'result.json'), resolve(directory, 'evidence-tree.json')],
      outputTrees: [resolve(directory, 'evidence-tree.json')],
      retryCleanupPaths: [directory],
    };
  });
  writeJson(resolve(out, 'queue.json'), {
    directory: out,
    mode,
    identity: { headerSha256: sha(readFileSync(resolve(out, 'header.json'))), pins },
    jobs,
    quietPolicy: POLICY.quiet,
  });
  console.log(
    JSON.stringify({ prepared: true, mode, validationProfile, directory: out, jobs: jobs.length })
  );
}
async function run(directory) {
  const header = readJson(resolve(directory, 'header.json'));
  requiredChecks(header.validationProfile);
  if (workspaceFingerprint().sha256 !== header.source.sha256)
    throw new Error('Workspace changed since freeze');
  if (
    process.version !== header.node.version ||
    sha(readFileSync(process.execPath)) !== header.node.sha256 ||
    canonical(process.execArgv) !== canonical(header.node.execArgv) ||
    (process.env.NODE_OPTIONS ?? '') !== header.node.nodeOptions
  )
    throw new Error('Runtime changed since freeze');
  verifyArtifacts(header.manifest, { expectedManifestSha256: header.manifestSha256 });
  readSample();
  if (header.mode === 'formal') {
    validateAcceptance(header.acceptance.path, header.source.sha256, header.validationProfile);
    environment(header.validationProfile);
  }
  console.log(
    header.mode === 'formal'
      ? 'Starting formal serial queue. Agents must stay idle until this process exits.'
      : 'Starting infrastructure rehearsal. Timing values are ineligible for performance claims.'
  );
  const result = await runQueue(readJson(resolve(directory, 'queue.json')));
  writeJson(resolve(directory, 'completion.json'), result);
}
export function summary(rows, policy = POLICY) {
  const base = rows.map((row) => median(row.base));
  const head = rows.map((row) => median(row.head));
  const baseSum = base.reduce((a, b) => a + b, 0);
  const headSum = head.reduce((a, b) => a + b, 0);
  return {
    count: rows.length,
    geomeanHeadOverBase: geomean(base.map((value, i) => head[i] / value)),
    sumBaseNs: baseSum,
    sumHeadNs: headSum,
    summedHeadOverBase: headSum / baseSum,
    buckets: Object.fromEntries(
      policy.buckets.map(({ name }) => {
        const subset = rows.filter((row) => row.bucket === name);
        return [
          name,
          {
            count: subset.length,
            geomeanHeadOverBase: subset.length
              ? geomean(subset.map((row) => median(row.head) / median(row.base)))
              : null,
          },
        ];
      })
    ),
  };
}
export function report(directory, destination) {
  const header = readJson(resolve(directory, 'header.json'));
  requiredChecks(header.validationProfile);
  const queue = readJson(resolve(directory, 'queue.json'));
  const completion = readJson(resolve(directory, 'completion.json'));
  if (
    !completion.completed ||
    completion.mode !== header.mode ||
    completion.results.length !== queue.jobs.length
  )
    throw new Error('Incomplete queue; no report');
  const frozen = canonical({
    identity: queue.identity,
    jobs: queue.jobs,
    mode: queue.mode,
    quietPolicy: queue.quietPolicy,
  });
  if (
    queue.mode !== header.mode ||
    queue.identity.headerSha256 !== sha(readFileSync(resolve(directory, 'header.json'))) ||
    canonical(queue.identity.pins) !== canonical(header.pins)
  )
    throw new Error('Header/queue identity mismatch');
  if (readFileSync(resolve(queue.directory, 'queue-identity.json'), 'utf8') !== frozen)
    throw new Error('Frozen queue identity mismatch');
  if (
    canonical(header.policy) !== canonical(POLICY) ||
    sha(JSON.stringify(header.policy)) !== header.pins.policySha256
  )
    throw new Error('Frozen report policy mismatch');
  if (sha(readFileSync(header.manifest)) !== header.manifestSha256)
    throw new Error('Frozen manifest changed');
  if (
    new Set(queue.jobs.map((job) => job.id)).size !== queue.jobs.length ||
    new Set(completion.results.map((receipt) => receipt.id)).size !== completion.results.length
  )
    throw new Error('Duplicate queue/receipt identities');
  const raw = {};
  const evidence = [];
  for (const job of queue.jobs) {
    const receipt = completion.results.find((r) => r.id === job.id);
    if (
      !receipt?.completed ||
      receipt.identitySha256 !== sha(frozen) ||
      canonical(receipt.outputs?.map((item) => resolve(item.path)).sort()) !==
        canonical(job.outputs.map((path) => resolve(path)).sort()) ||
      receipt.contaminated ||
      receipt.mode !== header.mode ||
      (header.mode === 'formal' && !receipt.timingEligible)
    )
      throw new Error(`Missing valid completion: ${job.id}`);
    for (const item of receipt.outputs) {
      if (sha(readFileSync(item.path)) !== item.sha256)
        throw new Error(`Changed raw evidence: ${item.path}`);
      evidence.push(item);
    }
    for (const tree of job.outputTrees)
      for (const item of readJson(tree).files)
        if (sha(readFileSync(item.path)) !== item.sha256)
          throw new Error(`Changed nested raw evidence: ${item.path}`);
    raw[job.id] = readJson(job.outputs[0]);
    if (raw[job.id].scope !== header.mode || canonical(raw[job.id].pins) !== canonical(header.pins))
      throw new Error(`Raw evidence identity mismatch: ${job.id}`);
  }
  if (header.mode !== 'formal') {
    const result = {
      scope: 'rehearsal',
      validationProfile: header.validationProfile,
      browserValidation: header.validationProfile === 'node' ? 'unverified' : 'passed',
      timingClaims: false,
      completedJobs: Object.keys(raw),
      sampleCount: 16,
      fixedSampleUnchanged: readSample().pins.sampleSha256 === header.pins.sampleSha256,
      evidence,
      note: 'Timing values deliberately omitted; this is plumbing evidence only.',
    };
    writeJson(resolve(directory, 'rehearsal-summary.json'), result);
    console.log(JSON.stringify(result));
    return;
  }
  const policy = header.policy;
  const withBrowser = header.validationProfile === 'full';
  if (withBrowser) validateBrowserPinEvidence(header.browserPin);
  else if (header.browserPin !== null) throw new Error('Unexpected browser pin for Node-only run');
  const expectedIds = [
    ...Array.from({ length: policy.timing.aaBlocks }, (_, index) => `aa-${index}`),
    'pele',
    'trailing-comment',
    'cache',
    'diagnostics',
    'gates',
    ...(withBrowser ? ['browser'] : []),
  ];
  if (canonical(Object.keys(raw).sort()) !== canonical(expectedIds.sort()))
    throw new Error('Missing or unexpected formal experiments');
  validateAcceptance(header.acceptance?.path, header.source.sha256, header.validationProfile);
  if (sha(readFileSync(header.acceptance.path)) !== header.acceptance.sha256)
    throw new Error('Acceptance report changed');
  const expectedIndices = Array.from({ length: policy.sampleCount }, (_, index) => index);
  const requireIndices = (rows, indices, label) => {
    if (
      !Array.isArray(rows) ||
      rows.length !== indices.length ||
      canonical(rows.map((row) => row.index).sort((a, b) => a - b)) !==
        canonical([...indices].sort((a, b) => a - b))
    )
      throw new Error(`Incomplete or duplicate ${label} indices`);
  };
  const rawSample = readFileSync(header.sample.sample);
  const rawSubset = readFileSync(header.sample.subset);
  if (
    sha(rawSample) !== header.pins.sampleSha256 ||
    sha(rawSubset) !== header.pins.browserSubsetSha256
  )
    throw new Error('Frozen sample/subset changed');
  const sampleRecords = rawSample
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const subset = JSON.parse(rawSubset);
  if (
    sampleRecords.length !== policy.sampleCount ||
    subset.length !== policy.browserCount ||
    new Set(subset).size !== subset.length ||
    subset.some((index) => !Number.isInteger(index) || index < 0 || index >= policy.sampleCount)
  )
    throw new Error('Invalid frozen sample/subset');
  for (const id of expectedIds.filter(
    (experimentId) => !['diagnostics', 'gates', 'browser'].includes(experimentId)
  )) {
    const timing = raw[id];
    if (
      timing.completed !== true ||
      timing.contaminated !== false ||
      timing.timingEligible !== true ||
      canonical(timing.policy) !== canonical(policy)
    )
      throw new Error(`Incomplete formal timing: ${id}`);
    requireIndices(timing.records, expectedIndices, id);
    for (const row of timing.records) {
      const sampleRecord = sampleRecords[row.index];
      const sourceBytes = Buffer.byteLength(sampleRecord.source);
      const bucket = policy.buckets.find(
        (item) =>
          sourceBytes >= item.minBytes && (item.maxBytes === null || sourceBytes < item.maxBytes)
      ).name;
      if (
        row.sourceSha256 !== sampleRecord.sourceSha256 ||
        sha(sampleRecord.source) !== row.sourceSha256 ||
        row.sourceBytes !== sourceBytes ||
        row.bucket !== bucket ||
        row.base?.length !== policy.timing.pairs ||
        row.head?.length !== policy.timing.pairs
      )
        throw new Error(`Incomplete timing/source evidence: ${id}:${row.index}`);
      median(row.base);
      median(row.head);
    }
  }
  const { bytes, surface } = raw.gates;
  for (const [kind, gate, indices] of [
    ['bytes', bytes, expectedIndices],
    ['surface', surface, expectedIndices],
    ...(withBrowser ? [['pixels', raw.browser.pixels, subset]] : []),
  ]) {
    if (
      gate?.schemaVersion !== 1 ||
      gate.complete !== true ||
      gate.scope !== 'formal' ||
      gate.kind !== kind ||
      canonical(gate.pins) !== canonical(header.pins)
    )
      throw new Error(`Incomplete ${kind} gate`);
    requireIndices(gate.records, indices, kind);
    for (const row of gate.records) {
      if (
        !/^[a-f0-9]{64}$/.test(row.baseSha256) ||
        row.baseSha256 !== row.headSha256 ||
        (kind !== 'bytes' && row.equal !== true)
      )
        throw new Error(`Failed A/A ${kind} gate at ${row.index}`);
      if (
        kind === 'bytes' &&
        (!Number.isSafeInteger(row.baseBytes) ||
          row.baseBytes <= 0 ||
          row.baseBytes !== row.headBytes)
      )
        throw new Error('Invalid A/A byte evidence');
    }
  }
  if (withBrowser) {
    if (
      raw.browser.pixels.indicesSha256 !== sha(JSON.stringify(subset)) ||
      raw.browser.pixels.browserPinSha256 !== sha(JSON.stringify(header.browserPin)) ||
      canonical(raw.browser.browserPin) !== canonical(header.browserPin)
    )
      throw new Error('Browser pin/subset evidence mismatch');
    const browserRows = raw.browser.metrics?.records;
    if (!Array.isArray(browserRows) || browserRows.length !== 3 * policy.browserCount)
      throw new Error('Incomplete browser/Pele metrics');
    for (const kind of ['base', 'head', 'pele']) {
      const rows = browserRows.filter((row) => row.kind === kind);
      requireIndices(rows, subset, `browser ${kind}`);
      for (const row of rows)
        for (const field of ['renderMs', 'insertMs', 'getBBoxMs'])
          if (!Number.isFinite(row[field]) || row[field] < 0)
            throw new Error('Invalid browser split metric');
    }
  }
  const diagnostic = raw.diagnostics;
  if (
    diagnostic.complete !== true ||
    diagnostic.records !== policy.sampleCount ||
    diagnostic.artifactDigest !== header.pins.baseArtifactSha256 ||
    diagnostic.sourceHashesSha256 !==
      sha(JSON.stringify(sampleRecords.map((row) => row.sourceSha256))) ||
    canonical(diagnostic.policy) !== canonical(policy)
  )
    throw new Error('Incomplete P7 diagnostics identity');
  for (const kind of ['v13', 'pele']) {
    const renderer = diagnostic.renderers?.[kind];
    for (const field of ['outputBytes', 'elements', 'attributes', 'measurerCalls'])
      if (!Number.isFinite(renderer?.totals?.[field]) || renderer.totals[field] < 0)
        throw new Error(`Missing P7 ${kind} ${field}`);
    if (
      !(renderer.allocatedBytesEstimate > 0) ||
      !Number.isFinite(renderer.allocatedBytesEstimate) ||
      !Number.isFinite(renderer.gc?.scavengePauseMsPerPass) ||
      renderer.gc.scavengePauseMsPerPass < 0
    )
      throw new Error(`Missing allocation/scavenge evidence: ${kind}`);
  }
  for (const feature of [
    'frontMatter',
    'initDirectives',
    'themeVariables',
    'shapeData',
    'subgraphs',
    'comments',
    'wideLabels',
    'labelledEdges',
  ])
    for (const group of ['occurrences', 'diagrams'])
      if (
        !Number.isSafeInteger(diagnostic.features?.[group]?.[feature]) ||
        diagnostic.features[group][feature] < 0 ||
        (group === 'diagrams' && diagnostic.features[group][feature] > policy.sampleCount)
      )
        throw new Error(`Missing feature counts: ${feature}`);
  for (const stage of [
    'total',
    'parse',
    'layout',
    'serialise',
    'measure',
    'graphLayout',
    'unaccounted',
  ])
    if (!Number.isFinite(diagnostic.emptyGraph?.medianMs?.[stage]))
      throw new Error(`Missing empty graph stage ${stage}`);
  if (
    !diagnostic.methods ||
    ['allocations', 'scavenge', 'traceAllocation', 'markup', 'features', 'stages'].some(
      (key) => typeof diagnostic.methods[key] !== 'string' || !diagnostic.methods[key]
    )
  )
    throw new Error('Missing diagnostic collection methods');
  const aa = Array.from({ length: policy.timing.aaBlocks }, (_, i) =>
    summary(raw[`aa-${i}`].records, policy)
  );
  const deviations = aa
    .map((block) => Math.abs(Math.log(block.geomeanHeadOverBase)))
    .sort((a, b) => a - b);
  const spread = Math.expm1(deviations[Math.ceil(0.95 * deviations.length) - 1]);
  const aggregate = {
    schemaVersion: 1,
    round: 0,
    scope: 'formal',
    validationProfile: header.validationProfile,
    browserValidation: withBrowser ? 'passed' : 'unverified',
    pins: header.pins,
    source: { commit: readJson(header.manifest).source.commit, digest: header.source.sha256 },
    node: header.node,
    machine: header.machine,
    browserPin: header.browserPin,
    policy: header.policy,
    aa,
    spread,
    fitThreshold: Math.max(policy.fit.minimumGain, policy.fit.noiseMultiplier * spread),
    pele: summary(raw.pele.records),
    trailingComment: summary(raw['trailing-comment'].records),
    cacheOn: summary(raw.cache.records),
    diagnostics: raw.diagnostics,
    browser: withBrowser ? raw.browser.metrics : null,
    evidence,
    instructions: header.instructions,
  };
  aggregate.summedV13OverPele = 1 / aggregate.pele.summedHeadOverBase;
  // Per-record diagnostics/browser rows remain private; export their aggregates only.
  writeJson(resolve(directory, 'aggregate.json'), aggregate);
  if (!destination) throw new Error('Formal report requires --publish <runs/0 directory>');
  mkdirSync(destination, { recursive: true });
  const publicAggregate = {
    ...aggregate,
    diagnostics: {
      methods: raw.diagnostics.methods,
      renderers: Object.fromEntries(
        Object.entries(raw.diagnostics.renderers).map(([kind, renderer]) => [
          kind,
          {
            totals: renderer.totals,
            allocatedBytesEstimate: renderer.allocatedBytesEstimate,
            allocationError: renderer.allocationError,
            gc: Object.fromEntries(
              Object.entries(renderer.gc).filter(
                ([, value]) => typeof value === 'number' && Number.isFinite(value)
              )
            ),
          },
        ])
      ),
      features: raw.diagnostics.features,
      emptyGraph: raw.diagnostics.emptyGraph,
    },
    browser: withBrowser
      ? {
          method: raw.browser.metrics.method,
          rows: raw.browser.metrics.records.length,
          totalsMs: Object.fromEntries(
            ['base', 'head', 'pele'].map((kind) => [
              kind,
              Object.fromEntries(
                ['renderMs', 'insertMs', 'getBBoxMs'].map((field) => [
                  field,
                  raw.browser.metrics.records
                    .filter((row) => row.kind === kind)
                    .reduce((sum, row) => sum + row[field], 0),
                ])
              ),
            ])
          ),
        }
      : null,
  };
  writeJson(resolve(destination, 'RESULTS.json'), publicAggregate);
  writeJson(resolve(destination, 'ARTIFACTS.json'), readJson(header.manifest));
  writeJson(resolve(destination, 'HEADER.json'), {
    ...header,
    source: { sha256: header.source.sha256 },
    rawHeader: {
      path: resolve(directory, 'header.json'),
      sha256: sha(readFileSync(resolve(directory, 'header.json'))),
    },
  });
  const measurementEnvironment = policy.backgroundLoad
    ? `Measurement environment: observed background activity (${policy.backgroundLoad.decision}), with a frozen limit of ${policy.quiet.maxTotalCpuMs} ms total background CPU per interval. The per-process field equals the total limit and imposes no additional cap. The total limit is the pre-run background p95 plus 20%; this is not an idle-host baseline. Provenance is embedded in the policy in HEADER.json and RESULTS.json.`
    : 'Measurement environment: fixed quiet-host policy recorded in HEADER.json.';
  const markdown = `# Round 0 baseline\n\nFrozen sample: 5,000 diagrams. Validation profile: ${header.validationProfile}. ${withBrowser ? 'Chromium subset: 500; browser validation passed.' : 'Browser validation is unverified and deferred; this report establishes Node performance only.'}\n\n${measurementEnvironment}\n\nA/A spread: ${spread}. P12 gain threshold: ${aggregate.fitThreshold}.\n\nSummed v13/Pele ratio: ${aggregate.summedV13OverPele}. The P2 target is 0.95.\n\nAll comparisons, bucket counts, feature counts, methods, pins and raw evidence hashes are in RESULTS.json. No optimization was implemented.\n\nRerun from the same frozen inputs:\n\n\`\`\`sh\nvolta run --node 24.16.0 node tools/perf/round.mjs run --out ${directory}\nvolta run --node 24.16.0 node tools/perf/round.mjs report --out ${directory} --publish ${destination}\n\`\`\`\n\nThe run command resumes identical completed jobs; for independent timings freeze a new directory using NEXT-SESSION.md.\n`;
  writeFileSync(resolve(destination, 'REPORT.md'), markdown);
  const ledger = resolve(destination, 'hypotheses.jsonl');
  if (!existsSync(ledger)) writeFileSync(ledger, '');
  writeFileSync(
    resolve(destination, 'LEDGER.md'),
    '# Round 0 ledger\n\nNo optimization hypotheses were executed. See REPORT.md for the P10 baseline.\n'
  );
  return publicAggregate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  const { values } = parseArgs({
    args,
    options: {
      out: { type: 'string' },
      acceptance: { type: 'string' },
      rehearsal: { type: 'boolean' },
      browser: { type: 'boolean' },
      'node-only': { type: 'boolean' },
      publish: { type: 'string' },
    },
  });
  if (!values.out) throw new Error('Usage: round.mjs prepare|run|report --out <private-directory>');
  if (
    command !== 'prepare' &&
    (values['node-only'] || values.browser || values.rehearsal || values.acceptance)
  )
    throw new Error('Run/report use the frozen profile; preparation options belong on prepare');
  if (command === 'prepare') await prepare(values);
  else if (command === 'run') await run(resolve(values.out));
  else if (command === 'report')
    report(resolve(values.out), values.publish && resolve(values.publish));
  else throw new Error('Choose prepare, run or report');
}
