/**
 * The sankey corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { body, crlf, DIRECTIVE, gateVariants, withVariants } from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The cases (`corpus/sankey-cases.json`): each quirk and rejection of v12's sankey lexer, and
 * the line-separator cases (`line-separator-*`: U+2028 and U+2029, which `\s` takes, so
 * `prepareTextForParsing` trims them off the ends, which no sankey rule consumes, and after
 * which v12's comment removal starts a line).
 */
export const sankeyCases = (): CorpusItem[] => corpusJson('sankey-cases.json');

/** The sankey corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const sankeyCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('sankey');

/**
 * A directive through the middle of every line of two characters or more that holds no `%%`
 * (pitfall 3's mid-line cut, which `commented` makes only in bodies of two lines or fewer).
 */
export const directiveMidLine = (src: string): string =>
  body(src, (b) =>
    b
      .split('\n')
      .map((line) => {
        if (line.length < 2 || line.includes('%%')) return line;
        const half = line.length >> 1;
        return line.slice(0, half) + DIRECTIVE + line.slice(half);
      })
      .join('\n')
  );

/** Every line break doubled: v12's `prepareTextForParsing` collapsed the blank lines. */
export const blankLines = (src: string): string => body(src, (b) => b.replace(/\n/g, '\n\n'));

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['blank lines', blankLines],
  ['directive mid-line', directiveMidLine],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function sankeyGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await sankeyCorpus()), ...sankeyCases()], VARIANTS);
}

/**
 * The gate corpus less the items the parity suite already reads from its dirs and files
 * (`registry.ts`), ids prefixed `sankey-gate/`: model parity over the whole gate corpus.
 */
export async function sankeyParityCorpus(): Promise<CorpusItem[]> {
  const listed = [...(await sankeyCorpus()), ...sankeyCases()];
  return gateVariants(await sankeyGateCorpus(), listed, 'sankey');
}
