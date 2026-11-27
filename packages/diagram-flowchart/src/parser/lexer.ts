/**
 * Flowchart lexer: the start conditions of v12's `flow.jison` (DESIGN §4.3). The rules flowchart
 * shares with the grammars cut from it are the flow family's (`@mermaid-js/shared/parser/flow`);
 * here are flowchart's own: its keywords, its links (normal, thick, dotted and invisible, with
 * `x`, `o` and `<` heads) and their edge text, its blanks, and `}\s*\n`, which v12 rewrote.
 *
 * It is checked token by token against the jison lexer. Changes from Pele are listed in the
 * family's lexer.
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words invis
import {
  closingLine,
  CR,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  hasClass,
  isBlank,
  isSpace,
  Kind,
  LF,
  LOWER_O,
  LOWER_X,
  LT,
  openerBrace,
  RBRACE,
  RPAREN,
  scanWhile,
  SEMI,
  SLASH,
  sourceView,
  TILDE,
} from '@mermaid-js/core/parser-kit';
import {
  ELLIPSE_STOP,
  FLOW_STATE as S,
  flowChars,
  flowKeywords,
  FlowLexer,
  isNl,
} from '@mermaid-js/shared/parser/flow';
import type { Probe, Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { FlowLexerDialect } from '@mermaid-js/shared/parser/flow';
import { T } from './tokens.ts';

/**
 * Flowchart's v12 source view (D114): the shared rewrites plus flowParser's `}\s*\n` → `}\n`.
 */
export function flowSourceView(
  src: string,
  from: number,
  directives: readonly Range[]
): SourceView {
  return sourceView(src, from, directives, { braceNewline: true });
}

const RE_LINK = /\s*[xo<]?--+[-xo>]\s*/y;
const RE_START_LINK = /\s*[xo<]?--\s*/y;
const RE_THICK_LINK = /\s*[xo<]?==+[=xo>]\s*/y;
const RE_THICK_START = /\s*[xo<]?==\s*/y;
const RE_DOTTED_LINK = /\s*[xo<]?-?\.+-[xo>]?\s*/y;
const RE_DOTTED_START = /\s*[xo<]?-\.\s*/y;
const RE_INVIS_LINK = /\s*~~~+\s*/y;
const RE_SPACE = /[^\S\n\r]+/y;

const LOWER_M = 0x6d;

const KEYWORDS = /* @__PURE__ */ flowKeywords([
  ['style', T.Style],
  ['swimlane-beta', T.Graph, 'graph'],
  ['subgraph', T.Subgraph],
  ['default', T.Default],
  ['linkStyle', T.LinkStyle],
  ['interpolate', T.Interpolate],
  ['flowchart-elk', T.Graph, 'graph'],
  ['flowchart', T.Graph, 'graph'],
  ['graph', T.Graph, 'graph'],
  ['end', T.End, 'spaces'],
]);

/**
 * How v12's lexer read a flowchart: trimmed, about four characters a token, comments removed
 * before lexing. `end` takes the blanks and line breaks after it.
 */
const DIALECT: FlowLexerDialect = {
  kinds: T,
  // A link id ends at `[ ] ( ) { } |`, as in v12 12.3.0 (D621); swimlane-beta shares it.
  chars: /* @__PURE__ */ flowChars(false, true, KEYWORDS),
  keywords: KEYWORDS,
  charsPerToken: 4,
  trim: true,
};

/**
 * Lex the flowchart body `src[from…]`. `view` comes from {@link sourceView}. With
 * `graphKeyword` false, a `graph` keyword no longer opens the direction state (used when
 * lexing restarts mid-document after an error). With a `probe`, the start condition at the
 * probe's offset is recorded as its mode.
 */
export function lex(
  src: string,
  from: number,
  view: SourceView,
  graphKeyword = true,
  probe?: Probe
): TokenStream {
  return new FlowchartLexer(src, from, view, graphKeyword).run(probe);
}

/** One lex: flowchart's own rules. */
class FlowchartLexer extends FlowLexer {
  private readonly from: number;
  /** The `{` ending an embedded block's opening line (ADR-15) while the opener is lexed. */
  private embedBrace = -1;

