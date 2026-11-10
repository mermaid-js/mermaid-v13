/**
 * Cynefin lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `cynefin.langium` and `common.langium`), in its order (parser-method §1, D213):
 *
 *   `cynefin-beta:`, `cynefin-beta`, `-->`, `:`, DOMAIN_NAME, ACC_DESCR, ACC_TITLE, TITLE,
 *   STRING, NEWLINE, WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins (no longest match, no rule here
 * has a longer alternative), so `complexity` is DOMAIN_NAME `complex` and then an error, and
 * `cynefin-beta:` wins over `cynefin-beta`; `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR
 * only. Where no rule matches it writes one `Error` token over the characters up to the next
 * offset where one does, as Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12 turned
 * CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 * Entities need nothing: v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's directive rule is quadratic on
 * many unclosed `%%{` in one text (each one searches the rest of the text for `}%%`); here a
 * string, `accDescr {…}`, YAML or directive scan that failed is not repeated for a start it
 * covered.
 */
// cspell:words accdescr acctitle
import {
  APOSTROPHE,
  COLON,
  DASH,
  DQUOTE,
  isBlank,
  isBreak,
  isSpace,
  Kind,
  LOWER_C,
  newlineAt,
  PERCENT,
  RuleLexer,
  SKIP,
} from '@mermaid-js/core/parser-kit';
import type { RuleLexerOptions, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { CYNEFIN_DOMAIN_NAMES } from '../model.ts';
import { T } from './tokens.ts';

const HEADER = 'cynefin-beta';

export interface LexOptions {
  /**
   * Lex the view's text as given, as Chevrotain lexes a text handed to it directly: no line
   * break appended and no leading blanks trimmed (v12's preprocessing did both). Default false.
   */
  readonly verbatim?: boolean;
}

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 8,
};

/**
 * Lex the cynefin body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's cynefin ran every shared rewrite).
 */
export function lex(
  src: string,
  from: number,
  view: SourceView,
  options: LexOptions = {}
): TokenStream {
  return new CynefinLexer(src, from, view, OPTIONS, options.verbatim === true).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class CynefinLexer extends RuleLexer {

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p);
    let e = c === LOWER_C ? this.header(p) : -1;
    if (e < 0 && c === DASH && text.startsWith('-->', p)) e = this.match(T.Arrow, p + 3);
    if (e < 0 && c === COLON) e = this.match(T.Colon, p + 1);
    if (e < 0 && c === LOWER_C) e = this.domainName(p);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** `cynefin-beta:` (a plain literal), else `cynefin-beta(?:(?=%%)|(?!\S))`. */
  private header(p: number): number {
    const { text } = this;
    if (!text.startsWith(HEADER, p)) return -1;
    const q = p + HEADER.length;
    const c = text.charCodeAt(q);
    if (c === COLON) return this.match(T.HeaderColon, q + 1);
    const ok = q >= this.n || isSpace(c) || (c === PERCENT && text.charCodeAt(q + 1) === PERCENT);
    return ok ? this.match(T.Header, q) : -1;
  }

  /** DOMAIN_NAME: `complex|complicated|clear|chaotic|confusion`, with no boundary after it. */
  private domainName(p: number): number {
    for (const name of CYNEFIN_DOMAIN_NAMES) {
      if (this.text.startsWith(name, p)) return this.match(T.DomainName, p + name.length);
    }
    return -1;
  }
}
