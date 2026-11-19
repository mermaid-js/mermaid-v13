import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decisionLogProblems, fileProblems, LAST_ROW, rowIds, rowProblems } from './decisions.ts';

const root = join(import.meta.dirname, '..', '..');

describe('the decision log (D636)', () => {
  it('has no problems in this checkout', () => {
    expect(decisionLogProblems(root)).toEqual([]);
  });

  it('reads the row ids of the table', () => {
    expect(rowIds('| # | Decision |\n|---|---|\n| D1 | a |\n| D12 | b D3 |\nD4 prose\n')).toEqual([
      1, 12,
    ]);
  });

  it('keeps DECISIONS.md closed: a row past the last one is a problem', () => {
    expect(rowProblems(`| D${LAST_ROW} | the last row |\n`)).toEqual([]);
    expect(rowProblems(`| D${LAST_ROW + 1} | a new row |\n`)).toEqual([
      `v13/docs/DECISIONS.md: D${LAST_ROW + 1} is a new row; add v13/docs/decisions/D${LAST_ROW + 1}.md instead`,
    ]);
  });

  it('accepts a file named after its id with the matching heading, and the README', () => {
    expect(fileProblems('D636.md', '# D636: Decisions are one file each')).toEqual([]);
    expect(fileProblems('README.md', '# Decisions, one file each')).toEqual([]);
  });

  it('rejects another name, an id that is a row, and a heading that names another id', () => {
    expect(fileProblems('d636.md', '# D636: x')).toHaveLength(1);
    expect(fileProblems('D636-one-file.md', '# D636: x')).toHaveLength(1);
    expect(fileProblems(`D${LAST_ROW}.md`, `# D${LAST_ROW}: x`)[0]).toContain('is a row');
    expect(fileProblems('D636.md', '# D637: x')[0]).toContain('"# D636: <title>"');
    expect(fileProblems('D636.md', 'D636: no heading')).toHaveLength(1);
  });
});
