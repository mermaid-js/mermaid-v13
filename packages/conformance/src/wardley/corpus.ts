/**
 * The wardley corpora (#430): the e2e fixtures and the harvested v12 spec strings, and the
 * gates' set, which adds the hand-written cases of `corpus/wardley-cases.json` (the spec's
 * quirks, line separators, the parser's cases) and `corpus/wardley-recovery.json`, and a CRLF
 * and a commented copy of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The wardley corpus: the e2e fixtures and the harvested v12 spec strings. */
export const wardleyCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('wardley');

/**
 * The hand-written cases: the spec's quirks and the rules' other corners, the parser's cases
 * (`parser-*`), and the parser's recovery set (`wardley-recovery.json`, whose expected
 * diagnostics `recovery.spec.ts` checks).
 */
export function wardleyCases(): CorpusItem[] {
  const recovery = corpusJson('wardley-recovery.json');
  return [
    ...corpusJson('wardley-cases.json'),
    ...recovery.map(({ id, source }) => ({ id, source })),
  ];
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function wardleyGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await wardleyCorpus()), ...wardleyCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
