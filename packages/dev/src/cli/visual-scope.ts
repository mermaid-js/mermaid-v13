/**
 * `pnpm --filter @mermaid-js/dev visual:scope`: decides what the visual job photographs
 * (D631, `visual-scope.ts`) and tells the workflow. Run in CI on the checkout of a PR, which
 * is the merge of the PR into its base: `HEAD^1` is the base.
 *
 * Reads GITHUB_EVENT_NAME, MERMAID_E2E_FIXTURE_TIER (the tiers this run photographs) and, for
 * the `visual: full` label, GITHUB_REPOSITORY, VISUAL_PR and GITHUB_TOKEN. Writes `mode`
 * (`full`, `subset` or `skip`) and `list` (a file of fixture paths, for
 * MERMAID_E2E_FIXTURE_LIST; empty unless `subset`) to GITHUB_OUTPUT, and the reasoning to the
 * job summary. Anything that goes wrong while comparing ends in `full`, never in a smaller run.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  changedFixtures,
  decideFromHashes,
  decideWithoutHashes,
  fullAfterFailure,
  summarize,
  type Decision,
  type Hashes,
} from '../visual-scope.ts';

const FULL_LABEL = 'visual: full';
/** The two files the base checkout gets from this one, so both sides hash with the same code. */
const HASHER_FILES = ['cli/visual-hashes.ts', 'fixed-clocks.ts'];

const root = resolve(import.meta.dirname, '..', '..', '..', '..');
const work = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'visual-scope-'));
const tiers = (process.env.MERMAID_E2E_FIXTURE_TIER ?? '').split(',').filter(Boolean);

// The job runs in a container as another user than the checkout's owner.
const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd: root, encoding: 'utf8' });

const run = (command: string, args: string[], cwd: string): void => {
  execFileSync(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
};

/** The hashes of the checkout at `checkout`, by the hasher that checkout holds. */
function hashesOf(checkout: string, name: string): Hashes {
  const out = join(work, name);
  run(
    'pnpm',
    ['exec', 'tsx', '--conditions=mermaid-source', 'src/cli/visual-hashes.ts', out],
    join(checkout, 'packages', 'dev')
  );
  return JSON.parse(readFileSync(out, 'utf8')) as Hashes;
}

/** The base in a worktree of its own, installed, with this checkout's hasher copied in. */
function baseHashes(): Hashes {
  const base = join(work, 'base');
  git('worktree', 'add', '--detach', base, 'HEAD^1');
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], base);
  for (const file of HASHER_FILES) {
    copyFileSync(
      join(root, 'packages', 'dev', 'src', file),
      join(base, 'packages', 'dev', 'src', file)
    );
  }
  return hashesOf(base, 'base.json');
}

/** Whether the PR has the label now: a re-run sees a label added after the first run. */
async function hasFullLabel(): Promise<boolean> {
  const { GITHUB_REPOSITORY: repo, VISUAL_PR: pr, GITHUB_TOKEN: token } = process.env;
  if (!repo || !pr) return false;
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/labels`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`reading the PR's labels: HTTP ${response.status}`);
  const labels = (await response.json()) as { name: string }[];
  return labels.some((label) => label.name === FULL_LABEL);
}

async function decide(): Promise<Decision> {
  const event = process.env.GITHUB_EVENT_NAME ?? 'local';
  try {
    const isPr = event === 'pull_request';
    const early = decideWithoutHashes({
      event,
      forceFull: isPr && (await hasFullLabel()),
      files: isPr ? git('diff', '--name-only', 'HEAD^1', 'HEAD').split('\n').filter(Boolean) : [],
    });
    if (early) return early;
    const head = hashesOf(root, 'head.json');
    return decideFromHashes(changedFixtures(baseHashes(), head), tiers);
  } catch (error) {
    return fullAfterFailure(error);
  }
}

const decision = await decide();
const list = join(work, 'fixtures.txt');
writeFileSync(list, decision.photograph.map((fixture) => `${fixture}\n`).join(''));
const text = summarize(decision);
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
if (process.env.GITHUB_OUTPUT) {
  const listed = decision.mode === 'subset' ? list : '';
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${decision.mode}\nlist=${listed}\n`);
}
