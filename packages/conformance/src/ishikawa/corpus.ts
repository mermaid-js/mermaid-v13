// cspell:words dedented
/**
 * The ishikawa corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 * Diagrams go in as `.mmd` fixtures under `e2e/diagrams/ishikawa/`; text that only matters to
 * the lexer or the parser (rejections, comment forms, CRs, line separators) goes in
 * `corpus/ishikawa-cases.json`.
 */
import { IshikawaTokenKind, JISON_NAMES } from '@mermaid-js/diagram-ishikawa';
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
 * Every indent removed: each line after the effect is then a level-1 cause, and the first
 * cause's indent (the baseline) is 0, so the line-start rules see `TEXT` without `SPACELIST`.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** The cases (`corpus/ishikawa-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const ishikawaCases = (): CorpusItem[] => corpusJson('ishikawa-cases.json');

/** The ishikawa corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const ishikawaCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('ishikawa');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['dedented', dedented],
  ['mid-line directive', midLineDirective(/^\s*ishikawa/i)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function ishikawaGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await ishikawaCorpus()), ...ishikawaCases()], VARIANTS);
}

/**
 * The gate's generated variants for the parity suite (the e2e fixtures, spec strings and cases
 * themselves are in the suite's dirs and files), ids prefixed `ishikawa-gate/`.
 */
export async function ishikawaParityCorpus(): Promise<CorpusItem[]> {
  const listed = [...(await ishikawaCorpus()), ...ishikawaCases()];
  return gateVariants(await ishikawaGateCorpus(), listed, 'ishikawa');
}

/**
 * Names no message may hold (R-ERR-5): v12's jison terminals (all capitals, `ISHIKAWA` as well:
 * the keyword is shown in lower case), v13's compound kind names (`CommentLine`, `SpaceList`,
 * …), and the compound rule names of v12's `ishikawa.jison` (`spaceLines`); `start`, `stop`,
 * `document` and `statement` are plain words.
 */
export const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(IshikawaTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'spaceLines',
  ].join('|')})\\b`
);

/**
 * A message without the author's own text it quotes (what was found, the causes a warning
 * names), which may hold any word.
 */
export const withoutQuotes = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/`[^`]*` at line/g, '`…` at line')
    .replace(/after `[^`]*`/g, 'after `…`');
