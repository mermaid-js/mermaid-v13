/**
 * Local end-to-end rehearsal of the public alpha, before anything goes to npm:
 *
 *   pnpm release:rehearse [--nodes /path/to/node20,/path/to/node22] [--keep] [--port 4873]
 *
 * 1. Copies the working tree (tracked and untracked, not ignored) to a temp dir and runs what
 *    a release runs (v13/docs/RELEASING.md): `changeset version` and sync-version when changesets
 *    are pending (with none, the current versions are what ships), build, then `packAll` for npm
 *    with every publish gate except the bench (R-PERF needs CI's runner).
 * 2. Starts Verdaccio, proxying npmjs, and publishes the tarballs with `publishAll` and tag
 *    `alpha`, so `mermaid@latest` stays the real v12 and only `alpha` moves, as on npm.
 * 3. Installs as a user would, from fixtures/rehearsal, in fresh directories:
 *    - everything: `npm install mermaid@alpha --save-exact`, the guide's snippets on each Node,
 *      the `mermaid` bin and `npx mermaid@alpha`, an esbuild browser bundle;
 *    - pick your diagrams: `mermaid/slim` + `@mermaid-js/diagram-flowchart`, the same checks,
 *      a bundle smaller than the full one, and the published types under `nodenext`.
 * 4. Releases again after a flowchart-only changeset: only flowchart and `mermaid` publish, and
 *    an upgrade of the "everything" install picks up both and keeps core.
 * Nothing in the repository changes; the temp dir is removed unless `--keep`.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { pendingChangesets } from './changesets.ts';
import { packAll, publishAll } from './publish.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'rehearsal');
const VERDACCIO = 'verdaccio@6.1.6';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.get('port') ?? '4873');
const registry = `http://localhost:${port}/`;
const nodes = (args.get('nodes') ?? process.execPath).split(',').filter(Boolean);
const work = mkdtempSync(join(tmpdir(), 'mermaid-rehearsal-'));
const failures: string[] = [];
let verdaccio: ChildProcess | undefined;

const log = (s: string) => process.stdout.write(`${s}\n`);
const step = (s: string) => log(`\n▶ ${s}`);

/** Runs a command, returns stdout; output goes to the log only on failure. */
function run(cmd: string, argv: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  try {
    return execFileSync(cmd, argv, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(
      `${cmd} ${argv.join(' ')} (in ${cwd}) failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`
    );
  }
}

/** Records a failed check and carries on, so one run reports every problem. */
function check(name: string, f: () => string | void): void {
  try {
    const detail = f();
    log(`  ✔ ${name}${detail ? `: ${detail}` : ''}`);
  } catch (e) {
    failures.push(name);
    log(`  ✘ ${name}\n${(e as Error).message.replace(/^/gm, '    ')}`);
  }
}

async function checkAsync(name: string, f: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await f();
    log(`  ✔ ${name}${detail ? `: ${detail}` : ''}`);
  } catch (e) {
    failures.push(name);
    log(`  ✘ ${name}\n${(e as Error).message.replace(/^/gm, '    ')}`);
  }
}

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/** The working tree as git sees it, without ignored files (node_modules, dist). */
function copyWorkingTree(to: string): void {
  const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], ROOT)
    .split('\0')
    .filter(Boolean);
  for (const f of files) {
    try {
      mkdirSync(dirname(join(to, f)), { recursive: true });
      cpSync(join(ROOT, f), join(to, f));
    } catch (e) {
      // A tracked file deleted in the working tree is not part of it.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}

async function startVerdaccio(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const config = join(dir, 'config.yaml');
  writeFileSync(
    config,
    [
      `storage: ${join(dir, 'storage')}`,
      'auth:',
      '  htpasswd:',
      `    file: ${join(dir, 'htpasswd')}`,
      'uplinks:',
      '  npmjs:',
      '    url: https://registry.npmjs.org/',
      'packages:',
      "  '**':",
      '    access: $all',
      '    publish: $authenticated',
      '    proxy: npmjs',
      'log: { type: stdout, format: pretty, level: error }',
      '',
    ].join('\n')
  );
  verdaccio = spawn('npx', ['--yes', VERDACCIO, '--config', config, '--listen', String(port)], {
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${registry}-/ping`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 119) throw new Error(`Verdaccio did not start on ${registry}`);
  }
  const res = await fetch(`${registry}-/user/org.couchdb.user:rehearsal`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'rehearsal', password: 'rehearsal' }),
  });
  const { token } = (await res.json()) as { token?: string };
  assert(token, `Verdaccio gave no token (${res.status})`);
  return token;
}

function stopVerdaccio(): void {
  if (verdaccio?.pid !== undefined) {
    try {
      process.kill(-verdaccio.pid);
    } catch {
      // already gone
    }
  }
}

/** A fresh consumer directory whose npm talks only to the rehearsal registry. */
function consumer(name: string, npmrc: string): string {
  const dir = join(work, 'consumers', name);
  mkdirSync(dir, { recursive: true });
  cpSync(FIXTURES, dir, { recursive: true });
  writeFileSync(join(dir, '.npmrc'), npmrc);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `rehearsal-${name}`, private: true, type: 'module' }, null, 2)
  );
  return dir;
}

async function bundleSize(dir: string, entry: string): Promise<{ initial: number; lazy: number }> {
  const outdir = join(dir, 'out', entry.replace(/\.mjs$/, ''));
  const result = await build({
    absWorkingDir: dir,
    entryPoints: [entry],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    outdir,
    metafile: true,
    logLevel: 'silent',
  });
  const outputs = result.metafile.outputs;
  // Every dynamic-import target is an entry point too; the page's own is the one named `entry`.
  const entryOut = Object.keys(outputs).find((k) => outputs[k]!.entryPoint === entry)!;
  const eager = new Set<string>();
  const visit = (file: string): void => {
    if (eager.has(file)) return;
    eager.add(file);
    for (const i of outputs[file]!.imports) if (i.kind === 'import-statement') visit(i.path);
  };
  visit(entryOut);
  let initial = 0;
  let lazy = 0;
  for (const file of Object.keys(outputs)) {
    if (!file.endsWith('.js')) continue;
    const gz = gzipSync(readFileSync(join(dir, file))).length;
    if (eager.has(file)) initial += gz;
    else lazy += gz;
  }
  return { initial, lazy };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB gz`;

async function main(): Promise<void> {
  log(`Rehearsal in ${work}`);

  step('Version and build a copy of the working tree, as a release does');
  const repo = join(work, 'repo');
  copyWorkingTree(repo);
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], repo);
  const pending = pendingChangesets(repo);
  if (pending.length > 0) {
    log(`  versioning ${pending.length} pending changeset(s): ${pending.join(', ')}`);
    run('pnpm', ['exec', 'changeset', 'version'], repo);
    log(run('pnpm', ['-s', 'release:sync-version'], repo).trim());
  } else log('  no pending changesets: rehearsing the current versions');
  run('pnpm', ['build'], repo);
  const version = (
    JSON.parse(readFileSync(join(repo, 'packages/mermaid/package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  log(`  mermaid under test: ${version}`);

  step('Pack for npm (alpha-version, exact-range and workspace-leak gates)');
  const tarballs = packAll(repo, { target: 'public', outDir: join(work, 'tarballs') });
  for (const t of tarballs) log(`  packed ${t.name}@${t.version}`);
  check('every tarball has README.md and LICENSE', () => {
    for (const t of tarballs) {
      const files = run('tar', ['-tzf', t.tarball], work).split('\n');
      for (const f of ['package/README.md', 'package/LICENSE'])
        assert(files.includes(f), `${t.name} has no ${f.slice(8)}`);
    }
  });
  check('mermaid --version matches package.json', () => {
    const out = run('node', [join(repo, 'packages/mermaid/dist/cli.js'), '--version'], repo).trim();
    assert(out === version, `bin says ${out}`);
  });

  step(`Publish to a local Verdaccio (${registry}), tag alpha`);
  const token = await startVerdaccio(join(work, 'verdaccio'));
  const host = registry.replace(/^https?:/, '');
  const npmrc = `registry=${registry}\n${host}:_authToken=${token}\n`;
  const userconfig = join(work, 'npmrc');
  writeFileSync(userconfig, npmrc);
  // pnpm exports `npm_config_registry` (the repo's npmjs) to scripts, which beats any .npmrc.
  const npmEnv = {
    NPM_CONFIG_USERCONFIG: userconfig,
    npm_config_registry: registry,
    npm_config_cache: join(work, 'npm-cache'),
  };
  Object.assign(process.env, npmEnv);
  const { published } = publishAll(tarballs, {
    registry: { target: 'public', url: registry },
    provenance: false,
  });
  for (const p of published) log(`  published ${p}`);

  step('Registry state');
  const tagsOf = (name: string) =>
    JSON.parse(
      run('npm', ['view', name, 'dist-tags', '--json', '--registry', registry], work, npmEnv)
    ) as Partial<Record<string, string>>;
  check('mermaid@alpha is the new build', () => {
    const tags = tagsOf('mermaid');
    assert(tags.alpha === version, `alpha → ${tags.alpha}`);
    return `alpha → ${tags.alpha}`;
  });
  check('mermaid@latest is untouched (still v12)', () => {
    const tags = tagsOf('mermaid');
    assert(tags.latest?.startsWith('12.'), `latest → ${tags.latest}`);
    return `latest → ${tags.latest}`;
  });
  for (const t of tarballs.filter((p) => p.name !== 'mermaid'))
    check(`${t.name} tags`, () => {
      const tags = tagsOf(t.name);
      assert(tags.alpha === t.version, `alpha → ${tags.alpha}, released ${t.version}`);
      return JSON.stringify(tags);
    });

  step('Scenario "everything": npm install mermaid@alpha');
  const full = consumer('full', npmrc);
  run('npm', ['install', 'mermaid@alpha', '--save-exact', '--no-audit', '--no-fund'], full, npmEnv);
  check('package.json pins the exact build', () => {
    const pkg = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    assert(pkg.dependencies.mermaid === version, `mermaid: ${pkg.dependencies.mermaid}`);
  });
  check('mermaid installs exactly the package versions just released', () => {
    const tree = JSON.parse(run('npm', ['ls', '--all', '--json'], full, npmEnv)) as {
      dependencies: Record<
        string,
        { version: string; dependencies?: Record<string, { version: string }> }
      >;
    };
    const packed = new Map(tarballs.map((t) => [t.name, t.version]));
    const found = Object.entries(tree.dependencies.mermaid?.dependencies ?? {});
    assert(found.length > 0, 'mermaid has no dependencies in npm ls');
    for (const [name, d] of found)
      assert(d.version === packed.get(name), `${name}@${d.version}, released ${packed.get(name)}`);
    return found.map(([n, d]) => `${n}@${d.version}`).join(', ');
  });
  check('no third-party runtime dependencies installed', () => {
    const pkgs = run('npm', ['ls', '--all', '--parseable'], full, npmEnv)
      .split('\n')
      .filter((p) => p.includes('node_modules'))
      .map((p) => p.slice(p.lastIndexOf('node_modules/') + 13));
    const other = pkgs.filter((p) => p !== 'mermaid' && !p.startsWith('@mermaid-js/'));
    assert(other.length === 0, `also installed: ${other.join(', ')}`);
  });
  for (const node of nodes)
    check(`guide snippets on ${node}`, () => run(node, ['full.mjs'], full).trim());
  check('mermaid bin: --format ascii', () => {
    const out = run('npx', ['mermaid', 'render', 'diagram.mmd', '--format', 'ascii'], full, npmEnv);
    assert(out.includes('Ship it'), out);
  });
  check('mermaid bin: --format svg', () => {
    const out = run('npx', ['mermaid', 'render', 'diagram.mmd', '--format', 'svg'], full, npmEnv);
    assert(out.startsWith('<svg'), out.slice(0, 200));
  });
  check('npx mermaid@alpha without an install', () => {
    const empty = join(work, 'consumers', 'npx');
    mkdirSync(empty, { recursive: true });
    cpSync(join(FIXTURES, 'diagram.mmd'), join(empty, 'diagram.mmd'));
    const out = run(
      'npx',
      ['--yes', 'mermaid@alpha', 'render', 'diagram.mmd', '--format', 'ascii'],
      empty,
      npmEnv
    );
    assert(out.includes('Ship it'), out);
  });
  let fullSize = { initial: 0, lazy: 0 };
  await checkAsync('browser bundle (esbuild, code split)', async () => {
    fullSize = await bundleSize(full, 'bundle-full.mjs');
    return `initial ${kb(fullSize.initial)}, lazy chunks ${kb(fullSize.lazy)}`;
  });

  step('Scenario "pick your diagrams": mermaid/slim + @mermaid-js/diagram-flowchart');
  const slim = consumer('slim', npmrc);
  run(
    'npm',
    [
      'install',
      'mermaid@alpha',
      '@mermaid-js/diagram-flowchart@alpha',
      '--save-exact',
      '--no-audit',
      '--no-fund',
    ],
    slim,
    npmEnv
  );
  for (const node of nodes)
    check(`slim snippets on ${node}`, () => run(node, ['slim.mjs'], slim).trim());
  await checkAsync('browser bundle holds only the diagrams passed in', async () => {
    const withFlow = await bundleSize(slim, 'bundle-slim.mjs');
    const apiOnly = await bundleSize(slim, 'bundle-api-only.mjs');
    const total = (s: { initial: number; lazy: number }) => s.initial + s.lazy;
    assert(
      total(apiOnly) < total(withFlow),
      `API alone (${kb(total(apiOnly))}) is not smaller than API + flowchart (${kb(total(withFlow))})`
    );
    assert(
      total(withFlow) <= total(fullSize),
      `slim + flowchart (${kb(total(withFlow))}) is bigger than full (${kb(total(fullSize))})`
    );
    return `API only ${kb(total(apiOnly))}, API + flowchart ${kb(total(withFlow))}, full ${kb(total(fullSize))}`;
  });
  check('published types compile (nodenext, skipLibCheck off)', () => {
    run(
      process.execPath,
      [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
      slim
    );
  });

  step('Second release: a flowchart-only changeset ships flowchart and mermaid, nothing else');
  const before = new Map(tarballs.map((t) => [t.name, t.version]));
  writeFileSync(
    join(repo, '.changeset', 'rehearsal-flowchart.md'),
    "---\n'@mermaid-js/diagram-flowchart': patch\n---\n\nRehearsal: a flowchart fix\n"
  );
  run('pnpm', ['exec', 'changeset', 'version'], repo);
  run('pnpm', ['-s', 'release:sync-version'], repo);
  run('pnpm', ['build'], repo);
  const second = packAll(repo, { target: 'public', outDir: join(work, 'tarballs-2') });
  const result = publishAll(second, {
    registry: { target: 'public', url: registry },
    provenance: false,
  });
  check('publishes only the bumped packages', () => {
    const names = (specs: string[]) => specs.map((s) => s.slice(0, s.lastIndexOf('@'))).sort();
    const want = ['@mermaid-js/diagram-flowchart', 'mermaid'];
    assert(
      JSON.stringify(names(result.published)) === JSON.stringify(want),
      `published ${result.published.join(', ')}`
    );
    assert(
      JSON.stringify(names(result.skipped)) ===
        JSON.stringify(['@mermaid-js/core', '@mermaid-js/plugin-interactions']),
      `skipped ${result.skipped.join(', ')}`
    );
    return `published ${result.published.join(', ')}; skipped ${result.skipped.join(', ')}`;
  });
  check('an upgrade picks up the new flowchart and keeps core', () => {
    run(
      'npm',
      ['install', 'mermaid@alpha', '--save-exact', '--no-audit', '--no-fund'],
      full,
      npmEnv
    );
    const installed = (name: string) =>
      (
        JSON.parse(readFileSync(join(full, 'node_modules', name, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version;
    const now = new Map(second.map((t) => [t.name, t.version]));
    for (const name of ['mermaid', '@mermaid-js/diagram-flowchart', '@mermaid-js/core'])
      assert(
        installed(name) === now.get(name),
        `${name}@${installed(name)}, want ${now.get(name)}`
      );
    assert(now.get('@mermaid-js/core') === before.get('@mermaid-js/core'), 'core moved');
    return ['mermaid', '@mermaid-js/diagram-flowchart', '@mermaid-js/core']
      .map((n) => `${n} ${before.get(n)} → ${installed(n)}`)
      .join(', ');
  });
  check('guide snippets after the upgrade', () => run(nodes[0]!, ['full.mjs'], full).trim());
}

try {
  await main();
} catch (e) {
  failures.push('rehearsal aborted');
  log(`\n✘ ${(e as Error).message}`);
} finally {
  stopVerdaccio();
  if (args.flag('keep')) log(`\nKept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  log(`\n${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
log('\nAll checks passed. Nothing was published to npm.');