  constructor(src: string, from: number, view: SourceView, graphKeyword: boolean) {
    super(src, from, view, graphKeyword, DIALECT);
    this.from = this.p;
  }

  /** The family's rules, after the embedded block's: its `{` and body, and its `mermaid`. */
  protected override initial(c: number): boolean {
    if (this.embedBrace >= 0 && this.p >= this.embedBrace) {
      if (this.p === this.embedBrace) return this.embedBody();
      this.embedBrace = -1;
    }
    if (c === LOWER_M && this.embedOpener()) return true;
    return super.initial(c);
  }

  // --- Embedded diagram blocks (ADR-15) ------------------------------------------------------

  /**
   * `mermaid` opening a block: first on its line (or after `;`), then a blank, and the line
   * ends in `{`. Anything else (`mermaid`, `mermaid["T"]`, `mermaid --> B`) is a node id.
   */
  private embedOpener(): boolean {
    const p = this.p;
    const { text } = this;
    let b = p - 1;
    while (b >= this.from && isBlank(text.charCodeAt(b))) b--;
    if (b >= this.from && !isNl(text.charCodeAt(b)) && text.charCodeAt(b) !== SEMI) return false;
    let e = p;
    while (e < this.n && !isNl(text.charCodeAt(e))) e++;
    const brace = openerBrace(text, p, e);
    if (brace < 0) return false;
    this.embedBrace = brace;
    return this.token(T.Embed, 7);
  }

  /**
   * The opener's `{`, then the body as one token, then the `}` that closes it. The close is
   * found by line: a line ending in `{` opens a level, a line starting with `}` closes one;
   * braces in `"…"` strings never count, and `%%` comment lines are not in the text at all.
   */
  private embedBody(): true {
    const { text } = this;
    const p = this.p;
    this.embedBrace = -1;
    this.emit(T.EmbedOpen, p, p + 1);
    let s = p + 1;
    while (s < this.len && !isNl(text.charCodeAt(s))) s++;
    if (text.charCodeAt(s) === CR && text.charCodeAt(s + 1) === LF) s++;
    s = Math.min(s + 1, this.len);
    const line = closingLine(text, s, this.len);
    this.emit(T.EmbedBody, s, line < 0 ? this.len : line);
    if (line < 0) return true;
    const a = scanWhile(text, line, isBlank);
    this.emit(T.EmbedEnd, a, a + 1);
    return true;
  }

  /** The character a link pattern at q turns on: after blanks and one optional `x`, `o` or `<`. */
  private linkChar(q: number): number {
    const j = this.skipWs(q);
    const d = this.text.charCodeAt(j);
    return d === LOWER_X || d === LOWER_O || d === LT ? this.text.charCodeAt(j + 1) : d;
  }

  private invisAhead(q: number): boolean {
    return this.text.charCodeAt(this.skipWs(q)) === TILDE;
  }

  private invisLink(): boolean {
    if (!this.invisAhead(this.p)) return false;
    const e = this.reAt(RE_INVIS_LINK, this.p);
    if (e < 0) return false;
    this.emit(T.Link, this.p, e);
    return true;
  }

