/**
 * The event modeling corpora (#527): the e2e fixtures and the harvested v12 spec strings, and
 * the gates' set, which adds the hand-written cases of `corpus/eventmodeling-cases.json` (the
 * spec's quirks, line separators, other `\s` characters, the parser's cases) and
 * `corpus/eventmodeling-recovery.json`, and a CRLF and a commented copy of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The event modeling corpus: the e2e fixtures and the harvested v12 spec strings. */
export const eventModelingCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('eventmodeling');

/**
 * The hand-written cases: the spec's quirks and the rules' other corners, the parser's cases
 * (`parser-*`), and the parser's recovery set (`eventmodeling-recovery.json`, whose expected
 * diagnostics `recovery.spec.ts` checks).
 */
export function eventModelingCases(): CorpusItem[] {
  const recovery = corpusJson('eventmodeling-recovery.json');
  return [
    ...corpusJson('eventmodeling-cases.json'),
    ...recovery.map(({ id, source }) => ({ id, source })),
  ];
}

/** The corpus, the cases, and a CRLF and a commented copy of each. */
export async function eventModelingGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await eventModelingCorpus()), ...eventModelingCases()];
  return [
    ...all,
    ...all.map((item) => ({
      id: `${item.id} (CRLF)`,
      source: item.source.replace(/\r?\n/g, '\r\n'),
    })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
