/**
 * `pnpm exec tsx tools/ci/replay-cli.ts [count]`: what the Scope job's rules (`scope.ts`) would
 * have decided for the last `count` (default 200) PRs merged into mermaid-v13: a docs run, the
 * related unit tests only, or every test. The retro on running too much (D637): a large share
 * of `all` with one cause is a rule worth widening. Needs `gh`, logged in.
 */
import { execFileSync } from 'node:child_process';
import { replay } from './scope.ts';

/** GitHub lists at most this many files of a PR; a longer list is cut and may hide a file. */
const FILE_LIST_LIMIT = 100;

const count = process.argv[2] ?? '200';
const repo = process.env.GITHUB_REPOSITORY ?? 'mermaid-js/mermaid-v13';
const listed = execFileSync(
  'gh',
  [
    'pr',
    'list',
    '-R',
    repo,
    '--state',
    'merged',
    '--base',
    'mermaid-v13',
    '--limit',
    count,
    '--json',
    'files',
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
);
const prs = (JSON.parse(listed) as { files: { path: string }[] }[]).map((pr) =>
  pr.files.map((file) => file.path)
);
const result = replay(prs);
const share = (n: number): string => `${n} (${Math.round((100 * n) / Math.max(result.total, 1))}%)`;
const cut = prs.filter((files) => files.length >= FILE_LIST_LIMIT).length;

process.stdout.write(
  [
    `The last ${result.total} PRs merged into mermaid-v13, by the Scope job's rules:`,
    `  docs     ${share(result.docs)}   lint and the tests of code that reads the docs`,
    `  related  ${share(result.related)}   every job, with only the unit tests the change can reach`,
    `  all      ${share(result.all)}   everything`,
    `${cut} of them changed ${FILE_LIST_LIMIT} files or more; GitHub cuts the list there, so one may be misfiled.`,
    'What sent a PR to "all": the first file that is not package source, by area (PRs):',
    ...result.allBecause.slice(0, 15).map(([area, n]) => `  ${String(n).padStart(4)}  ${area}`),
    '',
  ].join('\n')
);
