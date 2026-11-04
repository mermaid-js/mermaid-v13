/**
 * Packs and publishes the alpha (R-REL-2, R-REL-3, D28). Used by the release workflows.
 *
 * - `pnpm release:publish --target private [--out dir] [--dry-run]`
 * - `pnpm release:publish --target public --gate <bench report.json> [--commit <sha>] [--out dir] [--dry-run]`
 * - `pnpm release:publish --target public --skip-gate "<reason>" [--bench-report <latest.json>] --no-provenance [--otp <code>]`
 *   (manual, v13/docs/RELEASING.md)
 *
 * `private`: every published package, renamed into `@mermaid-chart`, to GitHub Packages.
 * `public`: `mermaid` and its workspace packages to npm, and only while the public-alpha gate
 * (R-PERF-1…4) passes on the given bench report; without `--gate` it refuses, unless the release
 * master passes `--skip-gate "<reason>"`. That prints the reason and the gate on the last known
 * bench (`--bench-report`, else packages/bench's latest.json, else the newest nightly report
 * through gh; `--no-bench-report` looks nothing up), without enforcing it.
 * Every version already on the registry is skipped, so only the packages `changeset version`
 * bumped go out. `--no-provenance`: npm provenance needs CI (OIDC) in a public repository, so a
 * manual publish turns it off.
 * Both publish with dist-tag `v13-alpha` only, and only `x.y.z-alpha.N` versions.
 * Registry auth comes from the environment (`NODE_AUTH_TOKEN` + the .npmrc setup-node writes).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { DIST_TAG, type Target } from './manifest.ts';
import { REGISTRIES, packAll, publishAll } from './publish.ts';
import {
  DEFAULT_REPORT,
  ROOT,
  fetchNightlyReport,
  runPublicGate,
  showLastKnownBench,
} from './public-gate-run.ts';

const args = parseArgs(process.argv.slice(2));
const target = args.get('target');
if (target !== 'private' && target !== 'public') {
  process.stderr.write('release:publish needs --target private|public\n');
  process.exit(2);
}

const skipGate = args.get('skip-gate');
if ((target as Target) === 'public' && skipGate !== undefined) {
  const report = args.flag('no-bench-report')
    ? undefined
    : (args.get('bench-report') ??
      (existsSync(DEFAULT_REPORT) ? DEFAULT_REPORT : fetchNightlyReport()));
  const head =
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  showLastKnownBench(report, skipGate, head);
} else if ((target as Target) === 'public') {
  const gate = args.get('gate');
  if (gate === undefined) {
    process.stderr.write(
      'Public publish refused: pass --gate <bench report.json> (R-REL-3 needs R-PERF-1…4),\n' +
        'or --skip-gate "<reason>" to publish without it.\n'
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
  provenance: !args.flag('no-provenance'),
  ...(args.get('otp') === undefined ? {} : { otp: args.get('otp') }),
  log: (out) => process.stdout.write(out.endsWith('\n') || out === '' ? out : `${out}\n`),
});
for (const s of skipped) process.stdout.write(`already published: ${s}\n`);
for (const s of published)
  process.stdout.write(
    `${args.flag('dry-run') ? 'would publish' : 'published'}: ${s} (tag ${DIST_TAG})\n`
  );
