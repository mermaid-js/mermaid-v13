/**
 * The treemap corpora (#428): the e2e fixtures, the knsv dev diagram and the harvested v12 spec
 * strings, and the lexer gate's set, which adds the cases of `corpus/treemap-cases.json` (the
 * spec's quirks, line separators, unclosed directives) and the recovery set
 * (`corpus/treemap-recovery.json`), and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusJson, fixturesAndSpecs, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The knsv dev diagram (a 41-leaf map with emoji labels). */
const DEV_DIAGRAM = 'dev-diagrams/knsv/knsv2-02-treemap.mmd';

/** The treemap corpus: the e2e fixtures, the dev diagram and the harvested v12 spec strings. */
export const treemapCorpus = (): Promise<CorpusItem[]> =>
  fixturesAndSpecs('treemap', {
    extra: [{ id: DEV_DIAGRAM, source: readFileSync(join(REPO_ROOT, DEV_DIAGRAM), 'utf8') }],
  });

/**
 * The hand-written cases: the parser and lexer cases (`corpus/treemap-cases.json`) and the
 * parser's recovery set (`treemap-recovery.json`, whose expected diagnostics `recovery.spec.ts`
 * checks).
 */
export const treemapCases = (): CorpusItem[] => [
  ...corpusJson('treemap-cases.json'),
  ...corpusJson('treemap-recovery.json').map(({ id, source }) => ({ id, source })),
];

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function treemapGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await treemapCorpus()), ...treemapCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
