/**
 * The block corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of every source. Diagrams go
 * in as `.mmd` fixtures under `e2e/diagrams/block/`; text that only matters to the lexer or
 * the parser (rejections, comment forms, CRs, line separators) goes in
 * `corpus/block-cases.json`.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import {
  crlf,
  DIRECTIVE,
  FRONT_MATTER,
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
 * Sequence's `commented` (nine comment lines between lines), except that a body of two lines or
 * fewer is cut through the middle of its text after the header keyword, not through the
 * header (moved off a surrogate pair): v12 detects no block in a copy with a cut header, so
 * that variant would not be compared. A body with nothing after the header is left as it is.
 */
export function blockCommented(src: string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  const b = src.slice(head.length);
  if (b.split('\n').length > 2) return commented(src);
  const after = /^\s*block(?:-beta)?/.exec(b)?.[0].length ?? 0;
  if (b.length - after < 2) return src;
  let at = after + Math.floor((b.length - after) / 2);
  if (/[\udc00-\udfff]/.test(b.charAt(at))) at++;
  return head + b.slice(0, at) + '\n%% cut\n' + b.slice(at);
}

/** The cases (`corpus/block-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const blockCases = (): CorpusItem[] => corpusJson('block-cases.json');

/** The block corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const blockCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('block');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', blockCommented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['mid-line directive', midLineDirective(/^\s*block/)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function blockGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await blockCorpus()), ...blockCases()], VARIANTS);
}

/** The cases cut off by an unclosed directive, which core reads differently (GAPS #553). */
export const UNCLOSED = 'block-cases/unclosed-directive-';

/**
 * The lexer gate's set without the unclosed directives (and their variants): every source the
 * syntax gates (grammar lexer, grammar differential, generated sentences) compare.
 */
export async function blockSyntaxCorpus(): Promise<CorpusItem[]> {
  return (await blockGateCorpus()).filter((item) => !item.id.startsWith(UNCLOSED));
}

/**
 * The gate's generated variants for the parity suite (the e2e fixtures, spec strings and cases
 * themselves are in the suite's dirs and files), ids prefixed `block-gate/`. The unclosed
 * directives are left out: the case is a listed divergence of core's directive reading.
 */
export async function blockParityCorpus(): Promise<CorpusItem[]> {
  const listed = [...(await blockCorpus()), ...blockCases()];
  return gateVariants(await blockSyntaxCorpus(), listed, 'block');
}
