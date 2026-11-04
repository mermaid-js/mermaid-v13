/**
 * `pnpm release:preflight [--target public|private]`: read-only checks before a manual alpha
 * release (v13/docs/RELEASING.md). Prints each check, the release plan and the next step;
 * exits 1 when a check fails. Changes nothing but the git remote-tracking refs (`git fetch`).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { pendingChangesets } from './changesets.ts';
import { nextStep, releasePlan, type ChangesetStatus } from './preflight.ts';
import { REGISTRIES, isPublished, npm, publishedPackages } from './publish.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const args = parseArgs(process.argv.slice(2));
const target = args.get('target') ?? 'public';
if (target !== 'public' && target !== 'private') {
  process.stderr.write('release:preflight takes --target public|private\n');
  process.exit(2);
}
const registry = REGISTRIES[target].url;
const failed = { count: 0 };

const sh = (cmd: string, argv: string[]): string =>
  execFileSync(cmd, argv, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const report = (status: 'ok' | 'warn' | 'fail', name: string, detail = ''): void => {
  if (status === 'fail') failed.count++;
  const mark = { ok: '✔', warn: '⚠', fail: '✘' }[status];
  process.stdout.write(`${mark} ${name}${detail ? `: ${detail}` : ''}\n`);
};
const json = (path: string) =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;

process.stdout.write(`Release preflight (${target}, ${registry})\n\n`);

const base = json('.changeset/config.json').baseBranch as string;
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
report(
  branch === base ? 'ok' : 'fail',
  'branch',
  branch === base ? branch : `${branch}, releases go from ${base}`
);

const dirty = sh('git', ['status', '--porcelain']);
report(dirty === '' ? 'ok' : 'fail', 'working tree clean', dirty === '' ? '' : `\n${dirty}`);

try {
  sh('git', ['fetch', '--quiet', 'origin', base]);
  const behind = Number(sh('git', ['rev-list', '--count', `HEAD..origin/${base}`]));
  const ahead = Number(sh('git', ['rev-list', '--count', `origin/${base}..HEAD`]));
  if (behind > 0)
    report('fail', `in step with origin/${base}`, `${behind} commit(s) behind; pull first`);
  else if (ahead > 0)
    report(
      'warn',
      `in step with origin/${base}`,
      `${ahead} unpushed commit(s), e.g. an unpushed version commit`
    );
  else report('ok', `in step with origin/${base}`);
} catch (e) {
  const why = String((e as { stderr?: string }).stderr ?? '').split('\n')[0];
  report('fail', `in step with origin/${base}`, `git fetch failed: ${why}`);
}

const pre = json('.changeset/pre.json');
report(
  pre.mode === 'pre' && pre.tag === 'alpha' ? 'ok' : 'fail',
  'changesets pre mode',
  `mode ${String(pre.mode)}, tag ${String(pre.tag)}`
);

const wantNode = readFileSync(join(ROOT, '.node-version'), 'utf8').trim();
report(
  process.versions.node.split('.')[0] === wantNode.split('.')[0] ? 'ok' : 'warn',
  'node',
  `${process.versions.node} (.node-version ${wantNode})`
);

try {
  report('ok', 'npm login', sh('npm', ['whoami', '--registry', registry]));
} catch {
  report('fail', 'npm login', `not logged in to ${registry}; run npm login --registry ${registry}`);
}

// @changesets/changelog-github looks up each changeset's PR: `changeset version` needs a token.
let token = process.env.GITHUB_TOKEN ?? '';
try {
  token ||= sh('gh', ['auth', 'token']);
} catch {
  // no gh, or not logged in
}
report(
  token === '' ? 'fail' : 'ok',
  'GitHub token for the changelog',
  token === ''
    ? 'set GITHUB_TOKEN or run gh auth login'
    : 'GITHUB_TOKEN=$(gh auth token) pnpm changeset version'
);

const packages = publishedPackages(ROOT).map((p) => p.manifest);
const pending = pendingChangesets(ROOT);
process.stdout.write(`\nPending changesets (${pending.length}): ${pending.join(', ') || 'none'}\n`);
if (pending.length > 0) {
  const out = join(mkdtempSync(join(tmpdir(), 'release-status-')), 'status.json');
  try {
    // Exits 1 when changed packages have no changeset; the output file is written either way.
    sh('pnpm', ['exec', 'changeset', 'status', '--output', out]);
  } catch {
    // read what it wrote
  }
  try {
    const plan = releasePlan(
      JSON.parse(readFileSync(out, 'utf8')) as ChangesetStatus,
      packages.map((p) => p.name)
    );
    process.stdout.write('`changeset version` would release:\n');
    for (const r of plan)
      process.stdout.write(
        `  ${r.name}  ${r.from} → ${r.to}${r.changesets.length === 0 ? '  (dependent)' : ''}\n`
      );
  } catch {
    report('fail', 'release plan', '`changeset status` wrote no plan; run it to see why');
  }
}

const unpublished = packages
  .filter((p) => !isPublished(npm, `${p.name}@${p.version}`, registry))
  .map((p) => `${p.name}@${p.version}`);
process.stdout.write(
  `\nVersions in package.json not on the registry yet (${unpublished.length}): ${unpublished.join(', ') || 'none'}\n`
);

const next = nextStep(pending.length, unpublished.length);
const hint = {
  nothing: 'Nothing to release.',
  version:
    'Next: version (GITHUB_TOKEN=$(gh auth token) pnpm changeset version && pnpm release:sync-version), then publish.',
  publish: 'Next: build and publish (pnpm build && pnpm release:publish …).',
  'version-then-publish':
    'Next: version first, then publish; the publish also ships the versions listed above.',
}[next];
process.stdout.write(`\n${failed.count > 0 ? '✘ Fix the failed checks first. ' : ''}${hint}\n`);
process.exit(failed.count > 0 ? 1 : 0);
