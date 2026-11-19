/**
 * The git searches behind the Scope job (`scope-cli.ts`) and its replay (`replay-cli.ts`): who
 * owns a snapshot and which code names the e2e corpus (D648), in the checkout's tree. The
 * rules that use the answers are in `scope.ts`.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  isFixture,
  isSnapshot,
  NAMES_THE_CORPUS,
  snapshotOwner,
  type DataReaders,
} from './scope.ts';

export const ROOT = join(import.meta.dirname, '..', '..');

/** Runs git in the checkout: its exit status and its output. */
export const git = (args: string[]): { status: number | null; stdout: string } =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '');

/** `git grep -l`: the matching files, none when it exits 1, undefined when the search failed. */
export function grepFiles(args: string[]): string[] | undefined {
  const { status, stdout } = git(['grep', '-I', '-l', '-E', ...args]);
  if (status === 1) return [];
  return status === 0 ? lines(stdout) : undefined;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The specs that own `snapshot` (`snapshotOwner`): the spec a `.snap` file is named after, if
 * it is in the tree; otherwise the specs under the snapshot's folder that call
 * `toMatchFileSnapshot` and name its file or folder as a path segment. Undefined when a search
 * failed.
 */
function ownersOf(snapshot: string): string[] | undefined {
  const where = snapshotOwner(snapshot);
  if ('spec' in where) {
    const { status, stdout } = git(['ls-files', '--', where.spec]);
    return status === 0 ? lines(stdout) : undefined;
  }
  const quote = '[\'"`/]';
  return grepFiles([
    '--all-match',
    '-e',
    `${quote}${escapeRegExp(where.name)}${quote}`,
    '-e',
    'toMatchFileSnapshot',
    '--',
    `${where.dir}/*.spec.ts`,
  ]);
}

/** The code files that name the e2e corpus, or undefined when the search failed. */
export function corpusReaders(): string[] | undefined {
  const code = ['*.ts', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs'];
  return grepFiles(['-e', NAMES_THE_CORPUS, '--', ...code]);
}

/**
 * Who reads the changed fixtures and snapshots among `files`, of which `deleted` are deleted.
 * `corpus` is searched only when a fixture changed, and passed in when already known.
 */
export function dataReaders(
  files: readonly string[],
  deleted: readonly string[],
  corpus: () => string[] | undefined = corpusReaders
): DataReaders {
  const owners = new Map<string, readonly string[]>();
  for (const snapshot of files.filter(isSnapshot)) {
    const found = ownersOf(snapshot);
    if (found !== undefined) owners.set(snapshot, found);
  }
  return { owners, corpus: files.some(isFixture) ? corpus() : [], deleted };
}
