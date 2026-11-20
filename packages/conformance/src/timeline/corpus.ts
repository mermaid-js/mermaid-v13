/**
 * The timeline corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the cases (`corpus/timeline-cases.json`) and a commented and CR-cut copy of
 * every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The parser and lexer cases (`corpus/timeline-cases.json`): each corpus gap and the rejections,
 * then the lexer gate's line-separator cases, the quirks spec #291 lists, CRs, entities, the
 * comments jison's rules skip, case-insensitive keywords, the accessibility states, and
 * directives that start partway through a line (#185).
 */
export const timelineCases = (): CorpusItem[] => corpusJson('timeline-cases.json');

/**
 * The e2e fixtures, the v12 spec strings, the cases, and each of them commented and CR-cut.
 */
export async function timelineGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await timelineCorpus()), ...timelineCases()];
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
 * `src` with every line break of the body written as a CR, then `removed` (a comment or a
 * directive) and an LF on its own line. v12 turned the CR into an LF before removing it, so it
 * saw two line ends where v13's cut text has a CR and an LF side by side.
 */
export function crCut(src: string, removed: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  return head + src.slice(head.length).replace(/\r?\n/g, `\r${removed}\n\n`);
}

/** The timeline corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const timelineCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('timeline');
