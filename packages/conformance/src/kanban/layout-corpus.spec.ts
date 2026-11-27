import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile, type UnitProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { kanbanLayoutInput, layoutKanban, parseKanban } from '@mermaid-js/diagram-kanban';
import { kanbanLayoutViolations } from '@mermaid-js/diagram-kanban/testing';
import type { CorpusItem } from '../types.ts';
import { kanbanCases, kanbanCorpus } from './corpus.ts';

/**
 * The kanban layout's invariants (`kanbanLayoutViolations`, #455) on inputs the v13 parser
 * (#453) and the model adapter produced: every e2e file (`e2e/diagrams/kanban/**`), the v12
 * spec and syntax-page strings and the cases file, rejected ones included (the model of what
 * parsed), in px and in cells, with the file's front-matter `kanban` config and with
 * `sectionWidth` 0, 10 (raised to the least) and 80 with no padding.
 */
const CONFIGS: readonly Readonly<Record<string, unknown>>[] = [
  {},
  { sectionWidth: 0 },
  { sectionWidth: 10 },
  { sectionWidth: 80, padding: 0 },
];
const UNITS: readonly [UnitProfile, Measurer][] = [
  [pxProfile, tableMeasurer],
  [cellProfile(), cellMeasurer],
];

let spec: ThemeSpec;
let corpus: CorpusItem[];
beforeAll(async () => {
  spec = await loadTheme('default');
  corpus = [...(await kanbanCorpus()), ...kanbanCases()];
});

describe('kanban layout invariants on parsed models', () => {
  it('hold over the corpus and the cases, in px and cells, with every config', () => {
    const failures: string[] = [];
    const seen = { columns: 0, cards: 0, emptyBoard: 0, emptyColumn: 0, widest: 0 };
    for (const item of corpus) {
      const pre = preprocess(item.source);
      const { model } = parseKanban(item.source, { preprocessed: pre });
      const input = kanbanLayoutInput(model);
      seen.columns += input.columns.length;
      seen.cards += input.columns.reduce((n, c) => n + c.cards.length, 0);
      if (input.columns.length === 0) seen.emptyBoard++;
      if (input.columns.some((c) => c.cards.length === 0)) seen.emptyColumn++;
      seen.widest = Math.max(seen.widest, input.columns.length);
      const own = (pre.frontMatter?.config?.kanban ?? {}) as Record<string, unknown>;
      for (const [units, measurer] of UNITS)
        for (const extra of CONFIGS) {
          const layout = layoutKanban(input, {
            config: { kanban: { ...own, ...extra } } as unknown as ResolvedConfig,
            measurer,
            units,
            theme: createTheme(spec),
            warn: () => {},
          });
          const v = kanbanLayoutViolations(input, layout);
          if (v.length > 0)
            failures.push(`${item.id} ${units.id} ${JSON.stringify(extra)}: ${v.join('; ')}`);
        }
    }
    // The 30 restored fixtures and the 23 baselines (#459), #837's attribute quotes,
    // D647's ticket-row pair, and D742's acc statements.
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(60);
    // The acceptance cases are in the corpus: an empty board, empty columns, 15 columns.
    expect(seen.emptyBoard).toBeGreaterThan(0);
    expect(seen.emptyColumn).toBeGreaterThan(0);
    expect(seen.widest).toBeGreaterThanOrEqual(15);
    expect(seen.cards).toBeGreaterThan(200);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('lays the deep and misplaced indents out as cards of the last column', () => {
    const cards = (name: string): string[][] => {
      const item = corpus.find((i) => i.id.endsWith(`/${name}.mmd`));
      expect(item, name).toBeDefined();
      const { model } = parseKanban(item!.source);
      return kanbanLayoutInput(model).columns.map((c) => c.cards.map((k) => k.ast));
    };
    expect(cards('cards-at-any-depth')).toEqual([
      ['n:a', 'n:b', 'n:c', 'n:d'],
      ['n:e', 'n:f'],
    ]);
    expect(cards('misplaced-indent')).toEqual([['n:a'], ['n:b', 'n:c']]);
  });
});
