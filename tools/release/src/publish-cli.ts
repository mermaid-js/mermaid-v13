/**
 * Packs and publishes the alpha (R-REL-2, R-REL-3, D28). Used by .github/workflows/release.yml.
 *
 *   pnpm release:publish --target private [--out dir] [--dry-run]
 *   pnpm release:publish --target public --gate <bench report.json> [--commit <sha>] [--out dir] [--dry-run]
 *
 * `private`: every published package, renamed into @mermaid-chart, to GitHub Packages.
 * `public`: `mermaid` and its workspace packages to npm, and only while the public-alpha gate
 * (R-PERF-1…4) passes on the given bench report; without `--gate` it refuses.
 * Both publish with dist-tag `alpha` only, and only `x.y.z-alpha.N` versions.
 * Registry auth comes from the environment (`NODE_AUTH_TOKEN` + the .npmrc setup-node writes).
 */
import { join } from 'node:path';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import type { Target } from './manifest.ts';
import { REGISTRIES, packAll, publishAll } from './publish.ts';
import { ROOT, runPublicGate } from './public-gate-run.ts';

const args = parseArgs(process.argv.slice(2));
const target = args.get('target');
if (target !== 'private' && target !== 'public') {
  process.stderr.write('release:publish needs --target private|public\n');
  process.exit(2);
}

if ((target as Target) === 'public') {
  const gate = args.get('gate');
  if (gate === undefined) {
    process.stderr.write(
      'Public publish refused: pass --gate <bench report.json> (R-REL-3 needs R-PERF-1…4).\n'
    );
    process.exit(1);
  }
  if (!runPublicGate(gate, args.get('commit') ?? (process.env.GITHUB_SHA || undefined)).allowed)
    process.exit(1);
}

const outDir = args.get('out') ?? join(ROOT, 'dist', 'release', target);
const tarballs = packAll(ROOT, { target, outDir });
for (const t of tarballs) process.stdout.write(`packed ${t.name}@${t.version} → ${t.tarball}\n`);
const { published, skipped } = publishAll(tarballs, {
  registry: REGISTRIES[target],
  dryRun: args.flag('dry-run'),
});
for (const s of skipped) process.stdout.write(`already published: ${s}\n`);
for (const s of published)
  process.stdout.write(
    `${args.flag('dry-run') ? 'would publish' : 'published'}: ${s} (tag alpha)\n`
  );
