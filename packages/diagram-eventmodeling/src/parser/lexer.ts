/**
 * Event modeling lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`,
 * built from `event-modeling.langium`, which does not import `common.langium`), in its order, as
 * dumped from the 2.0.1 runtime (parser-method §1, D213):
 *
 *   the keywords, longest first (`eventmodeling` … `rf`, with `->>`, `[[`, `]]`, the backtick and `.`
 *   among them), EM_ID, EM_FID, EM_DATA_INLINE, EM_DATA_BLOCK, EM_ACC_DESCR, EM_ACC_TITLE,
 *   EM_TITLE, EM_WS (skipped), EM_YAML, EM_DIRECTIVE, EM_SINGLE_LINE_COMMENT, EM_ML_COMMENT,
 *   EM_SL_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that every word keyword
 * has EM_ID as its longer alternative, so a word is a keyword only as a whole `[_a-zA-Z]\w*`
 * run (`tf01`, `evtA` are names) and a keyword can never be a name. `eventmodeling` is a keyword
 * only before `%%`, a `\s` character or the end (`eventmodeling-beta` is the name
 * `eventmodeling`, then an error). EM_ID comes before the title and accessibility rules, so they
 * match only where blanks start them: `title` after a line break (which EM_WS takes, with the
 * blanks after it) is a name, `title` after a blank on its line is EM_TITLE, which takes
 * `title` alone before any other character (`a titleBar` is `a`, ` title`, `Bar`). Blanks
 * before `%%`, `/*` and `//` are EM_WS's, so those images never start with blanks. EM_DATA_INLINE
 * is greedy to the last closer on its line (regex `.`: LF, CR, U+2028 and U+2029 end it) and
 * comes before EM_DATA_BLOCK; EM_DATA_BLOCK's optional body is tried first, so the first
 * closing `}` after a line break in the body wins, and only without one does a `}` right after
 * the opening line break close it. `\s` is JS's; `\w` is ASCII. Where no rule matches it writes
 * one `Error` token over the characters up to the next offset where one does, as Chevrotain
 * skips them.
 *
 * Like treemap's and wardley's lexers it lexes the text v12 lexed (pitfall 1): the source view
 * (`eventModelingView`) cuts the directives v12 removed (v12 kept the comment lines for this
 * type, which lex as EM_SINGLE_LINE_COMMENT), and marks the tag quotes it turned into `'`; every token maps back to its range in the source, which is never
 * rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and CR
 * into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5). In v12, lines of unclosed `{`, of
 * unclosed `/*`, of unclosed `accDescr {` and of unclosed `%%{` each rescan to the end, and a
 * line of `{`, `"` or `'` with no closer rescans the line from each; here each search for a
 * closer serves every later start before what it found, and a line's last closer of each kind
 * is found once.
 */
// cspell:words accdescr acctitle eventmodeling
import {
  APOSTROPHE,
  BACKTICK,
  DASH,
  DOT,
  DQUOTE,
  isBlank,
  isDigit,
  isLetter,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  PERCENT,
  RBRACE,
  RBRACKET,
  SLASH,
  STAR,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import { isBreak, RuleLexer, SKIP, UNSET } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { KEYWORDS, T } from './tokens.ts';

const HEADER = 'eventmodeling';
/** EM_DATA_INLINE's openers and their closers, by memo index. */
const OPENERS: readonly number[] = [LBRACE, DQUOTE, APOSTROPHE];
const CLOSERS: readonly number[] = [RBRACE, DQUOTE, APOSTROPHE];

/** A first-match search memo: the search from `from` found `at` (-1: none). */
interface Found {
  from: number;
  at: number;
}

/** The last of one inline closer on the line ending at `end`, after `from` (-1: none). */
interface LastOnLine {
  end: number;
  from: number;
  last: number;
}

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  yaml: T.Yaml,
  charsPerToken: 4,
  // v12 lexed `withComments`, which it never trimmed: EM_WS takes leading blanks.
  trim: false,
};

