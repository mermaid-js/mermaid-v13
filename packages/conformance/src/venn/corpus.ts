// cspell:words dedented
/**
 * The venn corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of
 * every source. Diagrams go in as `.mmd` fixtures under `e2e/diagrams/venn/`; text that only
 * matters to the lexer or the parser (rejections, comment forms, CRs) goes in
 * `corpus/venn-cases.json`.
 */
import { JISON_NAMES, VennTokenKind } from '@mermaid-js/diagram-venn';
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
 * Every indent removed: an indented `text` is then a plain `text` statement, which v12 parses
 * differently (or rejects), so the lexer's line-start rules see the other branch.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** The cases (`corpus/venn-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const vennCases = (): CorpusItem[] => corpusJson('venn-cases.json');

/** The venn corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const vennCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('venn');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['dedented', dedented],
  ['mid-line directive', midLineDirective(/^\s*venn-beta/)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function vennGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await vennCorpus()), ...vennCases()], VARIANTS);
}

/** The cases core reads otherwise (`UNCLOSED_DIRECTIVE`), as the lexer gate excludes them. */
export const UNCLOSED = 'venn-cases/unclosed-directive-';

/**
 * The lexer gate's set without the unclosed directives (and their variants): every source the
 * syntax gates (grammar lexer, grammar differential, generated sentences) compare.
 */
export async function vennSyntaxCorpus(): Promise<CorpusItem[]> {
  return (await vennGateCorpus()).filter((item) => !item.id.startsWith(UNCLOSED));
}

/**
 * The gate's generated variants for the parity suite (the e2e fixtures, spec strings and cases
 * themselves are in the suite's dirs and files), ids prefixed `venn-gate/`. The unclosed
 * directives are left out: the two cases are listed divergences of core's directive reading.
 */
export async function vennParityCorpus(): Promise<CorpusItem[]> {
  return gateVariants(await vennSyntaxCorpus(), [...(await vennCorpus()), ...vennCases()], 'venn');
}

/**
 * Names no message may hold (R-ERR-5): v12's jison terminals (with `_` or all capitals), v13's
 * compound kind names (`IndentText`, `HexColor`, …), and the compound rule names of v12's
 * `venn.jison` and `grammar/venn.ebnf` (`statement`, `document`, `line` and `value` are plain
 * words, and `set` and the other keywords are Mermaid syntax).
 */
export const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(VennTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'optNewlines',
    'identifierList',
    'indentedTextTail',
    'stylesOpt',
    'styleField',
    'styleValue',
    'valueTokens',
    'valueToken',
    'IndentedText',
    'textId',
  ].join('|')})\\b`
);

/**
 * A message without the author's own text it quotes (what was found, a bad character, the
 * statements and text nodes a warning names), which may hold any word.
 */
export const withoutQuotes = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/character `[\s\S]*?`/g, 'character `…`')
    .replace(/`[^`]*` at line/g, '`…` at line')
    .replace(/text node `[^`]*`/g, 'text node `…`')
    .replace(/identifier: [^.]*\./g, 'identifier: ….')
    .replace(/as in `set [^`]*`/g, 'as in `set …`');
