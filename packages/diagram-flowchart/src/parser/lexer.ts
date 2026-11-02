/**
 * Flowchart lexer: a state machine mirroring the start conditions of v12's `flow.jison`
 * (DESIGN §4.3). Ported from Pele's `src/diagrams/flowchart/lexer.ts` @ 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), which is checked token by token
 * against the jison lexer. Changes from Pele:
 * - tokens carry ranges into the original source, which is never rewritten;
 * - comments and directives are trivia tokens, at the places v12 removed them ({@link sourceView});
 * - CRLF and CR are line breaks; `}\s*\n` and v12's `encodeEntities` quirks are reproduced;
 * - an unmatched character is an `Error` token, and lexing carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words kepano invis segs virt
import {
  charTable,
  hasClass,
  isDigit,
  isSpace,
  isUnicodeLetter,
  isWord,
  Kind,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { TokenStream } from '@mermaid-js/core/parser-kit';
import { DROP, firstHole, QUOTE } from './source.ts';
import type { SourceView } from './source.ts';
import { T } from './tokens.ts';

// Start conditions of flow.jison (the ones the lexer needs).
const S = {
  INITIAL: 0,
  string: 1,
  md_string: 2,
  acc_title: 3,
  acc_descr: 4,
  acc_descr_multiline: 5,
  dir: 6,
  text: 7,
  ellipseText: 8,
  trapText: 9,
  edgeText: 10,
  thickEdgeText: 11,
  dottedEdgeText: 12,
  click: 13,
  callbackname: 14,
  callbackargs: 15,
  shapeData: 16,
  shapeDataStr: 17,
} as const;

// Character classes of flow.jison's lexer rules.
/** jison's NODE_STRING (`-` and `=` are handled separately). */
const NODE = 1;
/** Ends a run of `<text>`. */
const TEXT_STOP = 2;
/** Ends a run of `<ellipseText>`. */
const ELLIPSE_STOP = 4;
/** Ends a run of `<trapText>`. */
const TRAP_STOP = 8;
/** Ends a run of `<shapeData>`. */
const SHAPE_DATA_STOP = 16;
const CHARS = /* @__PURE__ */ charTable(
  [NODE, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"#$%&\'*+.`?\\_/'],
  [TEXT_STOP, '[](){}|'],
  [ELLIPSE_STOP, '()[]{}'],
  [TRAP_STOP, '\\[](){}/'],
  [SHAPE_DATA_STOP, '}^']
);

const RE_ACC_TITLE = /accTitle\s*:\s*/y;
const RE_ACC_DESCR = /accDescr\s*:\s*/y;
const RE_ACC_DESCR_ML = /accDescr\s*\{\s*/y;
const RE_CALL = /call\s+/y;
const RE_CLICK = /click\s+/y;
// jison appends `\b` to literal rules that end in a word character.
const RE_DIR = /\s*(?:LR|RL|TB|BT|TD|BR)\b/y;
const RE_DIR_SYM = /\s*[<>^]/y;
const RE_DIR_V = /\s*v\b/y;
const RE_DIRECTION = [
  /.*direction\s+TB[^\n\r]*/y,
  /.*direction\s+BT[^\n\r]*/y,
  /.*direction\s+RL[^\n\r]*/y,
  /.*direction\s+LR[^\n\r]*/y,
  /.*direction\s+TD[^\n\r]*/y,
];
const RE_LINK = /\s*[xo<]?--+[-xo>]\s*/y;
const RE_START_LINK = /\s*[xo<]?--\s*/y;
const RE_THICK_LINK = /\s*[xo<]?==+[=xo>]\s*/y;
const RE_THICK_START = /\s*[xo<]?==\s*/y;
const RE_DOTTED_LINK = /\s*[xo<]?-?\.+-[xo>]?\s*/y;
const RE_DOTTED_START = /\s*[xo<]?-\.\s*/y;
const RE_INVIS_LINK = /\s*~~~+\s*/y;
const RE_SPACE = /[^\S\n\r]+/y;
const RE_END = /end\s*/y;
const RE_EMPTY_CALL = /\(\s*\)/y;
const RE_ENTITY = /#\w+;/y;

const isNl = (c: number) => c === 10 || c === 13;

/**
 * Lex the flowchart body `src[from…]`. `view` comes from {@link sourceView}. With
 * `graphKeyword` false, a `graph` keyword no longer opens the direction state (used when
 * lexing restarts mid-document after an error).
 */
export function lex(src: string, from: number, view: SourceView, graphKeyword = true): TokenStream {
  // v12 appended a newline before parsing; a sentinel plays its part (clamped in the output).
  const text = src + '\n';
  const len = src.length;
  const n = text.length;
  const mask = view.mask;
  const holes = view.holes;
  const w = new TokenWriter();
  const stack: number[] = [];
  let state: number = S.INITIAL;
  let p = from;
  let hole = firstHole(view, from);
  let lim = holes[hole]?.start ?? n;
  let firstGraph = graphKeyword;
  let dirNext = text.indexOf('direction', p);
  let atNext = text.indexOf('@', p);
  let lineEndAt = -1;
  let dirFailed = 0;
  let runEnd = 0;
  let runAt = -1;
  let wsFrom = -1;
  let wsTo = -1;

  const bits = (i: number) => (mask ? (mask[i] ?? 0) : 0);
  const isQuote = (i: number) => text.charCodeAt(i) === 34 && (bits(i) & QUOTE) === 0;
  const nextQuote = (from: number) => {
    let e = text.indexOf('"', from);
    while (e !== -1 && e < lim && (bits(e) & QUOTE) !== 0) e = text.indexOf('"', e + 1);
    return e === -1 || e > lim ? lim : e;
  };
  const upTo = (ch: string, from: number) => {
    const e = text.indexOf(ch, from);
    return e === -1 || e > lim ? lim : e;
  };
  const emit = (kind: number, s: number, e: number): void => {
    const a = Math.min(s, len);
    const b = Math.min(e, len);
    w.push(kind, a, b, src.slice(a, b));
    p = e;
  };
  const push = (s: number): void => {
    stack.push(state);
    state = s;
  };
  const pop = (): void => {
    state = stack.pop() ?? S.INITIAL;
  };
  /** End of the run of `pred` characters from `q`, continuing over removed spans. */
  const scanRun = (q: number, pred: (ch: number, at: number) => boolean): number => {
    let j = q;
    let k = hole;
    while (j < n) {
      while ((holes[k]?.end ?? n + 1) <= j) k++;
      const h = holes[k];
      if (h && h.start === j) j = h.end;
      else if (pred(text.charCodeAt(j), j)) j++;
      else break;
    }
    return j;
  };
  const blankUpTo = (q: number, e: number): boolean => {
    for (let j = q; j < e; j++) if (!isSpace(text.charCodeAt(j))) return false;
    return true;
  };
  const at = (re: RegExp, q: number): number => {
    re.lastIndex = q;
    const ok = re.test(text);
    if (ok && (re.lastIndex < lim || (re.lastIndex === lim && lim >= n))) return re.lastIndex;
    // Blanks up to a removed span: the pattern may go on after it.
    if (!ok && !(lim < n && lim - q < 4096 && blankUpTo(q, lim))) return -1;
    // The match runs into a removed span. v12 matched the text with it removed: match the
    // text around the next removed spans, then map the end back to a source offset.
    const segs: [number, number][] = [[q, lim]];
    let virt = text.slice(q, lim);
    for (let k = hole; k < holes.length && k < hole + 8; k++) {
      const from = holes[k]?.end ?? n;
      const to = Math.min(holes[k + 1]?.start ?? n, from + 4096);
      segs.push([from, to]);
      virt += text.slice(from, to);
    }
    re.lastIndex = 0;
    if (!re.test(virt)) return -1;
    let rest = re.lastIndex;
    for (const [a, b] of segs) {
      if (rest <= b - a) return a + rest;
      rest -= b - a;
    }
    return n;
  };
  // jison `(\r?\n)*\s*\n`: a blank run up to its last line feed.
  const noDirEnd = (q: number): number => {
    let last = -1;
    for (let j = q; j < lim && isSpace(text.charCodeAt(j)); j++) {
      const ch = text.charCodeAt(j);
      // A lone CR was a line feed to v12.
      if (ch === 10 || (ch === 13 && text.charCodeAt(j + 1) !== 10)) last = j;
    }
    return last < 0 ? -1 : last + 1;
  };
  // jison `(\r?\n)+` (a lone CR, which v12 turned into LF, counts too).
  // A run of line breaks continues over removed lines, which v12 no longer saw.
  const newlineEnd = (q: number): number => {
    const j = isNl(text.charCodeAt(q)) ? scanRun(q, isNl) : q;
    return j > q ? j : -1;
  };
  const entityAt = (q: number): boolean => {
    const e = at(RE_ENTITY, q);
    return e >= 0 && (bits(e - 1) & DROP) === 0;
  };
  const kw = (word: string): boolean =>
    text.startsWith(word, p) && !isWord(text.charCodeAt(p + word.length));

  // First character after any run of whitespace starting at q, skipping one optional x, o or <.
  // Blanks continue over removed spans, as in the text v12 lexed.
  const skipWs = (q: number): number => {
    if (q >= wsFrom && q <= wsTo) return wsTo;
    let j = q;
    if (isSpace(text.charCodeAt(q))) {
      let k = hole;
      while (j < n) {
        while ((holes[k]?.end ?? n + 1) <= j) k++;
        const h = holes[k];
        if (h && h.start === j) j = h.end;
        else if (isSpace(text.charCodeAt(j))) j++;
        else break;
      }
      wsFrom = q;
      wsTo = j;
    }
    return j;
  };
  const linkChar = (q: number): number => {
    const j = skipWs(q);
    const d = text.charCodeAt(j);
    return d === 120 || d === 111 || d === 60 ? text.charCodeAt(j + 1) : d;
  };
  const invisAhead = (q: number): boolean => text.charCodeAt(skipWs(q)) === 126;

  const quote = (): void => {
    if (text.charCodeAt(p + 1) === 96) {
      push(S.md_string);
      p += 2;
    } else {
      push(S.string);
      p++;
    }
  };

  const invisLink = (): boolean => {
    if (!invisAhead(p)) return false;
    const e = at(RE_INVIS_LINK, p);
    if (e < 0) return false;
    emit(T.Link, p, e);
    return true;
  };

  const opener = (c: number): boolean => {
    const d = text.charCodeAt(p + 1);
    if (c === 40) {
      if (d === 45) {
        push(S.ellipseText);
        emit(T.EllipseStart, p, p + 2);
      } else if (d === 91) {
        push(S.text);
        emit(T.StadiumStart, p, p + 2);
      } else if (d === 40 && text.charCodeAt(p + 2) === 40) {
        push(S.text);
        emit(T.DoubleCircleStart, p, p + 3);
      } else {
        push(S.text);
        emit(T.PS, p, p + 1);
      }
      return true;
    }
    if (c === 91) {
      if (d === 91) {
        push(S.text);
        emit(T.SubroutineStart, p, p + 2);
      } else if (d === 40) {
        push(S.text);
        emit(T.CylinderStart, p, p + 2);
      } else if (d === 47) {
        push(S.trapText);
        emit(T.TrapStart, p, p + 2);
      } else if (d === 92) {
        push(S.trapText);
        emit(T.InvTrapStart, p, p + 2);
      } else {
        push(S.text);
        emit(T.SQS, p, p + 1);
      }
      return true;
    }
    if (c === 124) {
      push(S.text);
      emit(T.Pipe, p, p + 1);
      return true;
    }
    if (c === 123) {
      push(S.text);
      emit(T.DiamondStart, p, p + 1);
      return true;
    }
    return false;
  };

  const graph = (length: number): void => {
    if (firstGraph) {
      firstGraph = false;
      push(S.dir);
    }
    emit(T.Graph, p, p + length);
  };

  const nodeString = (): boolean => {
    let q = p;
    let k = hole;
    while (q < n) {
      // A removed span inside a run joins its two halves, as in v12's text.
      while ((holes[k]?.end ?? n + 1) <= q) k++;
      const h = holes[k];
      if (h && h.start === q) {
        if (q === p) break;
        q = h.end;
        continue;
      }
      const ch = text.charCodeAt(q);
      // v12 had turned `#name;` into an entity placeholder, which ends a node string.
      if (ch === 35 && entityAt(q)) break;
      if (hasClass(CHARS, ch, NODE)) {
        q++;
      } else if (ch === 45 && q + 1 < n) {
        const d = text.charCodeAt(q + 1);
        if (d === 62 || d === 45 || d === 46) break;
        q++;
      } else {
        break;
      }
    }
    if (q === p) return false;
    emit(T.NodeString, p, q);
    return true;
  };

  const link = (c: number): boolean => {
    const d = linkChar(p);
    let e: number;
    if (d === 45) {
      if ((e = at(RE_LINK, p)) >= 0) {
        emit(T.Link, p, e);
        return true;
      }
      if ((e = at(RE_START_LINK, p)) >= 0) {
        push(S.edgeText);
        emit(T.StartLink, p, e);
        return true;
      }
      if ((e = at(RE_DOTTED_LINK, p)) >= 0) {
        emit(T.Link, p, e);
        return true;
      }
      if ((e = at(RE_DOTTED_START, p)) >= 0) {
        push(S.dottedEdgeText);
        emit(T.StartLink, p, e);
        return true;
      }
    } else if (d === 61) {
      if ((e = at(RE_THICK_LINK, p)) >= 0) {
        emit(T.Link, p, e);
        return true;
      }
      if ((e = at(RE_THICK_START, p)) >= 0) {
        push(S.thickEdgeText);
        emit(T.StartLink, p, e);
        return true;
      }
    } else if (d === 46) {
      if ((e = at(RE_DOTTED_LINK, p)) >= 0) {
        emit(T.Link, p, e);
        return true;
      }
    }
    return c !== 45 && c !== 61 && c !== 46 && invisLink();
  };

  // mermaid@12.2.0's LINK_ID is `[^\s\"]+\@(?=[^\{\"])`.
  const isRunBreak = (ch: number, q: number) => (ch === 34 && isQuote(q)) || isSpace(ch);

  const initial = (c: number): boolean => {
    let e: number;
    switch (c) {
      case 97:
        if (text.startsWith('acc', p)) {
          if ((e = at(RE_ACC_TITLE, p)) >= 0) {
            push(S.acc_title);
            emit(T.AccTitle, p, e);
            return true;
          }
          if ((e = at(RE_ACC_DESCR, p)) >= 0) {
            push(S.acc_descr);
            emit(T.AccDescr, p, e);
            return true;
          }
          if ((e = at(RE_ACC_DESCR_ML, p)) >= 0) {
            push(S.acc_descr_multiline);
            p = e;
            return true;
          }
        }
        break;
      case 64:
        if (text.charCodeAt(p + 1) === 123) {
          push(S.shapeData);
          w.push(T.ShapeData, p, p + 2, '');
          p += 2;
          return true;
        }
        break;
      case 99:
        if ((e = at(RE_CALL, p)) >= 0) {
          push(S.callbackname);
          p = e;
          return true;
        }
        if (kw('classDef')) {
          emit(T.ClassDef, p, p + 8);
          return true;
        }
        if (kw('class')) {
          emit(T.Class, p, p + 5);
          return true;
        }
        if ((e = at(RE_CLICK, p)) >= 0) {
          push(S.click);
          p = e;
          return true;
        }
        break;
      case 34:
        if (isQuote(p)) {
          quote();
          return true;
        }
        break;
      case 115:
        if (kw('style')) {
          emit(T.Style, p, p + 5);
          return true;
        }
        if (kw('swimlane-beta')) {
          graph(13);
          return true;
        }
        if (kw('subgraph')) {
          emit(T.Subgraph, p, p + 8);
          return true;
        }
        break;
      case 100:
        if (kw('default')) {
          emit(T.Default, p, p + 7);
          return true;
        }
        break;
      case 108:
        if (kw('linkStyle')) {
          emit(T.LinkStyle, p, p + 9);
          return true;
        }
        break;
      case 105:
        if (kw('interpolate')) {
          emit(T.Interpolate, p, p + 11);
          return true;
        }
        break;
      case 104:
        if (text.startsWith('href', p) && isSpace(text.charCodeAt(p + 4))) {
          emit(T.Href, p, p + 5);
          return true;
        }
        break;
      case 102:
        if (kw('flowchart-elk')) {
          graph(13);
          return true;
        }
        if (kw('flowchart')) {
          graph(9);
          return true;
        }
        break;
      case 103:
        if (kw('graph')) {
          graph(5);
          return true;
        }
        break;
      case 101:
        if (kw('end')) {
          emit(T.End, p, Math.max(p + 3, at(RE_END, p)));
          return true;
        }
        break;
      case 95:
        for (const target of ['_self', '_blank', '_parent', '_top']) {
          if (kw(target)) {
            emit(T.LinkTarget, p, p + target.length);
            return true;
          }
        }
        break;
    }

    if (dirNext !== -1 && p >= dirFailed) {
      if (dirNext < p) dirNext = text.indexOf('direction', p);
      if (dirNext !== -1) {
        if (lineEndAt < p) {
          lineEndAt = p;
          while (lineEndAt < n && !isNl(text.charCodeAt(lineEndAt))) lineEndAt++;
        }
        if (dirNext < lineEndAt) {
          for (let i = 0; i < 5; i++) {
            const re = RE_DIRECTION[i];
            if (re && (e = at(re, p)) >= 0) {
              emit(T.DirectionTB + i, p, e);
              return true;
            }
          }
          // No direction statement starts anywhere in the rest of this line either.
          dirFailed = lineEndAt;
        }
      }
    }

    // A link id is a run of id characters up to its last `@` that is not followed by `{` or `"`.
    if (atNext !== -1 && !isRunBreak(c, p)) {
      if (p >= runEnd) {
        if (atNext < p) atNext = text.indexOf('@', p);
        let q = p;
        while (q < lim && !isRunBreak(text.charCodeAt(q), q)) q++;
        runEnd = q;
        runAt = -1;
        if (atNext !== -1 && atNext < q) {
          for (let k = Math.min(q, n - 1) - 1; k >= atNext; k--) {
            if (text.charCodeAt(k) !== 64) continue;
            const after = text.charCodeAt(k + 1);
            if (after !== 123 && !(after === 34 && isQuote(k + 1))) {
              runAt = k;
              break;
            }
          }
        }
      }
      if (runAt > p) {
        emit(T.LinkId, p, runAt + 1);
        return true;
      }
    }

    if (isDigit(c)) {
      emit(T.Num, p, scanRun(p + 1, isDigit));
      return true;
    }

    switch (c) {
      case 35:
        // v12 turned `#name;` into an entity placeholder that no INITIAL rule matches.
        if (entityAt(p)) return false;
        emit(T.Brkt, p, p + 1);
        return true;
      case 58:
        if (text.charCodeAt(p + 1) === 58 && text.charCodeAt(p + 2) === 58) {
          emit(T.StyleSeparator, p, p + 3);
        } else emit(T.Colon, p, p + 1);
        return true;
      case 38:
        emit(T.Amp, p, p + 1);
        return true;
      case 59:
        if (bits(p) & DROP) {
          p++;
          return true;
        }
        emit(T.Semi, p, p + 1);
        return true;
      case 44:
        emit(T.Comma, p, p + 1);
        return true;
      case 42:
        emit(T.Mult, p, p + 1);
        return true;
      case 120:
      case 111:
        return link(c) || nodeString();
      case 60:
        if (link(c)) return true;
        emit(T.TagStart, p, p + 1);
        return true;
      case 45:
        if (link(c) || nodeString()) return true;
        emit(T.Minus, p, p + 1);
        return true;
      case 61:
        // flow.jison's `=(?!=)` in NODE_STRING compiles to `(?!)` in mermaid@12: `=` never joins an id.
        return link(c);
      case 46:
        return link(c) || nodeString();
      case 126:
        return invisLink();
      case 40:
        return opener(c);
      case 91:
        if (text.charCodeAt(p + 1) === 124) {
          emit(T.VertexWithPropsStart, p, p + 2);
          return true;
        }
        return opener(c);
      case 124:
      case 123:
        return opener(c);
      case 62:
        push(S.text);
        emit(T.TagEnd, p, p + 1);
        return true;
      case 94:
        emit(T.Up, p, p + 1);
        return true;
      case 92:
        if (text.charCodeAt(p + 1) === 124) {
          emit(T.Sep, p, p + 2);
          return true;
        }
        return nodeString();
      case 118:
        if (!isWord(text.charCodeAt(p + 1))) {
          emit(T.Down, p, p + 1);
          return true;
        }
        return nodeString();
    }

    if (isSpace(c)) {
      // v12 rewrote `}\s*\n` to `}\n` before lexing.
      if (text.charCodeAt(p - 1) === 125 && p > from) {
        let nl = -1;
        scanRun(p, (ch, at) => {
          if (isNl(ch)) nl = at;
          return isSpace(ch);
        });
        if (nl > p) {
          if (text.charCodeAt(nl) === 10 && text.charCodeAt(nl - 1) === 13) nl--;
          p = nl;
          wsFrom = wsTo = -1;
          c = text.charCodeAt(p);
        }
      }
      if (link(c)) return true;
      if ((e = newlineEnd(p)) >= 0) {
        emit(Kind.Newline, p, e);
        return true;
      }
      if ((e = at(RE_SPACE, p)) >= 0) {
        emit(T.Space, p, e);
        return true;
      }
      return false;
    }

    if (c < 128) return nodeString();
    if (isUnicodeLetter(c)) {
      emit(T.UnicodeText, p, p + 1);
      return true;
    }
    return false;
  };

  const edgeText = (c: number, linkRe: RegExp, a: number, b: number): boolean => {
    if (c === 34 && isQuote(p)) {
      quote();
      return true;
    }
    const d = linkChar(p);
    if (d === a || d === b) {
      const e = at(linkRe, p);
      if (e >= 0) {
        pop();
        emit(T.Link, p, e);
        return true;
      }
    }
    if (c === a && (a !== 45 || text.charCodeAt(p + 1) === 45)) return false;
    let q = p + 1;
    while (q < lim) {
      const ch = text.charCodeAt(q);
      if (ch === 34 && isQuote(q)) break;
      if (ch === a) {
        if (a !== 45 || text.charCodeAt(q + 1) === 45) break;
      } else if (ch === 120 || ch === 111 || ch === 60 || ch === b || isSpace(ch)) {
        const dd = linkChar(q);
        if ((dd === a || dd === b) && at(linkRe, q) >= 0) break;
      }
      q++;
    }
    emit(T.EdgeText, p, q);
    return true;
  };

  const step = (c: number): boolean => {
    switch (state) {
      case S.INITIAL:
        return initial(c);

      case S.string:
        if (c === 34 && isQuote(p)) {
          if (text.charCodeAt(p + 1) === 96) {
            push(S.md_string);
            p += 2;
          } else {
            pop();
            p++;
          }
        } else emit(T.Str, p, nextQuote(p));
        return true;

      case S.md_string:
        if (c === 96) {
          if (isQuote(p + 1)) {
            pop();
            p += 2;
            return true;
          }
          return false;
        }
        if (c === 34 && isQuote(p)) {
          quote();
          return true;
        }
        {
          let q = p + 1;
          while (q < lim) {
            const ch = text.charCodeAt(q);
            if (ch === 96 || (ch === 34 && isQuote(q))) break;
            q++;
          }
          emit(T.MdStr, p, q);
        }
        return true;

      case S.acc_title:
      case S.acc_descr: {
        let e = p;
        while (e < lim && !isNl(text.charCodeAt(e))) e++;
        const kind = state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
        pop();
        emit(kind, p, e);
        return true;
      }

      case S.acc_descr_multiline:
        if (c === 125) {
          pop();
          p++;
        } else emit(T.AccDescrMultilineValue, p, upTo('}', p));
        return true;

      case S.dir: {
        let e: number;
        if (c === 34 && isQuote(p)) {
          quote();
        } else if ((e = noDirEnd(p)) >= 0) {
          pop();
          emit(T.NoDir, p, e);
        } else if (
          (e = at(RE_DIR, p)) >= 0 ||
          (e = at(RE_DIR_SYM, p)) >= 0 ||
          (e = at(RE_DIR_V, p)) >= 0
        ) {
          pop();
          emit(T.Dir, p, e);
        } else {
          return invisLink() || opener(c);
        }
        return true;
      }

      case S.text: {
        const d = text.charCodeAt(p + 1);
        switch (c) {
          case 40:
          case 91:
          case 123:
            opener(c);
            return true;
          case 93:
            pop();
            if (d === 41) emit(T.StadiumEnd, p, p + 2);
            else if (d === 93) emit(T.SubroutineEnd, p, p + 2);
            else emit(T.SQE, p, p + 1);
            return true;
          case 41:
            pop();
            if (d === 93) emit(T.CylinderEnd, p, p + 2);
            else if (d === 41 && text.charCodeAt(p + 2) === 41) emit(T.DoubleCircleEnd, p, p + 3);
            else emit(T.PE, p, p + 1);
            return true;
          case 124:
            pop();
            emit(T.Pipe, p, p + 1);
            return true;
          case 125:
            pop();
            emit(T.DiamondStop, p, p + 1);
            return true;
        }
        if (c === 34 && isQuote(p)) {
          quote();
          return true;
        }
        if ((c === 126 || isSpace(c)) && invisLink()) return true;
        let q = p + 1;
        while (q < lim) {
          const ch = text.charCodeAt(q);
          if (hasClass(CHARS, ch, TEXT_STOP) || (ch === 34 && isQuote(q))) break;
          q++;
        }
        emit(T.Text, p, q);
        return true;
      }

      case S.ellipseText: {
        const d = text.charCodeAt(p + 1);
        if (c === 34 && isQuote(p)) {
          quote();
        } else if ((c === 126 || isSpace(c)) && invisLink()) {
          return true;
        } else if ((c === 45 || c === 47 || c === 41) && d === 41) {
          pop();
          emit(T.EllipseEnd, p, p + 2);
        } else if (c === 40 || c === 91 || c === 123) {
          opener(c);
        } else if (c === 41 || c === 93 || c === 125) {
          return false;
        } else {
          let q = p + 1;
          while (q < lim) {
            const ch = text.charCodeAt(q);
            if (hasClass(CHARS, ch, ELLIPSE_STOP) || (ch === 34 && isQuote(q))) break;
            if ((ch === 45 || ch === 47) && text.charCodeAt(q + 1) === 41) break;
            if ((ch === 126 || isSpace(ch)) && invisAhead(q) && at(RE_INVIS_LINK, q) >= 0) break;
            q++;
          }
          emit(T.Text, p, q);
        }
        return true;
      }

      case S.trapText: {
        const d = text.charCodeAt(p + 1);
        if (c === 34 && isQuote(p)) {
          quote();
          return true;
        }
        if ((c === 126 || isSpace(c)) && invisLink()) return true;
        switch (c) {
          case 40:
            if (d === 93) {
              pop();
              emit(T.TrapEnd, p, p + 2);
            } else opener(c);
            return true;
          case 91:
          case 123:
            opener(c);
            return true;
          case 92:
            if (d === 93) {
              pop();
              emit(T.TrapEnd, p, p + 2);
            } else emit(T.Text, p, p + 1);
            return true;
          case 47:
            if (d === 93) {
              pop();
              emit(T.InvTrapEnd, p, p + 2);
            } else emit(T.Text, p, p + 1);
            return true;
          case 93:
          case 41:
            if (d === 93) {
              pop();
              emit(T.TrapEnd, p, p + 2);
              return true;
            }
            return false;
          case 125:
            return false;
        }
        if ((c === 63 || c === 61) && d === 93) {
          pop();
          emit(T.TrapEnd, p, p + 2);
          return true;
        }
        let q = p + 1;
        while (q < lim) {
          const ch = text.charCodeAt(q);
          if (hasClass(CHARS, ch, TRAP_STOP)) break;
          q++;
        }
        emit(T.Text, p, q);
        return true;
      }

      case S.edgeText:
        return edgeText(c, RE_LINK, 45, -1);
      case S.thickEdgeText:
        return edgeText(c, RE_THICK_LINK, 61, -1);
      case S.dottedEdgeText:
        return edgeText(c, RE_DOTTED_LINK, 46, 45);

      case S.click:
        if (c === 34 && isQuote(p)) {
          quote();
        } else if (isSpace(c)) {
          pop();
          p += c === 13 && text.charCodeAt(p + 1) === 10 ? 2 : 1;
        } else {
          let q = p + 1;
          while (q < lim && !isSpace(text.charCodeAt(q))) q++;
          emit(T.Click, p, q);
        }
        return true;

      case S.callbackname:
        if (c === 40) {
          const e = at(RE_EMPTY_CALL, p);
          pop();
          if (e >= 0) p = e;
          else {
            push(S.callbackargs);
            p++;
          }
        } else emit(T.CallbackName, p, upTo('(', p));
        return true;

      case S.callbackargs:
        if (c === 41) {
          pop();
          p++;
        } else emit(T.CallbackArgs, p, upTo(')', p));
        return true;

      case S.shapeData:
        if (c === 34 && isQuote(p)) {
          push(S.shapeDataStr);
          emit(T.ShapeData, p, p + 1);
        } else if (c === 125) {
          pop();
          emit(T.ShapeDataEnd, p, p + 1);
        } else if (c === 94) {
          return false;
        } else {
          let q = p + 1;
          while (q < lim) {
            const ch = text.charCodeAt(q);
            if (hasClass(CHARS, ch, SHAPE_DATA_STOP) || (ch === 34 && isQuote(q))) break;
            q++;
          }
          emit(T.ShapeData, p, q);
        }
        return true;

      case S.shapeDataStr:
        if (c === 34 && isQuote(p)) {
          pop();
          emit(T.ShapeData, p, p + 1);
        } else emit(T.ShapeData, p, nextQuote(p));
        return true;
    }
    return false;
  };

  // v12 trimmed leading blanks (after removing comments) before lexing.
  if (graphKeyword) {
    while (p < len) {
      const h = holes[hole];
      if (h && p >= h.start) {
        if (h.kind !== 'drop') {
          w.push(
            h.kind === 'comment' ? Kind.Comment : Kind.Directive,
            h.start,
            h.end,
            src.slice(h.start, h.end)
          );
        }
        p = Math.max(p, h.end);
        hole++;
        lim = holes[hole]?.start ?? n;
      } else if (isSpace(text.charCodeAt(p))) p++;
      else break;
    }
  }
  while (true) {
    if (p >= lim) {
      const h = holes[hole];
      if (h && p >= h.start && p < n) {
        // Skip a removed span; it is trivia in the stream.
        const end = Math.max(p, h.end);
        if (h.kind !== 'drop') {
          w.push(
            h.kind === 'comment' ? Kind.Comment : Kind.Directive,
            h.start,
            end,
            src.slice(h.start, end)
          );
        }
        p = end;
        hole++;
        lim = holes[hole]?.start ?? n;
        wsFrom = wsTo = -1;
        continue;
      }
      if (p >= n) {
        // jison's <<EOF>> in states whose value rule matches the empty string.
        const kind =
          state === S.acc_title
            ? T.AccTitleValue
            : state === S.acc_descr
              ? T.AccDescrValue
              : state === S.acc_descr_multiline
                ? T.AccDescrMultilineValue
                : state === S.click
                  ? T.Click
                  : state === S.callbackname
                    ? T.CallbackName
                    : state === S.callbackargs
                      ? T.CallbackArgs
                      : -1;
        if (kind !== -1) emit(kind, len, len);
        if (state === S.INITIAL) emit(T.Eof, len, len);
        break;
      }
      lim = n;
    }
    const before = p;
    if (!step(text.charCodeAt(p)) || p === before) {
      // No rule matches: one Error token, then resume in the initial state.
      const e = Math.min(p + 1, n);
      w.push(Kind.Error, Math.min(p, len), Math.min(e, len), src.slice(p, e));
      p = e;
      stack.length = 0;
      state = S.INITIAL;
    }
  }
  return w.finish(len);
}
