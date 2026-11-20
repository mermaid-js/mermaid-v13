/**
 * The gantt corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's set,
 * which adds the parser cases of `corpus/gantt-cases.json`, the line-separator cases, and a
 * commented and CR-cut copy of every source. Charts go in as `.mmd` fixtures under
 * `e2e/diagrams/gantt/`; text that only matters to the lexer or the parser (rejections, comment
 * and directive forms, CRs) goes in `gantt-cases.json`.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const G = 'gantt\n';

const items = (prefix: string, sources: string[]): CorpusItem[] =>
  sources.map((source, k) => ({ id: `${prefix} ${k}`, source }));

// U+2028 and U+2029: `\s` takes them, `[^\n]` and `[^:\n]` do not; v12's comment removal
// (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = items('line separators', [
  G + 'a\u2028b :1d\u2028c\nd :2d',
  G + 'title\u2028x\nsection\u2029y\na :1d',
  G + 'title a\u2028b\nsection s\u2028t\na :1d',
  G + 'dateFormat\u2028YYYY\naxisFormat %d\u2029%m\na :1d',
  G + 'accTitle:\u2028hi there\naccDescr:\u2029hi\na :1d',
  G + 'a :1d\n%% c\u2028b :1d\nc :1d',
  G + 'a :1d\n\u2028%% c\nb :1d',
  G + 'a :1d\u2028%% c\nb :1d',
  G + 'a :1d\u2028  %% c\u2028b\nc :1d',
  G + 'a :a1, 1d\nclick\u2028a1\u2028href "u"\nclick a1 call\u2029f()',
  G + 'weekday\u2028monday\nweekend\u2029friday\na :1d',
  G + 'gantt\u2028a :1d',
  'gantt\u2028\na :1d',
  G + '   a :1d',
]);

/** The parser cases of `corpus/gantt-cases.json` (parity, #378; lexer gate, #377). */
export const ganttCases = (): CorpusItem[] => corpusJson('gantt-cases.json');

/**
 * The e2e fixtures, the v12 spec strings, the parser cases, the line-separator cases, and each
 * of them commented and CR-cut.
 */
export async function ganttGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await ganttCorpus()), ...ganttCases(), ...LINE_SEPARATORS];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CR cut)`, source: crCut(item.source, '%% c') })),
    ...all.map((item) => ({
      id: `${item.id} (CR cut by a directive)`,
      source: crCut(item.source, '%%{init: {}}%%'),
    })),
  ];
}

/** The gantt corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const ganttCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('gantt');
