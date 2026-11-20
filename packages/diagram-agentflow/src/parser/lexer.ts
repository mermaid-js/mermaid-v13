/**
 * Agentflow lexer: a state machine mirroring the start conditions of v12's `agentflow.jison`
 * (DESIGN §4.3). A dialect of the flow family's lexer, which agentflow shares with flowchart
 * (D595, amending D467's copy; itself a port of Pele's, MIT), cut down by the jison diff between
 * `agentflow.jison` and `flow.jison`:
 * - no `subgraph`, `graph`, `flowchart` or `swimlane-beta`; `agentflow-beta` opens the
 *   direction state, and `flow`, `connector`, `global\b[ \t]*` and `end\b[ \t]*` are keywords;
 * - links are `--+[x>]`, `--` (opening edge text, closed by `--+[x>]`) and `-.+-` only: no
 *   `[xo<]` prefixes, no thick, dotted-open or invisible links, no thick or dotted edge text;
 * - `SPACE` is one blank a token;
 * - comments are in the text (see `source.ts`): `[ \t]*%%…` outside labels is a `Comment`
 *   token, and `%%…` inside a text, ellipse or trapezoid label is skipped (`Kind.Comment`);
 * - a lone `%` is label text, as the jison rules `%(?!%)` intend (D463): mermaid 12.2.0
 *   compiled them to `(?!)` and stops there with a lexical error.
 *
 * The rules it shares with flowchart are the flow family's (`@mermaid-js/shared/parser/flow`);
 * here are the ones above. Like flowchart's, it lexes the text v12 lexed (`source.ts`) and maps
 * each token back to its range in the source, which is never rewritten; directives are trivia
 * tokens, each with its own range, in source order; CRLF and CR are line breaks; an unmatched
 * character is an `Error` token, and lexing carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 *
 * Flowchart's lexer is ported from Pele's `src/diagrams/flowchart/lexer.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
 */
// cspell:words kepano
import {
  DASH,
  DOT,
  DQUOTE,
  GT,
  hasClass,
  isBlank,
  isSpace,
  Kind,
  LBRACE,
  LOWER_X,
  PERCENT,
  RPAREN,
  SEMI,
  SLASH,
} from '@mermaid-js/core/parser-kit';
import {
  ELLIPSE_STOP,
  FLOW_STATE as S,
  flowChars,
  flowKeywords,
  FlowLexer,
  isNl,
} from '@mermaid-js/shared/parser/flow';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { FlowLexerDialect } from '@mermaid-js/shared/parser/flow';
import { T } from './tokens.ts';

/** The text offsets where the links after a blank run end (see `Scanner.links`). */
export interface LinkEnds {
  /** The character after the blanks the links start at. */
  from: number;
  /** `\s*--+[x>]\s*`. */
  link: number;
  /** `\s*--\s*`, opening edge text. */
  startLink: number;
  /** `\s*-.+-\s*`. */
  dotted: number;
}

const KEYWORDS = /* @__PURE__ */ flowKeywords([
  ['agentflow-beta', T.Graph, 'graph'],
  ['connector', T.Connector],
  ['global', T.Global, 'blanks'],
  ['end', T.End, 'blanks'],
  ['style', T.Style],
  ['default', T.Default],
  ['linkStyle', T.LinkStyle],
  ['interpolate', T.Interpolate],
  ['flow', T.Flow],
]);

/**
 * How v12's lexer read an agentflow: untrimmed (leading blanks and comments are tokens), about
 * three characters a token, comments left in the text (a label run ends at `%%`). `global` and
 * `end` take the `[ \t]*` after them.
 */
const DIALECT: FlowLexerDialect = {
  kinds: T,
  // v12's agentflow.jison kept 12.2.0's LINK_ID: brackets do not end a link id (D621).
  chars: /* @__PURE__ */ flowChars(true, false, KEYWORDS),
  keywords: KEYWORDS,
  charsPerToken: 3,
  trim: false,
};

/**
 * Lex the agentflow body `src[from…]`. `view` comes from `agentflowSourceView`. With
 * `graphKeyword` false, an `agentflow-beta` keyword no longer opens the direction state (used
 * when lexing restarts mid-document after an error). With a `probe`, the start condition at
 * the probe's offset is recorded as its mode.
 */
export function lex(
  src: string,
  from: number,
  view: SourceView,
  graphKeyword = true,
  probe?: Probe
): TokenStream {
  return new AgentflowLexer(src, from, view, graphKeyword, DIALECT).run(probe);
}

/** One lex: agentflow's own rules, each scan linear in the text it reads (R-PARSE-7). */
class AgentflowLexer extends FlowLexer {
  // Memos that keep the scans below linear.
  private tabFrom = -1;
  private tabTo = -1;
  /** The last {@link links} result, kept for the character after the blanks it started at. */
  private readonly linkMemo: LinkEnds = { from: -1, link: -1, startLink: -1, dotted: -1 };
  /** The dash run `[dashFrom, dashTo)` last scanned. */
  private dashFrom = -1;
  private dashTo = -1;

  /** As core's, for a dropped `;` only. */
  protected override dropAt(b: number): number {
    const e = super.dropAt(b);
    return e !== b && this.src.charCodeAt(b) === SEMI ? e : b;
  }

