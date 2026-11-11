/**
 * The text a v12 jison lexer saw, from the shared v12 source view (D114, `sourceView` in the
 * parser kit): comments and directives cut, tag quotes converted, dropped `;` cut. The diagrams
 * that run jison's rules as they are lex that text, so three more of v12's steps are applied
 * here, on a copy that keeps every character's source range: CR and CRLF read as LF, leading
 * blanks trimmed (`cleanupComments`), and `#name;` / `#123;` replaced by v12's entity
 * placeholders (`encodeEntities`). Then the `\n` v12 appended. Every step is a linear scan
 * (R-PARSE-7).
 */
import {
  CR,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LF,
  localOffset,
  QUOTE,
  SEMI,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range, TokenStream } from '@mermaid-js/core/parser-kit';

/** The text v12's lexer saw, and where each of its characters came from. */
export interface V12Text {
  /** v12's text, including the `\n` it appended (whose source range is empty, at the end). */
  text: string;
  /** Length of {@link text} without the appended `\n`. */
  length: number;
  /**
   * Source offset where `text[i]` starts, or undefined when it is `from + i` throughout. The
   * appended `\n`, and the characters after the first of an entity placeholder, are zero-width.
   */
  starts: Uint32Array | undefined;
  /** Source offset where `text[i]` ends; undefined with {@link starts}. */
  ends: Uint32Array | undefined;
  /** The source offset of `text[0]` when {@link starts} is undefined. */
  from: number;
  /** Comments and directives v12 removed, in source order (trivia). */
  holes: Hole[];
}

const PLACEHOLDER_OPEN = 'ﬂ°';
const PLACEHOLDER_CLOSE = '¶ß';

/** Characters with their source ranges. */
interface Chars {
  text: string;
  starts: Uint32Array;
  ends: Uint32Array;
}

/** Characters with their source ranges, appended in order. */
class Builder {
  private readonly parts: string[] = [];
  private starts: Uint32Array;
  private ends: Uint32Array;
  private n = 0;

  constructor(capacity: number) {
    this.starts = new Uint32Array(capacity + 1);
    this.ends = new Uint32Array(capacity + 1);
  }

  push(ch: string, start: number, end: number): void {
    if (this.n === this.starts.length) this.grow();
    this.parts.push(ch);
    this.starts[this.n] = start;
    this.ends[this.n] = end;
    this.n++;
  }

  /** Copy `c[i]`. */
  keep(c: Chars, i: number): void {
    this.push(c.text[i] ?? '', c.starts[i] ?? 0, c.ends[i] ?? 0);
  }

  done(): Chars {
    return {
      text: this.parts.join(''),
      starts: this.starts.subarray(0, this.n),
      ends: this.ends.subarray(0, this.n),
    };
  }

  private grow(): void {
    const starts = new Uint32Array(this.starts.length * 2);
    starts.set(this.starts);
    this.starts = starts;
    const ends = new Uint32Array(this.ends.length * 2);
    ends.set(this.ends);
    this.ends = ends;
  }
}

/**
 * v12's text for the body `src[from…]`, given the directive ranges v12 removed (those core's
 * preprocess found, unless the diagram reads them as v12's regex did).
 *
 * @param spread - How an entity placeholder maps to the `#` or `;` it stands for. False: its
 * first character takes that character's range and the rest are zero-width at its end, so a
 * token that splits the placeholder (after a lexical error) never shares a range with the token
 * before it. True: every character of it takes the range (a lexer whose rules never split one).
 */
