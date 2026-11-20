/**
 * What the four railroad lexers share (D511): reading the text v12 lexed, the Chevrotain loop,
 * the rules every grammar repeats, and the mapping of tokens back to the source. Each notation's
 * lexer (`ir/`, `ebnf/`, `abnf/`, `peg/`) is a subclass whose {@link RailroadLexer.scan} tries
 * its grammar's token types in the order `@mermaid-js/parser@2.0.1` built them (parser-method
 * §1, D213). The four grammars do not import `common.langium`; each repeats the same TITLE,
 * ACC_TITLE, ACC_DESCR, whitespace, YAML, directive and `%%` comment terminals, which live here.
 *
 * Chevrotain facts it reproduces: the first token type in order wins, except that a longer
 * match of the type's longer alternative replaces it (`choiceX` is a name, not `choice`; EBNF
 * `(*…*)` is a comment, not `(`); a keyword written as a string has no boundary (`titleCase` is
 * TITLE `title`, then a name); `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR only; whitespace
 * is `[\t \r\n]+`, so any other `\s` (U+2028, NBSP) is an error outside a string or comment.
 * Where no rule matches it writes one `Error` token over the characters up to the next offset
 * where one does, as Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and marks
 * the tag quotes it turned into `'`; every token maps back to its range in the source, which is
 * never rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and
 * CR into LF; every rule here reads CR as a line break too. Each `#name;` entity reads as `ﬂ`,
 * the name and `¶` (same length), as v12's placeholder did, so no rule takes its `#` or `;`
 * (PEG's `#x;` is an error, not a comment).
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): a string, comment, `accDescr {…}`,
 * YAML or directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle
import {
  APOSTROPHE,
  CR,
  DASH,
  DQUOTE,
  isLetter,
  isSpace,
  isWord,
  Kind,
  LF,
  PERCENT,
  SLASH,
  SPACE,
  STAR,
  TAB,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import { T } from './tokens.ts';

/** The shared terminals' kinds; about one token per four characters of railroad text. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 4,
};

/** In `[\t \r\n]`, the grammars' whitespace. */
export const isWhite = (c: number): boolean => c === SPACE || c === TAB || c === LF || c === CR;
/** In `[A-Z_a-z]`. */
export const isIdStart = (c: number): boolean => isLetter(c) || c === UNDERSCORE;
/** In `[\w-]`. */
export const isIdPart = (c: number): boolean => isWord(c) || c === DASH;

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
export abstract class RailroadLexer extends RuleLexer {
  /** A `/*` (`[0]`) or `(*` (`[1]`) comment whose body starts at or after this is never closed. */
  private readonly commentFails = [Infinity, Infinity];

  constructor(src: string, from: number, view: SourceView) {
    super(src, from, { ...view, text: placeholders(view.text) }, OPTIONS);
  }

  // --- Rules every grammar has --------------------------------------------------------------

  /** The header keyword `word(?:(?=%%)|(?!\S))`, as {@link T.Header}. */
  protected header(word: string, p: number): number {
    if (!this.text.startsWith(word, p)) return -1;
    const q = p + word.length;
    const c = this.text.charCodeAt(q);
    const ok = q >= this.n || isSpace(c) || (c === PERCENT && this.isPercent(q + 1));
    return ok ? this.match(T.Header, q) : -1;
  }

  /** `[A-Z_a-z][\w-]*` at `p` (an identifier start): its end. */
  protected idEnd(p: number): number {
    let j = p + 1;
    while (j < this.n && isIdPart(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** Whether `c` starts an IR, EBNF or PEG string. */
  protected static isQuote(c: number): boolean {
    return c === DQUOTE || c === APOSTROPHE;
  }

  /**
   * The hidden rules every grammar ends with, in its order: whitespace `[\t \r\n]+` (skipped),
   * then YAML (when `yaml`: EBNF reaches it through `-` instead), DIRECTIVE and the `%%`
   * SINGLE_LINE_COMMENT. The `[\t ]*` the last two start with is always whitespace's.
   */
  protected hidden(p: number, c: number, yaml: boolean): number {
    if (isWhite(c)) {
      let j = p + 1;
      while (j < this.n && isWhite(this.text.charCodeAt(j))) j++;
      return this.match(SKIP, j);
    }
    if (yaml && c === DASH) {
      const e = this.yaml(p);
      if (e >= 0) return e;
    }
    if (c === PERCENT && this.isPercent(p + 1)) {
      const e = this.directive(p);
      if (e >= 0) return e;
      return this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return -1;
  }

  /**
   * `\/\*[\s\S]*?\*\/` (`open` `/`) or `\(\*[\s\S]*?\*\)` (`open` `(`) at `p`, as `kind`: to the
   * first closer after the opener, or -1 when it is never closed.
   */
  protected comment(p: number, open: number, kind: number): number {
    const { text } = this;
    if (text.charCodeAt(p) !== open || text.charCodeAt(p + 1) !== STAR) return -1;
    const k = open === SLASH ? 0 : 1;
    const body = p + 2;
    if (body >= (this.commentFails[k] ?? Infinity)) return -1;
    const close = text.indexOf(open === SLASH ? '*/' : '*)', body);
    if (close >= 0) return this.match(kind, close + 2);
    this.commentFails[k] = body;
    return -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  protected isPercent(q: number): boolean {
    return this.text.charCodeAt(q) === PERCENT;
  }
}

/**
 * Each `#name;` as `ﬂ`, the name and `¶`, of the same length: what v12's `encodeEntities` wrote
 * in its place (`ﬂ°name¶ß`) begins with a character no rule takes, and lexes inside a string or
 * a comment as any other text would.
 */
function placeholders(text: string): string {
  return text.includes('#') ? text.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`) : text;
}
