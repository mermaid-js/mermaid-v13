// cspell:words betax ilroad
/**
 * Railroad detection, as v12's four detectors saw the text (`/^\s*railroad-beta/i`,
 * `/^\s*railroad-ebnf-beta/i`, `/^\s*railroad-abnf-beta/i`, `/^\s*railroad-peg-beta/i`, in that
 * registration order): after the front matter, with directives and `%%` comments removed, as
 * core's registry tests a first-party row (`firstPartyDetects`: the body as written, then the
 * text with directives and comments cut, so `ra%%{…}%%ilroad-beta` is IR as in v12). The
 * tests ignore case and have no boundary, and the grammars' keywords do not, so
 * `RAILROAD-EBNF-BETA` and `railroad-betax` are detected and then rejected by the notation's
 * parser, as in v12 (D513).
 */
import { LOWER_A } from '@mermaid-js/core/parser-kit';
import {
  detectText,
  diagramStart,
  firstPartyDetects,
  preprocess,
} from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadNotation } from './tokens.ts';

/** Each notation's header keyword, in v12's detector order (D511). */
export const RAILROAD_HEADERS: readonly (readonly [RailroadNotation, string])[] = [
  ['railroad', 'railroad-beta'],
  ['railroadEbnf', 'railroad-ebnf-beta'],
  ['railroadAbnf', 'railroad-abnf-beta'],
  ['railroadPeg', 'railroad-peg-beta'],
];

const LOWER_Z = 0x7a;
/** Lower case minus upper case, for ASCII letters. */
const CASE_BIT = 0x20;

/** Whether `text` starts with `word`, ASCII letters in either case (`/i` without `u`). */
function startsWithIgnoringCase(text: string, word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    const c = text.charCodeAt(i);
    const h = word.charCodeAt(i);
    if (c !== h && !(h >= LOWER_A && h <= LOWER_Z && c === h - CASE_BIT)) return false;
  }
  return true;
}

/** The notation v12 reads `src` as, or undefined when it is not a railroad diagram. */
export function detectRailroad(
  src: string,
  pre: PreprocessResult = preprocess(src)
): RailroadNotation | undefined {
  const at = diagramStart(src, pre);
  const body = src.slice(at);
  let v12: string | undefined;
  const cut = () => (v12 ??= detectText(src, at, pre, { keepLastLineComment: true }));
  for (const [notation, header] of RAILROAD_HEADERS) {
    if (firstPartyDetects((t) => startsWithIgnoringCase(t, header), body, cut)) return notation;
  }
  return undefined;
}
