/**
 * Treemap lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `treemap.langium`, which does not import `common.langium`), in its order (parser-method
 * §1, D213):
 *
 *   ACC_DESCR, ACC_TITLE, TITLE, TREEMAP_KEYWORD, CLASS_DEF, `:::`, `:`, `,`, INDENTATION,
 *   WS (skipped, never reached), ML_COMMENT (hidden), NL (skipped), ID2, NUMBER2, STRING2.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, and no rule has a longer
 * alternative, so `treemapx` is the keyword then the name `x` and `titleX` is a title then
 * `X`. INDENTATION comes before WS with the same class, so every blank run is an INDENTATION
 * token, wherever it is, unless one of the three accessibility rules (which start `[\t ]*`)
 * takes it. Line breaks are skipped in v12, so the parser sees rows on one line as rows; here
 * they are `Kind.Newline` tokens for the parser's diagnostics (D401). `\s` is JS's (line
 * breaks and U+2028/U+2029 too: a `classDef` with no styles takes the next line, and
 * `accDescr` reaches a `{` on a later line); `[^\n\r]` stops at LF and CR only. Where no rule
 * matches it writes one `Error` token over the characters up to the next offset where one
 * does, as Chevrotain skips them.
 *
 * Like pie's and radar's lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12
 * turned CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would
 * be, and a `%%` comment ends at either. Entities need nothing: v12's placeholders lex as the
 * `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5). v12's ACC_DESCR is quadratic on
 * repeated unclosed `accDescr {` (each rescans to the end for a `}`); here one `}` search
 * serves every start before what it found. A failed STRING2 scan means no quote of its kind is
 * left, so no later scan of that kind can rescan the same text; NUMBER2 has no backtracking.
 */
// cspell:words accdescr acctitle treemapx
import {
  APOSTROPHE,
  COLON,
  COMMA,
  DOT,
  DQUOTE,
  isBlank,
  isDigit,
  isLetter,
  isWord,
  Kind,
  newlineAt,
  PERCENT,
  SEMI,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import { isBreak, RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

const HEADER = 'treemap';
const HEADER_BETA = 'treemap-beta';
const CLASS_DEF = 'classDef';

/** `[a-zA-Z_]`. */
const isIdStart = (c: number) => isLetter(c) || c === UNDERSCORE;
/** `[0-9_.,]`. */
const isNumberChar = (c: number) => isDigit(c) || c === UNDERSCORE || c === DOT || c === COMMA;

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  charsPerToken: 4,
};

/**
 * Lex the treemap body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's treemap ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new TreemapLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class TreemapLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p);
    let e = this.accessibility(p);
    if (e < 0 && text.startsWith(HEADER, p)) {
      const beta = text.startsWith(HEADER_BETA, p);
      e = this.match(T.TreemapKeyword, p + (beta ? HEADER_BETA : HEADER).length);
    }
    if (e < 0 && text.startsWith(CLASS_DEF, p)) e = this.classDef(p + CLASS_DEF.length);
    if (e < 0) e = this.punctuation(p, c);
    if (e < 0 && isBlank(c)) e = this.match(T.Indentation, this.blanks(p));
    if (e < 0 && c === PERCENT && text.charCodeAt(p + 1) === PERCENT) {
      e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(text, p));
    if (e < 0 && isIdStart(c)) e = this.match(T.Id, this.id(p));
    if (e < 0 && isNumberChar(c)) e = this.match(T.Number, this.number(p));
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string2(p, c);
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** `:::`, `:` and `,`, in that order. */
  private punctuation(p: number, c: number): number {
    if (c === COMMA) return this.match(T.Comma, p + 1);
    if (c !== COLON) return -1;
    const { text } = this;
    const triple = text.charCodeAt(p + 1) === COLON && text.charCodeAt(p + 2) === COLON;
    return triple ? this.match(T.StyleSeparator, p + 3) : this.match(T.Separator, p + 1);
  }

  /**
   * After `classDef`: `\s+([a-zA-Z_][a-zA-Z0-9_]+)(?:\s+([^;\r\n]*))?(?:;)?`. Greedy and with
   * nothing to backtrack into: the name takes its whole run, and once `\s+` matched after it
   * `[^;\r\n]*` matches (perhaps empty) from where the run ends, on a later line if the run
   * crossed a line break.
   */
  private classDef(r: number): number {
    const { text } = this;
    const name = this.spaces(r);
    if (name === r || !isIdStart(text.charCodeAt(name)) || !isWord(text.charCodeAt(name + 1))) {
      return -1;
    }
    let e = name + 2;
    while (isWord(text.charCodeAt(e))) e++;
    const styles = this.spaces(e);
    if (styles > e) {
      e = styles;
      while (e < this.n) {
        const c = text.charCodeAt(e);
        if (c === SEMI || isBreak(c)) break;
        e++;
      }
    }
    if (text.charCodeAt(e) === SEMI) e++;
    return this.match(T.ClassDef, e);
  }

  /** ID2: `[a-zA-Z_][a-zA-Z0-9_]*` from `p` (an ID start). */
  private id(p: number): number {
    let j = p + 1;
    while (isWord(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** NUMBER2: `[0-9_.,]+` from `p`. */
  private number(p: number): number {
    let j = p + 1;
    while (isNumberChar(this.text.charCodeAt(j))) j++;
    return j;
  }

  /**
   * STRING2: `"[^"]*"` or `'[^']*'`. A scan that fails found no quote of its kind to the end,
   * so every later start of that kind fails too, after a scan of its own remaining text.
   */
  private string2(p: number, quote: number): number {
    const close = this.text.indexOf(String.fromCharCode(quote), p + 1);
    return close < 0 ? -1 : this.match(T.String, close + 1);
  }
}