export function v12Text(
  src: string,
  from: number,
  directives: readonly Range[],
  spread = false
): V12Text {
  const view = sourceView(src, from, directives);
  const holes = view.holes.filter((h) => h.kind !== 'drop' && h.start >= from);
  if (
    view.holes.length === 0 &&
    view.mask === undefined &&
    !src.includes('\r', from) &&
    !src.includes('#', from) &&
    !isSpace(src.charCodeAt(from))
  ) {
    const text = src.slice(from) + '\n';
    return { text, length: text.length - 1, starts: undefined, ends: undefined, from, holes };
  }
  const { text, mask } = view;
  const offsets = view.runs ? new SourceOffsets(view.runs) : undefined;
  const at = (i: number) => (offsets ? offsets.source(i) : i);
  const b = new Builder(text.length);
  let i = localOffset(view, from);
  // `trimStart()`, then each character with its source range.
  while (i < text.length && isSpace(text.charCodeAt(i))) i++;
  while (i < text.length) {
    const s = at(i);
    const c = text.charCodeAt(i);
    if (c === CR) {
      const crlf = text.charCodeAt(i + 1) === LF && at(i + 1) === s + 1;
      b.push('\n', s, crlf ? s + 2 : s + 1);
      i += crlf ? 2 : 1;
      continue;
    }
    b.push(((mask?.[s] ?? 0) & QUOTE) !== 0 ? "'" : (text[i] ?? ''), s, s + 1);
    i++;
  }
  const out = withEntities(b.done(), spread);
  return {
    text: out.text + '\n',
    length: out.text.length,
    starts: appendEnd(out.starts, src.length),
    ends: appendEnd(out.ends, src.length),
    from: 0,
    holes,
  };
}

function appendEnd(a: Uint32Array, end: number): Uint32Array {
  const c = new Uint32Array(a.length + 1);
  c.set(a);
  c[a.length] = end;
  return c;
}

/** A placeholder for the source character `[start, end)` (`#` or `;`); see {@link v12Text}. */
function placeholder(b: Builder, chars: string, start: number, end: number, spread: boolean): void {
  for (let k = 0; k < chars.length; k++) {
    b.push(chars[k] ?? '', spread || k === 0 ? start : end, end);
  }
}

/** Step 3's placeholders: `#name;` → `ﬂ°name¶ß`, `#123;` → `ﬂ°°123¶ß`. */
function withEntities(c: Chars, spread: boolean): Chars {
  const t = c.text;
  if (!t.includes('#')) return c;
  const b = new Builder(t.length + 8);
  for (let i = 0; i < t.length; i++) {
    let j = i + 1;
    if (t.charCodeAt(i) === HASH) while (j < t.length && isWord(t.charCodeAt(j))) j++;
    if (t.charCodeAt(i) !== HASH || j === i + 1 || t.charCodeAt(j) !== SEMI) {
      b.keep(c, i);
      continue;
    }
    let digits = true;
    for (let k = i + 1; k < j; k++) digits &&= isDigit(t.charCodeAt(k));
    const open = digits ? PLACEHOLDER_OPEN + '°' : PLACEHOLDER_OPEN;
    placeholder(b, open, c.starts[i] ?? 0, c.ends[i] ?? 0, spread);
    for (let k = i + 1; k < j; k++) b.keep(c, k);
    placeholder(b, PLACEHOLDER_CLOSE, c.starts[j] ?? 0, c.ends[j] ?? 0, spread);
    i = j;
  }
  return b.done();
}

/** A lex of v12's text: the tokens (source offsets), and each token's range in that text. */
export interface V12Lex {
  tokens: TokenStream;
  /** Start of token `i` in {@link V12Text.text}; trivia from removed spans get -1. */
  textStart: Int32Array;
  /** End of token `i` in {@link V12Text.text} (it may include the `\n` v12 appended). */
  textEnd: Int32Array;
  v12: V12Text;
}

/** Undo v12's `encodeEntities` placeholders, as v12's renderer did (`decodeEntities`). */
const decodeEntities = (text: string): string =>
  text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');

/**
 * The text of token `i` as v12's parser read it (less the `\n` v12 appended), or the source
 * text of a trivia token.
 */
export function tokenValue(l: V12Lex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return decodeEntities(l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length)));
}
