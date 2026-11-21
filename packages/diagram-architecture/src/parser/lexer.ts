/**
 * Architecture lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`,
 * built from `architecture.langium`, `arch.langium` and `common.langium`), in its order, as
 * dumped from the 2.0.1 runtime (parser-method §1, D213):
 *
 *   architecture-beta, junction, service, column, group, align, row, `--`, in, `:`, `-`,
 *   ARROW_DIRECTION, ARROW_GROUP, ARROW_INTO, ACC_DESCR, ACC_TITLE, TITLE, STRING, ID, NEWLINE,
 *   WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden), ARCH_ICON, ARCH_TITLE.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that the word keywords
 * have ID as their longer alternative (`services`, `rows` and `architecture-betax` are names,
 * `row` and `in` are keywords) and `--` and `-` have YAML (a `---` block wins over them).
 * ARROW_DIRECTION has none and comes before ID, so a name that starts with a capital `L`, `R`,
 * `T` or `B` splits (`Backend` is `B` then the name `ackend`); so does one that starts with
 * `title` (TITLE has no boundary). The header needs no boundary either: a statement may
 * follow it on its line. ACC_DESCR, ACC_TITLE and TITLE come before WHITESPACE and start
 * `[\t ]*`, so they take the blanks before them (`service titlex` is `service`, ` title`, `x`).
 * A regex backtracks inside a rule; `\w`, `\s` and `\S` are JS's (ASCII `\w`, so `héllo` is an
 * error outside a label); `[^\n\r]` stops at LF and CR only. Where no rule matches it writes
 * one `Error` token over the characters up to the next offset where one does, as Chevrotain
 * skips them.
 *
 * Like radar's lexer it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and marks
 * the tag quotes it turned into `'`; every token maps back to its range in the source, which is
 * never rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and
 * CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's ACC_DESCR is quadratic on
 * lines of unclosed `accDescr {` (each rescans to the end for a `}`), and a quoted label or
 * string that is never closed rescans to the end from every quote; here a string, `}`, YAML or
 * directive scan that failed is not repeated for a start it covered, and a label's run stops
 * at the next bracket.
 */
// cspell:words accdescr acctitle héllo betax ackend titlex
import {
  APOSTROPHE,
  COLON,
  DASH,
  DQUOTE,
  GT,
  isBlank,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LPAREN,
  LT,
  PERCENT,
  RBRACKET,
  RPAREN,
} from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { idEnd, isBreak, RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import { KEYWORDS, T } from './tokens.ts';

const ARROW_GROUP = '{group}';

/** ARROW_DIRECTION's characters: `L`, `R`, `T`, `B`. */
const isDirection = (c: number) => c === 0x4c || c === 0x52 || c === 0x54 || c === 0x42;
/** ARCH_ICON's `[\w-:]`. */
const isIconChar = (c: number) => isWord(c) || c === DASH || c === COLON;

/** About one token per four characters of architecture text. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 4,
};

/**
 * Lex the architecture body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's architecture ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new ArchitectureLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class ArchitectureLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.keywords(p, c);
    if (e < 0 && isDirection(c)) e = this.match(T.Direction, p + 1);
    if (e < 0 && c === LBRACE && this.text.startsWith(ARROW_GROUP, p)) {
      e = this.match(T.ArrowGroup, p + ARROW_GROUP.length);
    }
    if (e < 0 && (c === LT || c === GT)) e = this.match(T.ArrowInto, p + 1);
    if (e < 0) e = this.accessibility(p);
    if (e < 0) e = this.common(p, c);
    if (e < 0 && c === LPAREN) e = this.icon(p);
    if (e < 0 && c === LBRACKET) e = this.label(p);
    return e;
  }

  /** `common`'s rules after TITLE: STRING, ID, NEWLINE, WHITESPACE, DIRECTIVE, comments. */
  private common(p: number, c: number): number {
    let e = -1;
    if (c === DQUOTE || c === APOSTROPHE) e = this.string(p, c);
    if (e < 0 && isWord(c)) e = this.match(T.Id, idEnd(this.text, this.n, p));
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + this.newline(p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT)
      e = this.directiveOrComment(p);
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * The keywords: the word keywords, each of which gives way to an ID that matches longer
   * (Chevrotain's `LONGER_ALT`); `--` and `-`, which give way to a YAML block; `:`.
   */
  private keywords(p: number, c: number): number {
    if (c === DASH) {
      const e = this.yaml(p);
      if (e >= 0) return e;
      return this.text.charCodeAt(p + 1) === DASH
        ? this.match(T.DashDash, p + 2)
        : this.match(T.Dash, p + 1);
    }
    if (c === COLON) return this.match(T.Colon, p + 1);
    return this.keywordOrId(p, KEYWORDS, T.Id);
  }

  /** ARCH_ICON: `\([\w-:]+\)`. */
  private icon(p: number): number {
    const { text, n } = this;
    let j = p + 1;
    while (j < n && isIconChar(text.charCodeAt(j))) j++;
    return j > p + 1 && text.charCodeAt(j) === RPAREN ? this.match(T.Icon, j + 1) : -1;
  }

  /**
   * ARCH_TITLE: `\[(?:"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\[\]\r\n]+)\]`. A quoted form needs
   * the `]` right after its closing quote (it may hold brackets and line breaks); else the
   * regex backtracks to the run, which ends at the first bracket or line break, and needs
   * that to be `]`. A run stops at the next `[`, so the runs of two starts never overlap.
   */
  private label(p: number): number {
    const { text, n } = this;
    const q = p + 1;
    const c = text.charCodeAt(q);
    if (c === DQUOTE || c === APOSTROPHE) {
      const e = this.string(q, c);
      if (e >= 0 && text.charCodeAt(e) === RBRACKET) return this.match(T.Label, e + 1);
    }
    let j = q;
    while (j < n) {
      const d = text.charCodeAt(j);
      if (d === LBRACKET || d === RBRACKET || isBreak(d)) break;
      j++;
    }
    return j > q && text.charCodeAt(j) === RBRACKET ? this.match(T.Label, j + 1) : -1;
  }

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0. A
   * CR that ends the source is one break on its own, not a CRLF with the appended line break.
   */
  protected override newline(q: number): number {
    return this.newlineInSource(q);
  }
}
