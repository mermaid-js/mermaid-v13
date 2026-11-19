/**
 * `pnpm exec tsx tools/ci/replay-cli.ts [count]`: what the Scope job's rules (`scope.ts`) would
 * have decided for the last `count` (default 200) PRs merged into mermaid-v13: a docs run, the
 * related unit tests only, or every test. The retro on running too much (D637): a large share
 * of `all` with one cause is a rule worth widening. Needs `gh`, logged in.
 *
 * The readers of fixtures and snapshots (D648) are searched for in today's tree, not in each
 * PR's: a snapshot whose owner has since been renamed counts as unowned. GitHub does not give
 * a renamed file's old path, so a snapshot a PR renamed counts as deleted, as the Scope job
 * would see the old one.
 */
import { execFileSync } from 'node:child_process';
import { replay } from './scope.ts';
import { corpusReaders, dataReaders } from './scope-git.ts';

/** GitHub lists at most this many files of a PR; a longer list is cut and may hide a file. */
const FILE_LIST_LIMIT = 100;

interface PrFile {
  readonly path: string;
  readonly changeType: string;
}

const repo = process.env.GITHUB_REPOSITORY ?? 'mermaid-js/mermaid-v13';
// `--jq` reduces each PR to its files' paths and change types.
const prs = JSON.parse(
  execFileSync(
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
      process.argv[2] ?? '200',
      '--json',
      'files',
      '--jq',
      '[.[] | [.files[] | {path, changeType}]]',
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  )
) as PrFile[][];
const corpus = corpusReaders();
const result = replay(
  prs.map((pr) => {
    const files = pr.map((file) => file.path);
    const gone = pr.filter((file) => ['DELETED', 'RENAMED'].includes(file.changeType));
    return {
      files,
      data: dataReaders(
        files,
        gone.map((file) => file.path),
        () => corpus
      ),
    };
  })
);
const share = (n: number): string => `${n} (${Math.round((100 * n) / Math.max(result.total, 1))}%)`;
const cut = prs.filter((files) => files.length >= FILE_LIST_LIMIT).length;

process.stdout.write(
  [
    `The last ${result.total} PRs merged into mermaid-v13, by the Scope job's rules:`,
    `  docs     ${share(result.docs)}   lint and the tests of code that reads the docs`,
    `  related  ${share(result.related)}   every job, with only the unit tests the change can reach`,
    `  all      ${share(result.all)}   everything`,
    `${cut} of them changed ${FILE_LIST_LIMIT} files or more; GitHub cuts the list there, so one may be misfiled.`,
    `The corpus readers are those of today's tree: ${corpus?.length ?? 'unknown (search failed)'} files.`,
    'What sent a PR to "all": its first file outside the rules, or the doubt that did, by area (PRs):',
    ...result.allBecause.slice(0, 15).map(([area, n]) => `  ${String(n).padStart(4)}  ${area}`),
    '',
  ].join('\n')
);
