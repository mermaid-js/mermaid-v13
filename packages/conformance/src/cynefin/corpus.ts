/**
 * The cynefin corpora (#423): the e2e fixtures, the harvested v12 strings
 * (`corpus/cynefin-v12-specs.json`) and the quirk cases (`corpus/cynefin-cases.json`), and the
 * lexer gate's set, which adds a CRLF and a commented copy of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The cynefin corpus: the e2e fixtures and the harvested v12 strings. */
export const cynefinCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('cynefin');

/**
 * The quirks the spec probed against 2.0.1 (#423 "v12 syntax surface") and the rules' other
 * corners, the line-separator cases (U+2028, U+2029) and the rejections.
 */
export const cynefinCases = (): CorpusItem[] => corpusJson('cynefin-cases.json');

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function cynefinGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await cynefinCorpus()), ...cynefinCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
