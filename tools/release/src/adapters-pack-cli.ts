/**
 * Pack-and-install check for the editor adapters (#174), without a registry:
 *
 *   pnpm exec tsx tools/release/src/adapters-pack-cli.ts [--no-build]
 *
 * Builds the two adapters and the workspace packages they use, packs every published package
 * as `release:publish` does (`packAll`, public manifests, every gate but the alpha version),
 * installs the adapters' tarballs and those of the workspace packages they need into a fresh
 * project under `.tmp/adapters-pack-check/` (third-party peers come from npm), and runs
 * `adapterChecks` there. `release:rehearse` runs the same checks against its local registry.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { ADAPTER_FIXTURES, ADAPTERS, adapterChecks, workspaceClosure } from './adapters-check.ts';
import { packAll, publishedPackages } from './publish.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const WORK = join(ROOT, '.tmp', 'adapters-pack-check');
const args = parseArgs(process.argv.slice(2));
const log = (s: string) => process.stdout.write(`${s}\n`);

function run(cmd: string, argv: string[], cwd: string): void {
  execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

if (!args.flag('no-build')) {
  log('▶ Build the adapters and the workspace packages they use');
  run('pnpm', ['-r', ...ADAPTERS.flatMap((a) => ['--filter', `${a}...`]), 'run', 'build'], ROOT);
}

log('▶ Pack (public manifests, exact-range, workspace-leak and dangling-export gates)');
const tarballs = packAll(ROOT, {
  target: 'public',
  outDir: join(WORK, 'tarballs'),
  requireAlpha: false,
});
const dirs = new Map(publishedPackages(ROOT).map((p) => [p.manifest.name, p.dir]));
const needed = workspaceClosure(ADAPTERS, dirs);
const install = tarballs.filter((t) => needed.includes(t.name));
for (const t of install) log(`  ${t.name}@${t.version}`);

log('▶ Install into a fresh project');
const consumer = join(WORK, 'consumer');
cpSync(ADAPTER_FIXTURES, consumer, { recursive: true });
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify({ name: 'adapters-pack-check', private: true, type: 'module' }, null, 2)
);
run(
  'npm',
  ['install', '--no-audit', '--no-fund', '--no-package-lock', ...install.map((t) => t.tarball)],
  consumer
);

log('▶ Checks');
const failures: string[] = [];
const checks = adapterChecks(consumer, {
  tarballs: new Map(tarballs.map((t) => [t.name, t.tarball])),
  tsc: join(ROOT, 'node_modules/typescript/bin/tsc'),
});
for (const c of checks) {
  try {
    const detail = await c.run();
    log(`  ✔ ${c.name}${detail ? `: ${detail}` : ''}`);
  } catch (e) {
    failures.push(c.name);
    log(`  ✘ ${c.name}\n${(e as Error).message.replace(/^/gm, '    ')}`);
  }
}
if (failures.length > 0) {
  log(`\n${failures.length} check(s) failed. Install kept in ${consumer}`);
  process.exit(1);
}
log(`\nAll adapter checks passed (${consumer}).`);