/**
 * Lex the event modeling body `src[from…]`. `view` comes from `eventModelingView` (core's
 * view with the comment lines kept).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new EventModelingLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class EventModelingLexer extends RuleLexer {
  // Memos that keep failed or repeated scans linear.
  private readonly lineEnds: Found = { from: -1, at: UNSET };
  /** By closer, as {@link CLOSERS}. */
  private readonly lastOnLine: LastOnLine[] = [0, 1, 2].map(() => ({
    end: -1,
    from: -1,
    last: -1,
  }));
  private readonly blockClosers: Found = { from: -1, at: UNSET };
  private readonly commentEnds: Found = { from: -1, at: UNSET };

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    if (isLetter(c) || c === UNDERSCORE) return this.word(p);
    const e = this.symbol(p, c);
    if (e !== UNSET) return e;
    if (isSpace(c)) {
      const t = isBlank(c) ? this.accessibility(p) : -1;
      return t >= 0 ? t : this.match(SKIP, this.spaces(p));
    }
    return this.hidden(p, c);
  }

  /**
   * The keywords that are symbols, EM_FID and the data rules, at `p` (`c`): the end, -1 when the
   * character starts one of them and none matches, or {@link UNSET} when it starts none.
   */
  private symbol(p: number, c: number): number {
    const { text } = this;
    if (c === DASH) {
      return text.startsWith('->>', p) ? this.match(T.Arrow, p + 3) : this.yaml(p);
    }
    if (c === LBRACKET || c === RBRACKET) {
      if (text.charCodeAt(p + 1) !== c) return -1;
      return this.match(c === LBRACKET ? T.OpenRef : T.CloseRef, p + 2);
    }
    if (c === BACKTICK) return this.match(T.Backtick, p + 1);
    if (c === DOT) return this.match(T.Dot, p + 1);
    if (isDigit(c)) {
      let j = p + 1;
      while (j < p + 3 && isDigit(text.charCodeAt(j))) j++;
      return this.match(T.FrameId, j);
    }
    const closer = OPENERS.indexOf(c);
    if (closer < 0) return UNSET;
    const e = this.inline(p, closer);
    return e >= 0 || c !== LBRACE ? e : this.block(p);
  }

  /** The hidden rules after EM_WS: EM_YAML is {@link symbol}'s, then `%%` and `/` comments. */
  private hidden(p: number, c: number): number {
    const d = this.text.charCodeAt(p + 1);
    if (c === PERCENT && d === PERCENT) {
      const e = this.directive(p);
      return e >= 0 ? e : this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (c !== SLASH) return -1;
    if (d === STAR) return this.blockComment(p);
    return d === SLASH ? this.match(T.LineComment, this.lineEnd(p + 2)) : -1;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * A word run from a letter or `_`: the keyword it equals, else EM_ID (every keyword's longer
   * alternative). `eventmodeling` needs `(?:(?=%%)|(?!\S))` after it.
   */
  private word(p: number): number {
    const { text } = this;
    let j = p + 1;
    while (isWord(text.charCodeAt(j))) j++;
    const word = text.slice(p, j);
    if (word === HEADER) {
      const c = text.charCodeAt(j);
      const ok = j >= this.n || isSpace(c) || (c === PERCENT && text.charCodeAt(j + 1) === PERCENT);
      return this.match(ok ? T.Header : T.Id, j);
    }
    return this.match(KEYWORDS.get(word) ?? T.Id, j);
  }

  /**
   * EM_DATA_INLINE from `p`: `\{(.*)\}`, `"(.*)"` or `'(.*)'`, to the last closer of its kind
   * on the line (`which`: its index in {@link CLOSERS}).
   */
  private inline(p: number, which: number): number {
    const end = this.lineEndOf(p + 1);
    const memo = this.lastOnLine[which];
    if (!memo) return -1;
    if (memo.end !== end || p < memo.from) {
      const closer = CLOSERS[which];
      let last = -1;
      for (let j = end - 1; j > p; j--) {
        if (this.text.charCodeAt(j) === closer) {
          last = j;
          break;
        }
      }
      memo.end = end;
      memo.from = p;
      memo.last = last;
    }
    return memo.last > p ? this.match(T.DataInline, memo.last + 1) : -1;
  }

  /**
   * EM_DATA_BLOCK: `\{[\t ]*\r?\n(?:[\S\s]*?\r?\n)?\}(?:\r?\n|(?!\S))`. The optional group is
   * tried first: the first `}` after a line break inside the body that closes; failing that, a
   * `}` that starts the body.
   */
  private block(p: number): number {
    const b = this.blanks(p + 1);
    const nl = this.newline(b);
    if (nl === 0) return -1;
    const body = b + nl;
    const q = this.blockCloser(body + 1);
    if (q >= 0) return this.match(T.DataBlock, this.closer(q + 1));
    if (this.text.charCodeAt(body) !== RBRACE) return -1;
    const e = this.closer(body + 1);
    return e < 0 ? -1 : this.match(T.DataBlock, e);
  }

  /**
   * The first `}` at or after `q` that follows a line break and is followed by a line break, a
   * `\s` character or the end, or -1. One search serves every start before what it found.
   */
  private blockCloser(q: number): number {
    return this.search(this.blockClosers, q, (from) => {
      const { text } = this;
      for (let k = text.indexOf('}', from); k !== -1; k = text.indexOf('}', k + 1)) {
        if (isBreak(text.charCodeAt(k - 1)) && this.closer(k + 1) >= 0) return k;
      }
      return -1;
    });
  }

  /** EM_ML_COMMENT: `/\*[\s\S]*?\*\/` from `p`. */
  private blockComment(p: number): number {
    const close = this.search(this.commentEnds, p + 2, (from) => this.text.indexOf('*/', from));
    return close < 0 ? -1 : this.match(T.BlockComment, close + 2);
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * A search for the first position at or after `q` that `find` finds, which holds for every
   * start: one search serves every later start up to what it found.
   */
  private search(memo: Found, q: number, find: (from: number) => number): number {
    const { at } = memo;
    if (at !== UNSET && q >= memo.from && (at === -1 || q <= at)) return at;
    memo.from = q;
    memo.at = find(q);
    return memo.at;
  }

  /** The first line terminator of regex `.` (LF, CR, U+2028, U+2029) at or after `q`. */
  private lineEndOf(q: number): number {
    return this.search(this.lineEnds, q, (from) => {
      let j = from;
      while (j < this.n && !isLineEnd(this.text.charCodeAt(j))) j++;
      return j;
    });
  }

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0. A
   * CR that ends the source is one break on its own, not a CRLF with the appended line break.
   */
  protected override newline(q: number): number {
    return this.newlineInSource(q);
  }
}
