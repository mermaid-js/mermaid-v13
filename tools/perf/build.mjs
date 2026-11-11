/** Immutable minimal timing/diagnostic artifacts. Never run builds during a measurement window. */
import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRIES = resolve(ROOT, 'tools/perf/entries');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => hash(readFileSync(file));
const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

export function verifyArtifacts(manifestOrPath, { sources = true, expectedManifestSha256 } = {}) {
  const manifest =
    typeof manifestOrPath === 'string'
      ? JSON.parse(readFileSync(manifestOrPath, 'utf8'))
      : manifestOrPath;
  if (
    expectedManifestSha256 &&
    (typeof manifestOrPath !== 'string' || fileHash(manifestOrPath) !== expectedManifestSha256)
  )
    throw new Error('Artifact manifest hash mismatch');
  if (
    manifest.schema !== 1 ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length === 0 ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length === 0
  )
    throw new Error('Invalid artifact manifest');
  for (const item of [...manifest.artifacts, ...(sources ? manifest.sources : [])]) {
    if (!existsSync(item.path) || fileHash(item.path) !== item.sha256)
      throw new Error(`Artifact/source hash mismatch: ${item.path}`);
  }
  for (const kind of ['v13', 'pele'])
    for (const variant of ['timing', 'diagnostic']) {
      const entry = manifest.entries?.[kind]?.[variant]?.entry;
      if (!entry || !manifest.artifacts.some((item) => item.path === entry))
        throw new Error(`Missing entry evidence: ${kind}/${variant}`);
    }
  if (
    hash(JSON.stringify(manifest.sources)) !== manifest.sourceDigest ||
    hash(JSON.stringify(manifest.artifacts)) !== manifest.artifactDigest
  )
    throw new Error('Artifact/source manifest digest mismatch');
  return manifest;
}

function replaceOnce(contents, target, replacement, path) {
  if (contents.split(target).length !== 2)
    throw new Error(`Instrumentation target moved: ${path}: ${target}`);
  return contents.replace(target, replacement);
}

