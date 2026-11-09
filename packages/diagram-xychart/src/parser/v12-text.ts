/**
 * The text v12's XY chart lexer saw, from the shared v12 source view (D114, `sourceView` in the
 * parser kit): directives cut as v12's regex reads them ({@link v12Directives}), comments cut,
 * tag quotes converted, dropped `;` cut. The XY chart lexer lexes that text with jison's rules as they are, so three more of v12's steps are applied
 * here, on a copy that keeps every character's source range: CR and CRLF read as LF, leading
 * blanks trimmed (`cleanupComments`), and `#name;` / `#123;` replaced by v12's entity
 * placeholders (`encodeEntities`; outside quotes no jison rule takes a placeholder's first
 * character, so it is a lexical error there). Then the `\n` v12 appended. Every step is a linear
 * scan (R-PARSE-7).
 *
 * A copy of diagram-quadrant's `v12-text.ts` (no cross-diagram imports; only core's T0 edits the
 * parser kit) plus {@link v12Directives}: a candidate for the kit.
 */
import {
  CR,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LF,
  localOffset,
  COLON,
  QUOTE,
  RBRACE,
  SEMI,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range } from '@mermaid-js/core/parser-kit';

/** The text v12's XY chart lexer saw, and where each of its characters came from. */
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

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

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

/** v12's text for the body `src[from…]` (the text after the front matter). */
export function v12Text(src: string, from: number): V12Text {
  const view = sourceView(src, from, v12Directives(src, from));
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
  const out = withEntities(b.done());
  return {
    text: out.text + '\n',
    length: out.text.length,
    starts: appendEnd(out.starts, src.length),
    ends: appendEnd(out.ends, src.length),
    from: 0,
    holes,
  };
}

/**
 * The spans v12's directive regex removed from the body `src[from…]`, in order:
 * `%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?`, global.
 * Core's preprocess locates the same spans for well-formed directives, but not where v12's
 * regex reads text core does not: an unclosed `%%{` (core ends it at the end of its line; v12
 * ends it after a word argument and the blanks after that, line breaks too, or else runs it
 * to the end of the text), or a word argument followed by more text before `}%%` (v12 stops
 * after the word). A non-word argument runs over line breaks up to `}%%`, a U+2028 or U+2029,
 * or the end. Linear: the scan resumes after each span.
 */
function v12Directives(src: string, from: number): Range[] {
  const out: Range[] = [];
  for (let at = src.indexOf('%%{', from); at !== -1; ) {
    const nameStart = skipBlanks(src, at + 3);
    const nameEnd = skipWord(src, nameStart);
    if (nameEnd === nameStart) {
      at = src.indexOf('%%{', at + 1);
      continue;
    }
    const colon = skipBlanks(src, nameEnd);
    let i = skipBlanks(src, src.charCodeAt(colon) === COLON ? colon + 1 : nameEnd);
    const word = skipWord(src, i);
    if (word > i) i = word;
    else {
      for (let c = src.charCodeAt(i); i < src.length; c = src.charCodeAt(++i)) {
        if (c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR) break;
        if (c === RBRACE && src.startsWith('%%', i + 1)) break;
      }
    }
    i = skipBlanks(src, i);
    if (src.charCodeAt(i) === RBRACE && src.startsWith('%%', i + 1)) i += 3;
    out.push({ start: at, end: i });
    at = src.indexOf('%%{', i);
  }
  return out;
}

/** End of the run of `\s` from `i`. */
function skipBlanks(src: string, i: number): number {
  while (i < src.length && isSpace(src.charCodeAt(i))) i++;
  return i;
}

/** End of the run of `\w` from `i`. */
function skipWord(src: string, i: number): number {
  while (i < src.length && isWord(src.charCodeAt(i))) i++;
  return i;
}

function appendEnd(a: Uint32Array, end: number): Uint32Array {
  const c = new Uint32Array(a.length + 1);
  c.set(a);
  c[a.length] = end;
  return c;
}

/**
 * A placeholder for the source character `[start, end)` (`#` or `;`): its first character takes
 * that range and the rest are zero-width at its end, so a token that splits the placeholder
 * (after a lexical error) never shares a range with the token before it.
 */
function placeholder(b: Builder, chars: string, start: number, end: number): void {
  for (let k = 0; k < chars.length; k++) b.push(chars[k] ?? '', k === 0 ? start : end, end);
}

/** Step 3's placeholders: `#name;` → `ﬂ°name¶ß`, `#123;` → `ﬂ°°123¶ß`. */
function withEntities(c: Chars): Chars {
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
    placeholder(b, open, c.starts[i] ?? 0, c.ends[i] ?? 0);
    for (let k = i + 1; k < j; k++) b.keep(c, k);
    placeholder(b, PLACEHOLDER_CLOSE, c.starts[j] ?? 0, c.ends[j] ?? 0);
    i = j;
  }
  return b.done();
}
