/**
 * The packet corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the cases of `corpus/packet-cases.json` (the quirks spec #421 lists, line
 * separators, unclosed directives) and a CRLF and a commented copy of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The packet corpus: the e2e fixtures and the harvested v12 spec strings. */
export const packetCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('packet');

/** The parser and lexer cases (`corpus/packet-cases.json`). */
export const packetCases = (): CorpusItem[] => corpusJson('packet-cases.json');

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function packetGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await packetCorpus()), ...packetCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
