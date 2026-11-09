/**
 * The treemap corpora (#428): the e2e fixtures, the knsv dev diagram and the harvested v12 spec
 * strings, and the lexer gate's set, which adds the cases of `corpus/treemap-cases.json` (the
 * spec's quirks, line separators, unclosed directives) and the recovery set
 * (`corpus/treemap-recovery.json`), and a CRLF and a commented copy of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');
const readCorpus = (name: string) =>
  JSON.parse(read(join('packages/conformance/corpus', name))) as CorpusItem[];

/** The knsv dev diagram (a 41-leaf map with emoji labels). */
const DEV_DIAGRAM = 'dev-diagrams/knsv/knsv2-02-treemap.mmd';

/** The treemap corpus: the e2e fixtures, the dev diagram and the harvested v12 spec strings. */
export async function treemapCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/treemap'), 'e2e')) {
    items.push(item);
  }
  items.push({ id: DEV_DIAGRAM, source: read(DEV_DIAGRAM) });
  return [...items, ...readCorpus('treemap-v12-specs.json')];
}

/**
 * The hand-written cases: the parser and lexer cases (`corpus/treemap-cases.json`) and the
 * parser's recovery set (`treemap-recovery.json`, whose expected diagnostics `recovery.spec.ts`
 * checks).
 */
export const treemapCases = (): CorpusItem[] => [
  ...readCorpus('treemap-cases.json'),
  ...readCorpus('treemap-recovery.json').map(({ id, source }) => ({ id, source })),
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
