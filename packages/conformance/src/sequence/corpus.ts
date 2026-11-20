/**
 * The sequence corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the cases (`corpus/sequence-cases.json`) and a commented copy of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The parser and lexer cases (`corpus/sequence-cases.json`): the corpus gaps the parity suite
 * reads, and the lexer gate's line-separator cases, edge cases (CRs, entities, comments the jison
 * rules skip, the ID and alias states' lookaheads, case-insensitive keywords, lexical errors),
 * directives that start partway through a line (#185) and `#y;` entities wherever a jison token
 * could end inside its placeholder (#208 item 5).
 */
const sequenceCases = (): CorpusItem[] => corpusJson('sequence-cases.json');

/** The e2e fixtures, the v12 spec strings, the cases, and each of them commented. */
export async function sequenceGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await sequenceCorpus()), ...sequenceCases()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/** The sequence corpus: the e2e fixtures and the v12 spec strings. */
export const sequenceCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('sequence');

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 */
export function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  const cut = Math.floor(body.length / 2);
  const split = body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(9)) : split);
}
