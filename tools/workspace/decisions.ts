/**
 * The layout of the decision log (D636): rows D1–D632 in `v13/docs/DECISIONS.md`, which is
 * closed, and one file per later decision in `v13/docs/decisions/`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DECISIONS_FILE = 'v13/docs/DECISIONS.md';
export const DECISIONS_DIR = 'v13/docs/decisions';
/** The last decision that is a row. A later id is a file. */
export const LAST_ROW = 632;

/** The numbers of the decision rows in the text of `DECISIONS.md`. */
export const rowIds = (text: string): number[] =>
  [...text.matchAll(/^\| D(\d+) \|/gm)].map((match) => Number(match[1]));

/** What is wrong with one file of the decisions folder, given its name and first line. */
export function fileProblems(name: string, firstLine: string): string[] {
  if (name === 'README.md') return [];
  const id = /^D(\d+)\.md$/.exec(name)?.[1];
  if (id === undefined) return [`${name}: a decision file is named D<number>.md`];
  const problems: string[] = [];
  if (Number(id) <= LAST_ROW) {
    problems.push(`${name}: D${id} is a row in ${DECISIONS_FILE}; files start at D${LAST_ROW + 1}`);
  }
  if (!new RegExp(`^# D${id}: \\S`).test(firstLine)) {
    problems.push(`${name}: the first line is "# D${id}: <title>"`);
  }
  return problems;
}

/** What is wrong with the rows: the table is closed, so none is past the last one. */
export const rowProblems = (text: string): string[] =>
  rowIds(text)
    .filter((id) => id > LAST_ROW)
    .map((id) => `${DECISIONS_FILE}: D${id} is a new row; add ${DECISIONS_DIR}/D${id}.md instead`);

/** Every problem in the checkout at `root`. */
export function decisionLogProblems(root: string): string[] {
  const dir = join(root, DECISIONS_DIR);
  return [
    ...rowProblems(readFileSync(join(root, DECISIONS_FILE), 'utf8')),
    ...readdirSync(dir)
      .sort()
      .flatMap((name) =>
        fileProblems(name, readFileSync(join(dir, name), 'utf8').split('\n', 1)[0] ?? '')
      ),
  ];
}