export async function buildArtifacts({
  v13 = ROOT,
  pele = resolve(ROOT, 'packages/bench/node_modules/pele'),
  targets = resolve(ENTRIES, 'targets.json'),
  out,
} = {}) {
  if (!out) throw new Error('An explicit fresh output directory is required');
  v13 = realpathSync(v13);
  pele = realpathSync(pele);
  out = resolve(out);
  if (existsSync(out)) throw new Error(`Immutable output already exists: ${out}`);
  const pinsPath = resolve(targets);
  const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
  const requiredV13Targets = [
    'packages/mermaid/src/api.ts',
    'packages/mermaid/src/analysis-reset.ts',
    'packages/mermaid/src/measurer.ts',
    'packages/core/src/text/label.ts',
    'packages/core/src/timing/index.ts',
    'packages/diagram-flowchart/src/plugin.ts',
    'packages/diagram-flowchart/src/render/render.ts',
  ];
  if (
    pins.schema !== 1 ||
    !Array.isArray(pins.targets) ||
    requiredV13Targets.some(
      (path) => !pins.targets.some((pin) => pin.root === 'v13' && pin.path === path)
    ) ||
    !pins.targets.some((pin) => pin.root === 'pele' && pin.path === pins.peleMeasurer?.path) ||
    pins.targets.some(
      (pin) => !['v13', 'pele'].includes(pin.root) || !/^[a-f0-9]{64}$/.test(pin.sha256)
    ) ||
    pins.peleMeasurer?.targets?.length !== 2 ||
    pins.peleMeasurer.targets.some((target) => typeof target !== 'string' || !target)
  )
    throw new Error('Incomplete or invalid non-public target pins');
  const labManifestPath = resolve(ROOT, 'v13/docs/perf/LAB-SOURCES.json');
  const labManifest = JSON.parse(readFileSync(labManifestPath, 'utf8'));
  for (const item of labManifest.files) {
    if (fileHash(resolve(labManifest.source, item.file)) !== item.sha256)
      throw new Error(`Lab provenance hash mismatch: ${item.file}`);
  }
  const pelePackage = resolve(pele, 'package.json');
  if (JSON.parse(readFileSync(pelePackage, 'utf8')).version !== pins.peleVersion)
    throw new Error(`Pele version must be ${pins.peleVersion}`);
  for (const pin of pins.targets) {
    const path = resolve(pin.root === 'v13' ? v13 : pele, pin.path);
    if (fileHash(path) !== pin.sha256) throw new Error(`Non-public target hash mismatch: ${path}`);
  }
  const aliases = {
    'perf:v13/slim': resolve(v13, 'packages/mermaid/src/slim.ts'),
    'perf:v13/measurer': resolve(v13, 'packages/mermaid/src/measurer.ts'),
    'perf:v13/reset': resolve(v13, 'packages/mermaid/src/analysis-reset.ts'),
    'perf:v13/flowchart': resolve(v13, 'packages/diagram-flowchart/src/index.ts'),
    'perf:v13/text': resolve(v13, 'packages/core/src/text/index.ts'),
    'perf:v13/timing': resolve(v13, 'packages/core/src/timing/index.ts'),
    'perf:v13/preprocess': resolve(v13, 'packages/core/src/preprocess/index.ts'),
    'perf:v13/parser-kit': resolve(v13, 'packages/core/src/parser-kit/index.ts'),
    'perf:pele/core': resolve(pele, 'dist/esm/core.js'),
    'perf:pele/flowchart': resolve(pele, 'dist/esm/diagrams/flowchart.js'),
    'perf:pele/counters': resolve(ENTRIES, 'pele-counters.mjs'),
    'perf:v13/counters': resolve(ENTRIES, 'v13-counters.mjs'),
  };
  const inputHashes = new Map();
  const addInput = (path, bytes = readFileSync(path)) => {
    const sha256 = hash(bytes);
    if (inputHashes.has(path) && inputHashes.get(path) !== sha256)
      throw new Error(`Source changed during build: ${path}`);
    inputHashes.set(path, sha256);
  };
  // Resolution/configuration inputs and the build driver are evidence too.
  for (const path of [
    fileURLToPath(import.meta.url),
    pinsPath,
    pelePackage,
    resolve(v13, 'pnpm-lock.yaml'),
    resolve(v13, 'package.json'),
    resolve(v13, 'tsconfig.json'),
    labManifestPath,
  ])
    addInput(path);
  const sourceCommit = git(v13, 'rev-parse', 'HEAD');
  const sourceStatus = git(v13, 'status', '--porcelain');
  mkdirSync(out, { recursive: true });
  const artifacts = [];
  const entries = {};
  for (const kind of ['v13', 'pele']) {
    entries[kind] = {};
    for (const variant of ['timing', 'diagnostic']) {
      const diagnostic = variant === 'diagnostic';
      const outdir = resolve(out, kind, variant);
      const result = await build({
        entryPoints: [resolve(ENTRIES, `${kind}${diagnostic ? '-diagnostic' : ''}.mjs`)],
        absWorkingDir: v13,
        outdir,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        conditions: ['mermaid-source'],
        alias: aliases,
        define: { __MERMAID_BENCH__: String(diagnostic && kind === 'v13') },
        splitting: kind === 'v13',
        minify: !diagnostic,
        sourcemap: diagnostic ? 'linked' : false,
        sourcesContent: diagnostic,
        entryNames: 'index',
        chunkNames: 'chunks/[name]-[hash]',
        outExtension: { '.js': '.mjs' },
        legalComments: 'none',
        logLevel: 'warning',
        metafile: true,
        write: false,
        plugins: [
          {
            name: 'pinned-inputs-and-diagnostic-only-instrumentation',
            setup(builder) {
              builder.onLoad({ filter: /\.(?:[cm]?js|ts|json)$/ }, ({ path }) => {
                const raw = readFileSync(path);
                addInput(path, raw);
                // Package exports and nested tsconfig files affect resolution as well as source.
                for (let directory = dirname(path); ; directory = dirname(directory)) {
                  for (const name of ['package.json', 'tsconfig.json']) {
                    const metadata = resolve(directory, name);
                    if (existsSync(metadata)) addInput(metadata);
                  }
                  if (directory === dirname(directory)) break;
                }
                let contents = raw.toString('utf8');
                if (
                  diagnostic &&
                  kind === 'pele' &&
                  path === resolve(pele, pins.peleMeasurer.path)
                ) {
                  for (const target of pins.peleMeasurer.targets)
                    contents = replaceOnce(
                      contents,
                      target,
                      `${target}__perfCounters.measurerCalls++;`,
                      path
                    );
                  contents = `import { counters as __perfCounters } from 'perf:pele/counters';\n${contents}`;
                }
                if (
                  diagnostic &&
                  kind === 'v13' &&
                  path === resolve(v13, 'packages/core/src/text/label.ts')
                ) {
                  contents = replaceOnce(
                    contents,
                    'export function layoutLabel(',
                    'function unobservedLayoutLabel(',
                    path
                  );
                  contents += `\nexport function layoutLabel(raw, font, maxWidth, measurer, options) {
                  observeLabel(raw, font, maxWidth, measurer, options, unobservedLayoutLabel);
                  return unobservedLayoutLabel(raw, font, maxWidth, measurer, options);
                }\n`;
                  contents = `import { observeLabel } from 'perf:v13/counters';\n${contents}`;
                }
                if (
                  diagnostic &&
                  kind === 'v13' &&
                  path === resolve(v13, 'packages/diagram-flowchart/src/render/render.ts')
                ) {
                  contents = replaceOnce(
                    contents,
                    'const prepared = prepare(model, ctx);',
                    "const measureStart = performance.now(); const prepared = prepare(model, ctx); recordStage('measure', performance.now() - measureStart);",
                    path
                  );
                  contents = replaceOnce(
                    contents,
                    'const laid = (ctx.layout ?? layered)(prepared.graph);',
                    "const graphStart = performance.now(); const laid = (ctx.layout ?? layered)(prepared.graph); recordStage('graphLayout', performance.now() - graphStart);",
                    path
                  );
                  contents = `import { recordStage } from 'perf:v13/counters';\n${contents}`;
                }
                const extension = extname(path);
                return {
                  contents,
                  loader: extension === '.ts' ? 'ts' : extension === '.json' ? 'json' : 'js',
                };
              });
            },
          },
        ],
      });
      for (const file of result.outputFiles) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.contents, { flag: 'wx', mode: 0o444 });
        artifacts.push({
          path: file.path,
          relativePath: relative(out, file.path),
          sha256: hash(file.contents),
          bytes: file.contents.length,
        });
      }
      const metafile = resolve(outdir, 'metafile.json');
      const metaBytes = JSON.stringify(result.metafile, null, 2) + '\n';
      writeFileSync(metafile, metaBytes, { flag: 'wx', mode: 0o444 });
      artifacts.push({
        path: metafile,
        relativePath: relative(out, metafile),
        sha256: hash(metaBytes),
        bytes: Buffer.byteLength(metaBytes),
      });
      entries[kind][variant] = {
        entry: resolve(outdir, 'index.mjs'),
        instrumentation: diagnostic,
        minified: !diagnostic,
      };
    }
  }
  const sources = [...inputHashes]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, sha256]) => ({ path, sha256 }));
  for (const { path, sha256 } of sources)
    if (fileHash(path) !== sha256) throw new Error(`Source changed during build: ${path}`);
  if (git(v13, 'rev-parse', 'HEAD') !== sourceCommit)
    throw new Error('Source commit changed during build');
  const manifest = {
    schema: 1,
    builtAt: new Date().toISOString(),
    node: process.version,
    esbuildVersion,
    source: { root: v13, commit: sourceCommit, dirty: sourceStatus !== '', status: sourceStatus },
    pele: {
      origin: 'installed npm package',
      root: pele,
      version: pins.peleVersion,
      packageSha256: fileHash(pelePackage),
    },
    configuration: {
      maxTextSize: 10000000,
      maxEdges: 1000000,
      peleOutputLimit: Number.MAX_SAFE_INTEGER,
      otherSettings: 'renderer defaults plus source directives/front matter',
      idPolicy: { v13: 'm${index}', pele: 'p${index}' },
    },
    build: {
      platform: 'browser (also Node ESM compatible)',
      target: 'es2022',
      conditions: ['mermaid-source'],
      keepNames: false,
    },
    instrumentationPins: pins,
    instrumentationPinsFile: { path: pinsPath, sha256: fileHash(pinsPath) },
    entries,
    sources,
    artifacts,
    sourceDigest: hash(JSON.stringify(sources)),
    artifactDigest: hash(JSON.stringify(artifacts)),
    provenance: {
      labManifest: resolve(ROOT, 'v13/docs/perf/LAB-SOURCES.json'),
      labManifestSha256: fileHash(resolve(ROOT, 'v13/docs/perf/LAB-SOURCES.json')),
    },
  };
  const manifestPath = resolve(out, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o444,
  });
  verifyArtifacts(manifest);
  return { manifest, manifestPath, manifestSha256: fileHash(manifestPath) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      v13: { type: 'string' },
      pele: { type: 'string' },
      targets: { type: 'string' },
      out: { type: 'string' },
      verify: { type: 'string' },
    },
  });
  if (values.verify) {
    verifyArtifacts(resolve(values.verify));
    console.log(JSON.stringify({ verified: resolve(values.verify) }));
  } else {
    const result = await buildArtifacts(values);
    console.log(
      JSON.stringify({ manifestPath: result.manifestPath, manifestSha256: result.manifestSha256 })
    );
  }
}
