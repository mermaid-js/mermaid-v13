/**
 * The usecase corpora (#517): the e2e fixtures and the harvested v12 spec strings, and the
 * lexer gate's set, which adds the hand-written cases of `corpus/usecase-cases.json` (the
 * spec's quirks, D471's `&lt;` rejection case, entities, CRs, front matter and directives), the
 * line-separator cases, and a CRLF, a commented and two CR-cut copies of every source.
 * Diagrams go in as `.mmd` fixtures under `e2e/diagrams/usecase/`; text that only matters to
 * the lexer or the parser goes in `usecase-cases.json`.
 *
 * The shared harvester takes only whole literals that start with the header, so it skips some
 * v12 sources. Each is a case `usecase-cases/v12-unharvested/<file>#L<line>-<k>`, rebuilt by
 * hand at `fa796a943`: in `usecase.parser.spec.ts` the `${…}` templates of the `it.each` tables
 * at L232 (both orders), L337, L347 and L357, the `[…].join('\n')` sources at L509, L542
 * (`Broken("First`) and L558, and the `it.each` statements at L573 and L589
 * (`Literal(Reviewer's markers)`); in `parser/usecase.parser.spec.ts` the 24 relations of the
 * L104 table. Its L185 table's two sources without the header (`Usecase\nA`, `usecase actor A`) are
 * not usecase sources; `header-not-usecase` covers them. `usecase.spec.ts`'s templates build
 * models, not sources.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const H = 'usecase-beta\n';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

/** The usecase corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function usecaseCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/usecase'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/usecase-v12-specs.json')];
}

/** The hand-written cases of `corpus/usecase-cases.json`. */
export function usecaseCases(): CorpusItem[] {
  return readItems('packages/conformance/corpus/usecase-cases.json');
}

// U+2028 and U+2029: `\s` and `trim()` take them, `[^\n\r]` and the line-start checks do not;
// v12's comment removal (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = [
  H + 'A\u2028B --> C',
  H + 'A("a\u2028b")\nB[a\u2029b]',
  H + 'actor A <<a\u2028b>>\nactor B <<\u2028>>',
  H + '\u2028%% c\nB',
  H + 'A\u2028%% c\nB',
  H + 'A\u2028  %% c\u2028B\nC',
  H + 'accTitle: a\u2029b\n\u2028accDescr: c',
  H + 'accDescr {\u2028x\u2029}',
  'usecase-beta\u2028\nA',
  'usecase-beta\u2028A',
  H + '  \u2028  %% c\nA',
  H + 'json P@{"a":"\u2028"}',
  H + '"`a\u2028b`"',
].map((source, k) => ({ id: `line separators ${k}`, source }));

/** The corpus, the cases and the line separators, each also CRLF, commented and CR-cut. */
export async function usecaseGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await usecaseCorpus()), ...usecaseCases(), ...LINE_SEPARATORS];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CR cut)`, source: crCut(item.source, '%% c') })),
    ...all.map((item) => ({
      id: `${item.id} (CR cut by a directive)`,
      source: crCut(item.source, '%%{init: {}}%%'),
    })),
  ];
}