  /** The end of the line at `q`: its line break, or the end. */
  private lineBreak(q: number): number {
    let j = q;
    while (j < this.n && !isNl(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** First character after any run of `[ \t]` starting at q. */
  private skipTabs(q: number): number {
    if (q >= this.tabFrom && q <= this.tabTo) return this.tabTo;
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    this.tabFrom = q;
    this.tabTo = j;
    return j;
  }

  /** `%%` not followed by `{` at q: the start of a comment. */
  private isComment(q: number): boolean {
    return (
      this.text.charCodeAt(q) === PERCENT &&
      this.text.charCodeAt(q + 1) === PERCENT &&
      this.text.charCodeAt(q + 2) !== LBRACE
    );
  }

  /**
   * The ends of the links after the blanks at `q` (each -1 when it does not match):
   * `\s*--+[x>]\s*`, `\s*--\s*` and `\s*-.+-\s*`. Why a memo: the INITIAL rules and the edge
   * text run try them from every blank of a run and every dash of a dash run, and they differ
   * only after the blanks, so the result is kept for the character after them (and the end
   * of a dash run too). Each scan then runs once per run (linear, R-PARSE-7). The returned
   * object is the memo itself: read it before the next call.
   */
  private links(q: number): Readonly<LinkEnds> {
    const m = this.linkMemo;
    const j = this.skipWs(q);
    if (j === m.from) return m;
    m.from = j;
    m.link = m.startLink = m.dotted = -1;
    const t = this.text;
    if (t.charCodeAt(j) !== DASH) return m;
    const d = t.charCodeAt(j + 1);
    if (d === DASH) {
      const e = this.dashRunEnd(j);
      const c = t.charCodeAt(e);
      m.startLink = this.skipWs(j + 2);
      if (c === LOWER_X || c === GT) m.link = this.skipWs(e + 1);
    } else if (d === DOT) {
      let e = j + 2;
      while (t.charCodeAt(e) === DOT) e++;
      if (t.charCodeAt(e) === DASH) m.dotted = this.skipWs(e + 1);
    }
    return m;
  }

  /** The end of the dash run at `j`; each run is scanned once. */
  private dashRunEnd(j: number): number {
    if (j < this.dashFrom || j >= this.dashTo) {
      let e = j;
      while (this.text.charCodeAt(e) === DASH) e++;
      this.dashFrom = j;
      this.dashTo = e;
    }
    return this.dashTo;
  }

  /** The INITIAL links at p: `--+[x>]`, then `--` (opening edge text), then `-.+-`. */
  protected link(): boolean {
    const p = this.p;
    const { link, startLink, dotted } = this.links(p);
    if (link >= 0) return this.token(T.Link, link - p);
    if (startLink >= 0) {
      this.pushState(S.edgeText);
      return this.token(T.StartLink, startLink - p);
    }
    return dotted >= 0 && this.token(T.Link, dotted - p);
  }

  /** `[ \t]*"%%"(?!\{)[^\n]*` at p: a comment, to its line break. */
  private comment(): boolean {
    const j = this.skipTabs(this.p);
    if (!this.isComment(j)) return false;
    this.emit(T.Comment, this.p, this.lineBreak(j));
    return true;
  }

  /** A label's `"%%"(?!\{)[^\n]*`, which jison skips: trivia. */
  private labelComment(): boolean {
    if (!this.isComment(this.p)) return false;
    this.emit(Kind.Comment, this.p, this.lineBreak(this.p));
    return true;
  }

  /** A `%%` comment where an id may start. */
  protected override word(c: number): boolean {
    return (c === PERCENT && this.comment()) || super.word(c);
  }

  /** Blanks: a link that opens with them, a comment, line breaks, or one blank. */
  protected blankRule(c: number): boolean {
    if (!isSpace(c)) return false;
    if (this.link()) return true;
    if (isBlank(c) && this.comment()) return true;
    const e = this.newlineEnd(this.p);
    if (e >= 0) {
      this.emit(Kind.Newline, this.p, e);
      return true;
    }
    return this.token(T.Space, 1);
  }

  /**
   * A `%%` comment inside a label: in a text or trapezoid label where `%%` stands (v13 reads
   * `%(?!%)` as jison's rule intends, D463), in an ellipse label where a comment starts.
   */
  protected labelToken(c: number): boolean | undefined {
    switch (this.state) {
      case S.text:
      case S.trapText:
        if (c !== PERCENT || this.text.charCodeAt(this.p + 1) !== PERCENT) return undefined;
        return this.labelComment();
      case S.ellipseText:
        return this.labelComment() ? true : undefined;
      default:
        return undefined;
    }
  }

  protected ellipseRun(q: number): number {
    const { text, n, chars } = this;
    while (q < n) {
      const ch = text.charCodeAt(q);
      if (hasClass(chars, ch, ELLIPSE_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      if ((ch === DASH || ch === SLASH) && text.charCodeAt(q + 1) === RPAREN) break;
      if (this.isComment(q)) break;
      q++;
    }
    return q;
  }

  /** Edge text after `--`, closed by `--+[x>]`. */
  protected edgeText(c: number): boolean {
    const p = this.p;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const { link } = this.links(p);
    if (link >= 0) {
      this.popState();
      return this.token(T.Link, link - p);
    }
    if (c === DASH && this.text.charCodeAt(p + 1) === DASH) return false;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (ch === DQUOTE && this.isQuote(q)) break;
      if (ch === DASH) {
        if (this.text.charCodeAt(q + 1) === DASH) break;
      } else if (isSpace(ch)) {
        if (this.links(q).link >= 0) break;
        // The link pattern opens with `\s*`: from any later blank of this run it reaches the
        // same character and fails the same way, so the run is skipped (linear, R-PARSE-7).
        q = this.blankRunEnd(q);
      }
      q++;
    }
    this.emit(T.EdgeText, p, q);
    return true;
  }
}
