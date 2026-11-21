/**
 * The mindmap corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, and the
 * lexer gate's set, which adds the cases (`corpus/mindmap-cases.json`) and a commented and two
 * CR-cut copies of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The parser and lexer cases (`corpus/mindmap-cases.json`): text that only matters to the lexer
 * and inputs v12 rejects. Real diagrams are e2e fixtures. After the parser cases come the lexer
 * gate's line-separator cases, the quirks spec #294 lists (every opener and closer, strings,
 * icons and classes, the comments v12's removal left, CRs, entities, the keyword, empty bodies)
 * and directives that start partway through a line (#185).
 */
export const mindmapCases = (): CorpusItem[] => corpusJson('mindmap-cases.json');

/** The mindmap corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const mindmapCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('mindmap');

/**
 * The e2e fixtures, the v12 spec strings, the cases, and each of them commented and CR-cut (by a
 * comment line and by a directive).
 */
export async function mindmapGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await mindmapCorpus()), ...mindmapCases()];
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

/**
 * The gate corpus less the items the parity suite already reads from its dirs and files
 * (`registry.ts`), ids prefixed `mindmap-gate/`: model parity over the whole gate corpus.
 */
export async function mindmapParityCorpus(): Promise<CorpusItem[]> {
  const listed = new Set([...(await mindmapCorpus()), ...mindmapCases()].map((c) => c.id));
  return (await mindmapGateCorpus())
    .filter((item) => !listed.has(item.id))
    .map((item) => ({ id: `mindmap-gate/${item.id}`, source: item.source }));
}
