/**
 * The C4 corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import {
  body,
  crlf,
  DIRECTIVE,
  gateVariants,
  midLineDirective,
  tabs,
  withVariants,
} from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * A U+2028 before every line break after the header line, and a U+2029 after the first blank
 * of each line: `\s` takes both, a regex `.` and `[^\n]` do not stop at the second one the
 * same way (pitfall 3).
 */
export const lineSeparators = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*C4/.test(l));
    return lines.map((line, k) => (k <= header ? line : line.replace(' ', '  ') + ' ')).join('\n');
  });

/** The cases (`corpus/c4-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const c4Cases = (): CorpusItem[] => corpusJson('c4-cases.json');

/** The C4 corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const c4Corpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('c4');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['line separators', lineSeparators],
  ['mid-line directive', midLineDirective(/^\s*C4/)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function c4GateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await c4Corpus()), ...c4Cases()], VARIANTS);
}

/**
 * The gate corpus less the items the parity suite already reads from its dirs and files
 * (`registry.ts`), ids prefixed `c4-gate/`: model parity over the whole gate corpus.
 */
export async function c4ParityCorpus(): Promise<CorpusItem[]> {
  return gateVariants(await c4GateCorpus(), [...(await c4Corpus()), ...c4Cases()], 'c4');
}