  protected link(c: number): boolean {
    const p = this.p;
    const d = this.linkChar(p);
    let e: number;
    if (d === DASH) {
      if ((e = this.reAt(RE_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.reAt(RE_START_LINK, p)) >= 0) return this.startLink(S.edgeText, p, e);
      if ((e = this.reAt(RE_DOTTED_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.reAt(RE_DOTTED_START, p)) >= 0) return this.startLink(S.dottedEdgeText, p, e);
    } else if (d === EQUALS) {
      if ((e = this.reAt(RE_THICK_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.reAt(RE_THICK_START, p)) >= 0) return this.startLink(S.thickEdgeText, p, e);
    } else if (d === DOT && (e = this.reAt(RE_DOTTED_LINK, p)) >= 0) {
      return this.linkToken(p, e);
    }
    return c !== DASH && c !== EQUALS && c !== DOT && this.invisLink();
  }

  private linkToken(s: number, e: number): true {
    this.emit(T.Link, s, e);
    return true;
  }

  private startLink(state: number, s: number, e: number): true {
    this.pushState(state);
    this.emit(T.StartLink, s, e);
    return true;
  }

  /** Blanks: a link that opens with them, line breaks, or a space token. */
  protected blankRule(c: number): boolean {
    if (!isSpace(c)) return false;
    // v12 rewrote `}\s*\n` to `}\n` before lexing.
    if (this.text.charCodeAt(this.p - 1) === RBRACE && this.p > this.from) {
      let nl = -1;
      for (let j = this.p; j < this.n && isSpace(this.text.charCodeAt(j)); j++)
        if (isNl(this.text.charCodeAt(j))) nl = j;
      if (nl > this.p) {
        if (this.text.charCodeAt(nl) === LF && this.text.charCodeAt(nl - 1) === CR) nl--;
        this.p = nl;
        this.wsFrom = this.wsTo = -1;
        c = this.text.charCodeAt(nl);
      }
    }
    if (this.link(c)) return true;
    let e: number;
    if ((e = this.newlineEnd(this.p)) >= 0) {
      this.emit(Kind.Newline, this.p, e);
      return true;
    }
    if ((e = this.reAt(RE_SPACE, this.p)) >= 0) {
      this.emit(T.Space, this.p, e);
      return true;
    }
    return false;
  }

  /** An invisible link (`~~~`) inside a label or after the header keyword. */
  protected labelToken(c: number): true | undefined {
    return (c === TILDE || isSpace(c)) && this.invisLink() ? true : undefined;
  }

  protected ellipseRun(q: number): number {
    const { text, n, chars } = this;
    while (q < n) {
      const ch = text.charCodeAt(q);
      if (hasClass(chars, ch, ELLIPSE_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      if ((ch === DASH || ch === SLASH) && text.charCodeAt(q + 1) === RPAREN) break;
      if ((ch === TILDE || isSpace(ch)) && this.invisAhead(q) && this.reAt(RE_INVIS_LINK, q) >= 0)
        break;
      // As in edgeText: `\s*~~~` fails alike from every blank of the run.
      if (isSpace(ch)) q = this.blankRunEnd(q);
      q++;
    }
    return q;
  }

  /** The three edge text states, each closed by a link of its own stroke. */
  protected edgeText(c: number): boolean {
    switch (this.state) {
      case S.thickEdgeText:
        return this.edgeTextOf(c, RE_THICK_LINK, EQUALS, -1);
      case S.dottedEdgeText:
        return this.edgeTextOf(c, RE_DOTTED_LINK, DOT, DASH);
      default:
        return this.edgeTextOf(c, RE_LINK, DASH, -1);
    }
  }

  /** Edge text of a link opened with `a` (`-`, `=` or `.`); `b` also closes a dotted one. */
  private edgeTextOf(c: number, linkRe: RegExp, a: number, b: number): boolean {
    const p = this.p;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const d = this.linkChar(p);
    if (d === a || d === b) {
      const e = this.reAt(linkRe, p);
      if (e >= 0) {
        this.popState();
        return this.linkToken(p, e);
      }
    }
    if (c === a && (a !== DASH || this.text.charCodeAt(p + 1) === DASH)) return false;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (ch === DQUOTE && this.isQuote(q)) break;
      if (ch === a) {
        if (a !== DASH || this.text.charCodeAt(q + 1) === DASH) break;
      } else if (ch === LOWER_X || ch === LOWER_O || ch === LT || ch === b || isSpace(ch)) {
        const dd = this.linkChar(q);
        if ((dd === a || dd === b) && this.reAt(linkRe, q) >= 0) break;
        // The link pattern opens with `\s*`: from any later blank of this run it reaches the
        // same character and fails the same way, so the run is skipped (linear, R-PARSE-7).
        if (isSpace(ch)) q = this.blankRunEnd(q);
      }
      q++;
    }
    this.emit(T.EdgeText, p, q);
    return true;
  }
}
